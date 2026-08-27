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
import { after } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  salvarTokens,
  trocarCodigoPorTokens,
  type CwAmbiente,
} from "@/lib/cardapioweb/auth"
import { fetchCw } from "@/lib/cardapioweb/client"
import { avisarInstalacaoNova } from "@/lib/cardapioweb/avisar-instalacao"
import { vincularSeObvio } from "@/lib/cardapioweb/vincular-automatico"
import { sincronizarInstall } from "@/lib/cardapioweb/sync"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// A primeira fatia de sync roda depois da resposta (ver passo 7) e precisa de
// fôlego: o redirect sai na hora, a function é que fica viva mais um pouco.
export const maxDuration = 120

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
    // 4b) Merchant NOVO numa loja que já tem outro conectado.
    //
    // O passo 4 acima só junta instalação do MESMO merchant — e está certo:
    // do lado do Cardápio Web são lojas distintas. Mas nada impedia dois
    // cardápios diferentes ficarem ativos sobre a MESMA unidade daqui.
    //
    // Aconteceu de verdade em 05/08/26: a loja do João Nilson já estava no
    // merchant 10569 e alguém autorizou o 4608, chamado "Nil cardapio Não
    // apagar ou modificar" -- um modelo, não a loja. A segunda instalação
    // rodou no cron por 3 dias, gastou chamada e nunca trouxe um pedido,
    // porque o cardápio-modelo não tem venda. Ninguém percebeu: nenhuma tela
    // dizia que havia duas.
    //
    // Não dá pra escolher sozinho qual vale -- trocar de cardápio é operação
    // legítima, e adivinhar errado apagaria o histórico bom. Então a nova
    // nasce INATIVA (fora do cron, sem gastar nada) e a tela explica.
    if (pendente.unit_id) {
      const { data: jaConectada } = await admin
        .from("cardapioweb_installs")
        .select("merchant_name, merchant_id")
        .eq("unit_id", pendente.unit_id)
        .eq("ambiente", ambiente)
        .eq("active", true)
        .not("merchant_id", "is", null)
        .neq("id", installId)
        // limit(1) e não maybeSingle() puro: se por qualquer motivo já
        // existirem duas ativas, maybeSingle() estoura -- justamente no caso
        // que esta trava existe pra tratar. Qualquer uma serve pra mensagem.
        .order("created_at")
        .limit(1)
        .maybeSingle()

      if (jaConectada) {
        await admin
          .from("cardapioweb_installs")
          .update({
            merchant_id: merchantId,
            merchant_name: merchantName,
            merchant_slug: merchant.data.slug ?? null,
            active: false,
            inactive_reason: `Esta loja já está conectada ao cardápio "${jaConectada.merchant_name ?? jaConectada.merchant_id}". Desconecte o antigo antes de trocar.`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", installId)
        return voltar(req, {
          cw: "erro",
          motivo: "loja_ja_conectada",
          detalhe: jaConectada.merchant_name ?? String(jaConectada.merchant_id),
        })
      }
    }

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

  // 5.5) Vincula à loja quando não há dúvida (empresa com uma loja só).
  //
  // Aqui, e não antes do insert, porque o nome do merchant só existe depois do
  // passo 3 — sem ele o log não diz qual loja foi vinculada. E ANTES do aviso
  // do passo 6, pra que o e-mail já mostre a unidade em vez de "sem unidade
  // vinculada": foi exatamente o que o aviso da primeira conexão de produção
  // (joao nilson, 04/ago/26) dizia, com a loja bem ali, óbvia.
  const unitIdAuto = pendente.unit_id
    ? null
    : await vincularSeObvio(installId).catch((e: unknown) => {
        console.error("cardapioweb: vínculo automático", e)
        return null
      })

  // 6) Avisa que entrou loja nova.
  //
  // Diferente do iFood, a conexão do Cardápio Web acontece INTEIRA do lado do
  // cliente: ele autoriza e pronto, sem passar por ninguém aqui. Sem este
  // aviso, a única forma de descobrir é alguém abrir a tela — e com trinta
  // clientes isso vira conexão que existe e ninguém sabe.
  //
  // Só na primeira vez: reconectar a mesma loja (token renovado, autorização
  // refeita) não é notícia, e avisar de novo ensinaria a ignorar o aviso.
  if (!existente) {
    void avisarInstalacaoNova({
      merchantName: merchantName ?? merchantId,
      ambiente,
      unitId: pendente.unit_id ?? unitIdAuto,
      holdingId: pendente.holding_id ?? null,
    }).catch((e: unknown) => console.error("cardapioweb: aviso de instalação", e))
  }

  // 7) Puxa a primeira fatia de dados sem segurar o redirect.
  //
  // O cron diário completaria o histórico sozinho, mas quem conecta às 15h
  // esperaria até o meio-dia seguinte pra ver QUALQUER coisa — e o lojista
  // acabou de autorizar justamente pra ver os números dele. Uma fatia aqui
  // (pedidos recentes + a primeira janela de 30 dias + um lote de detalhe)
  // faz a tela já ter faturamento em poucos minutos; o resto do ano vem nas
  // rodadas seguintes do cron.
  //
  // `after` mantém a function viva DEPOIS da resposta: o navegador do
  // lojista não fica preso esperando o sync terminar.
  const idParaSync = installId
  after(async () => {
    /**
     * ⚠️ VÁRIAS FATIAS, NÃO UMA.
     *
     * ── POR QUE (Marcus, 27/08/26) ──────────────────────────────────────
     * Era uma chamada só, e cada fatia detalha no máximo 80 pedidos. Isso
     * bastava pra loja pequena (Goiânia conectou com 22 e nasceu completa) e
     * falhava justamente nas que importam: Dourados nasceu com 145 pedidos
     * SEM VALOR e Varginha com 95. As duas ficaram zeradas na tela até alguém
     * rodar o sync à mão — e loja zerada some do ranking, que filtra
     * `bruto > 0`. O lojista que abre o painel logo depois de autorizar vê
     * zero e conclui que não funcionou.
     *
     * O laço para no primeiro dos três: nada mais a detalhar, orçamento de
     * tempo estourado, ou teto de fatias. O `maxDuration` desta rota é 120 s,
     * então o orçamento fica em 90 — o que sobra é do cron, que continua
     * existindo pra fechar o resto do histórico.
     */
    const COMECOU = Date.now()
    const ORCAMENTO_MS = 90_000
    const TETO_FATIAS = 8
    try {
      for (let n = 1; n <= TETO_FATIAS; n++) {
        const r = await sincronizarInstall(idParaSync)
        console.log(
          `[cw-primeiro-sync] ${r.loja} fatia ${n}: ${r.incremental?.pedidos ?? 0} recentes, ` +
            `${r.backfill?.pedidos ?? 0} do histórico, ${r.detalhe?.processados ?? 0} detalhados, ` +
            `${r.detalhe?.restantes ?? 0} restantes`,
        )
        if (r.erro) break
        // Nada detalhado E nada restando = não há mais o que fazer agora.
        if ((r.detalhe?.restantes ?? 0) === 0 && (r.detalhe?.processados ?? 0) === 0) break
        if (Date.now() - COMECOU > ORCAMENTO_MS) {
          console.log(`[cw-primeiro-sync] ${r.loja}: orçamento de tempo esgotado, o cron continua`)
          break
        }
      }
    } catch (e) {
      // Falhar aqui não quebra a conexão — o cron tenta de novo amanhã.
      console.error("[cw-primeiro-sync]", e)
    }
  })

  return voltar(req, {
    cw: "ok",
    loja: merchantName ?? merchantId,
  })
}
