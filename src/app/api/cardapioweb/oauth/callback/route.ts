/**
 * GET /api/cardapioweb/oauth/callback — volta do portal do Cardápio Web.
 *
 * Fecha o fluxo: valida o state, troca o código pelos tokens (com o PKCE
 * verifier que guardamos), cria a instalação, guarda os tokens no Vault e
 * descobre QUAL loja foi autorizada chamando GET /merchant — o Cardápio Web
 * não diz isso no callback, e o contexto da loja vem implícito no token.
 *
 * Se a loja já estava conectada, os tokens novos substituem os antigos na
 * instalação existente em vez de criar uma segunda.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import {
  salvarTokens,
  trocarCodigoPorTokens,
  type CwAmbiente,
} from "@/lib/cardapioweb/auth"
import { fetchCw } from "@/lib/cardapioweb/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Volta pra tela de importação com o resultado na query. */
function voltar(req: Request, params: Record<string, string>): Response {
  const destino = new URL("/importacao", new URL(req.url).origin)
  for (const [k, v] of Object.entries(params)) {
    destino.searchParams.set(k, v)
  }
  return Response.redirect(destino.toString(), 302)
}

type MerchantResponse = {
  id?: string | number
  name?: string
  slug?: string
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const erroPortal = url.searchParams.get("error")

  if (erroPortal) {
    // access_denied = quem autorizou não é Proprietário da loja, ou recusou.
    // O error_description costuma trazer a razão em texto — jogá-lo fora
    // (como fazíamos) apaga justamente a parte útil.
    const desc = url.searchParams.get("error_description")
    if (desc) {
      console.error("[cardapioweb] portal recusou:", erroPortal, "-", desc)
    }
    return voltar(req, {
      cw: "erro",
      motivo: erroPortal,
      ...(desc ? { detalhe: desc.slice(0, 120) } : {}),
    })
  }
  if (!code || !state) {
    return voltar(req, { cw: "erro", motivo: "callback_incompleto" })
  }

  const admin = createAdminClient()

  const { data: pendente } = await admin
    .from("cardapioweb_oauth_states")
    .select(
      "state, holding_id, unit_id, ambiente, code_verifier, expires_at, created_by",
    )
    .eq("state", state)
    .maybeSingle()

  // State é de uso único: apaga sempre, mesmo se o resto falhar depois.
  if (pendente) {
    await admin.from("cardapioweb_oauth_states").delete().eq("state", state)
  }

  if (!pendente) {
    return voltar(req, { cw: "erro", motivo: "state_invalido" })
  }
  if (new Date(pendente.expires_at).getTime() < Date.now()) {
    return voltar(req, { cw: "erro", motivo: "state_expirado" })
  }

  const ambiente = pendente.ambiente as CwAmbiente

  // 1) Código → tokens
  let tokens
  try {
    tokens = await trocarCodigoPorTokens({
      ambiente,
      code,
      codeVerifier: pendente.code_verifier,
    })
  } catch (e) {
    // A URL segue SEM material sensível: query string vaza pra histórico do
    // navegador e pra log de servidor, e a doc do Cardápio Web pede pra não
    // registrar code/verifier/token em lugar nenhum.
    //
    // Mas ficar 100% cego custou caro: uma falha aqui virava um "troca_token"
    // seco, sem nada pra investigar. Então o texto completo vai pro log do
    // servidor (Vercel), e pra URL sobe só o CÓDIGO padrão do OAuth
    // (invalid_grant, invalid_client…), que é vocabulário público da RFC 6749
    // e não identifica ninguém.
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[cardapioweb] troca de código por token falhou:", msg)
    const codigo = msg.match(/"error"\s*:\s*"([a-z_]+)"/)?.[1]
    return voltar(req, {
      cw: "erro",
      motivo: "troca_token",
      ...(codigo ? { detalhe: codigo } : {}),
    })
  }

  // 2) Cria a instalação (ainda sem merchant_id — só o token sabe qual loja é)
  const { data: novo, error: erroInsert } = await admin
    .from("cardapioweb_installs")
    .insert({
      holding_id: pendente.holding_id,
      unit_id: pendente.unit_id,
      ambiente,
      scopes: tokens.scopes,
      installed_by: pendente.created_by ?? null,
    })
    .select("id")
    .single()

  if (erroInsert || !novo) {
    return voltar(req, { cw: "erro", motivo: "criar_instalacao" })
  }

  let installId = novo.id as string

  try {
    await salvarTokens(installId, tokens)
  } catch {
    await admin.from("cardapioweb_installs").delete().eq("id", installId)
    return voltar(req, { cw: "erro", motivo: "guardar_token" })
  }

  // 3) Descobre a loja autorizada
  const merchant = await fetchCw<MerchantResponse>({
    installId,
    ambiente,
    path: "/api/partner/v1/merchant",
    tier: "lento",
    endpointLabel: "GET /merchant",
  })

  if (!merchant.ok || !merchant.data?.id) {
    // Token válido mas não conseguimos identificar a loja — deixa a
    // instalação inativa pra não entrar no cron sem saber o que é.
    await admin
      .from("cardapioweb_installs")
      .update({
        active: false,
        inactive_reason: `Não consegui ler GET /merchant (HTTP ${merchant.status})`,
      })
      .eq("id", installId)
    return voltar(req, { cw: "erro", motivo: "merchant_indisponivel" })
  }

  const merchantId = String(merchant.data.id)
  const merchantName = merchant.data.name ?? null

  // 4) Já existia instalação pra essa loja? Reaproveita e descarta a nova.
  const { data: existente } = await admin
    .from("cardapioweb_installs")
    .select("id")
    .eq("ambiente", ambiente)
    .eq("merchant_id", merchantId)
    .neq("id", installId)
    .maybeSingle()

  if (existente) {
    await salvarTokens(existente.id as string, tokens)
    await admin
      .from("cardapioweb_installs")
      .update({
        active: true,
        inactive_reason: null,
        scopes: tokens.scopes,
        merchant_name: merchantName,
        unit_id: pendente.unit_id ?? undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existente.id)
    await admin.from("cardapioweb_installs").delete().eq("id", installId)
    installId = existente.id as string
  } else {
    await admin
      .from("cardapioweb_installs")
      .update({
        merchant_id: merchantId,
        merchant_name: merchantName,
        merchant_slug: merchant.data.slug ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", installId)
  }

  // 5) Prepara o estado de sync (o job de pedidos lê daqui)
  await admin
    .from("cardapioweb_sync_state")
    .upsert({ install_id: installId }, { onConflict: "install_id" })

  return voltar(req, {
    cw: "ok",
    loja: merchantName ?? merchantId,
  })
}
