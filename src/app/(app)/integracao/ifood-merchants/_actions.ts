"use server"

import { revalidatePath } from "next/cache"

import { requireSuperadmin } from "@/lib/auth/guards"
import {
  listIfoodMerchants,
  type IfoodMerchant,
} from "@/lib/ifood/merchants"
import { createAdminClient } from "@/lib/supabase/admin"

export type RefreshMerchantsState = {
  ok: boolean
  count?: number
  status?: number
  error?: string
}

/**
 * Re-puxa merchants da Merchant API + UPSERT na cache local (`ifood_merchants`).
 * Funciona como "F5" da listagem.
 */
export async function refreshMerchants(
  _prev: RefreshMerchantsState,
  _formData: FormData,
): Promise<RefreshMerchantsState> {
  try {
    const r = await listIfoodMerchants()
    if (!r.ok || !r.data) {
      revalidatePath("/integracao/ifood-merchants")
      return {
        ok: false,
        status: r.status,
        error: r.error ?? `HTTP ${r.status}`,
      }
    }
    const admin = createAdminClient()
    const rows = (r.data as IfoodMerchant[]).map((m) => ({
      id: m.id,
      name: m.name ?? null,
      corporate_name: m.corporateName ?? null,
      // NÃO grava cnpj aqui: a Merchant API não devolve documents/CNPJ, então
      // isso sempre viria null e APAGARIA o CNPJ que o auto-vínculo descobriu
      // pela Conciliação (que é a única fonte real). Só preenche se vier algo.
      ...(m.documents?.CNPJ?.value
        ? { cnpj: m.documents.CNPJ.value }
        : {}),
      city: m.address?.city ?? null,
      state: m.address?.state ?? null,
      merchant_state: m.merchantState ?? null,
      raw: m as unknown as object,
      last_seen_at: new Date().toISOString(),
    }))
    if (rows.length > 0) {
      await admin
        .from("ifood_merchants")
        .upsert(rows, { onConflict: "id", ignoreDuplicates: false })
    }
    revalidatePath("/integracao/ifood-merchants")
    return { ok: true, status: r.status, count: r.data.length }
  } catch (e) {
    revalidatePath("/integracao/ifood-merchants")
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

export type LinkMerchantState = {
  ok: boolean
  message?: string
  error?: string
}

/**
 * Vincula um merchant do iFood a uma unidade da rede.
 * UPSERT em unit_platforms (unit_id, platform='ifood'):
 *   - Se a row não existe, cria com active=true e api_store_id setado.
 *   - Se existe, só atualiza api_store_id.
 */
export async function linkMerchantToUnit(
  _prev: LinkMerchantState,
  formData: FormData,
): Promise<LinkMerchantState> {
  const merchantId = String(formData.get("merchantId") ?? "").trim()
  const unitId = String(formData.get("unitId") ?? "").trim()
  if (!merchantId) return { ok: false, error: "merchantId ausente" }
  if (!unitId) return { ok: false, error: "Selecione uma unidade" }

  try {
    const admin = createAdminClient()
    const { error } = await admin.from("unit_platforms").upsert(
      {
        unit_id: unitId,
        platform: "ifood",
        active: true,
        api_store_id: merchantId,
      },
      { onConflict: "unit_id,platform", ignoreDuplicates: false },
    )
    if (error) return { ok: false, error: error.message }
    revalidatePath("/integracao/ifood-merchants")
    return { ok: true, message: "Vinculado!" }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/** Remove o vínculo (zera o api_store_id, mantém active da unit_platforms). */
export async function unlinkMerchant(
  _prev: LinkMerchantState,
  formData: FormData,
): Promise<LinkMerchantState> {
  const merchantId = String(formData.get("merchantId") ?? "").trim()
  if (!merchantId) return { ok: false, error: "merchantId ausente" }
  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from("unit_platforms")
      .update({ api_store_id: null })
      .eq("platform", "ifood")
      .eq("api_store_id", merchantId)
    if (error) return { ok: false, error: error.message }
    revalidatePath("/integracao/ifood-merchants")
    return { ok: true, message: "Desvinculado." }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

// ─── Fila de solicitações de ativação (autoatendimento dos clientes) ────

export type SolicitacaoUpdateState = {
  ok: boolean
  error?: string
  message?: string
}

/**
 * Atualiza o status de uma solicitação de conexão iFood.
 *
 * pendente → solicitada: você enviou a solicitação no Portal do
 * Desenvolvedor (aba Permissões, busca por CNPJ) — o cliente passa a ver
 * "aprove no seu Portal do Parceiro".
 * solicitada → ativa: a loja apareceu no GET /merchants e foi vinculada.
 * → recusada: use a nota pra explicar (aparece pro cliente).
 */
export async function atualizarSolicitacaoIfood(
  _prev: SolicitacaoUpdateState,
  formData: FormData,
): Promise<SolicitacaoUpdateState> {
  try {
    await requireSuperadmin()
  } catch {
    return { ok: false, error: "Apenas o admin da plataforma." }
  }

  const id = String(formData.get("id") ?? "").trim()
  const status = String(formData.get("status") ?? "").trim()
  const nota = String(formData.get("nota") ?? "").trim() || null

  if (!id) return { ok: false, error: "id ausente" }
  if (!["pendente", "solicitada", "ativa", "recusada"].includes(status)) {
    return { ok: false, error: "status inválido" }
  }

  const admin = createAdminClient()

  // GUARDA: "ativa" significa loja CONECTADA. Este botão só fecha a
  // solicitação — quem cria o vínculo é a tabela de merchants abaixo (ou o
  // auto-vínculo). Sem esta checagem dava pra marcar ativa sem vínculo
  // nenhum: a fila dizia "conectada", o cliente via "sua loja foi
  // conectada" e o sync nunca puxava nada. Aconteceu de verdade com 4
  // lojas da DG Foods (23/jul).
  if (status === "ativa") {
    const { data: req } = await admin
      .from("ifood_activation_requests")
      .select("unit_id")
      .eq("id", id)
      .maybeSingle()
    const unitId = (req?.unit_id as string | null) ?? null
    if (!unitId) {
      return {
        ok: false,
        error: "Solicitação sem unidade — não dá pra ativar.",
      }
    }
    const { data: vinc } = await admin
      .from("unit_platforms")
      .select("api_store_id")
      .eq("unit_id", unitId)
      .eq("platform", "ifood")
      .maybeSingle()
    if (!vinc?.api_store_id) {
      return {
        ok: false,
        error:
          "Esta loja ainda NÃO está vinculada a um merchant. Vincule na tabela abaixo (escolher unidade → Vincular) e depois ative.",
      }
    }
  }

  // Guarda de onde veio, pro Desfazer restaurar o passo certo da fila.
  const { data: atual } = await admin
    .from("ifood_activation_requests")
    .select("status")
    .eq("id", id)
    .maybeSingle()

  const { error } = await admin
    .from("ifood_activation_requests")
    .update({
      status,
      nota,
      status_anterior: (atual?.status as string | null) ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  revalidatePath("/integracao/ifood-merchants")
  revalidatePath("/importacao")
  return { ok: true, message: "Status atualizado." }
}

/**
 * Desfaz a última mudança de status, voltando ao passo anterior da fila.
 *
 * Existe porque "Recusar" fica colado em "Loja vinculada — ativar" e um
 * clique errado matava a conexão em silêncio: recusada some do aviso da home
 * do cliente, então ele para de ser lembrado de aprovar no Portal do Parceiro.
 *
 * Restaura `status_anterior` em vez de assumir um valor — a recusa pode ter
 * vindo de 'pendente' (antes de eu abrir o portal) ou de 'solicitada' (já
 * pedi, faltava ele aprovar), e voltar pro passo errado confunde os dois lados.
 */
export async function desfazerStatusIfood(
  _prev: SolicitacaoUpdateState,
  formData: FormData,
): Promise<SolicitacaoUpdateState> {
  try {
    await requireSuperadmin()
  } catch {
    return { ok: false, error: "Apenas o admin da plataforma." }
  }

  const id = String(formData.get("id") ?? "").trim()
  if (!id) return { ok: false, error: "id ausente" }

  const admin = createAdminClient()
  const { data: req } = await admin
    .from("ifood_activation_requests")
    .select("status, status_anterior")
    .eq("id", id)
    .maybeSingle()

  if (!req) return { ok: false, error: "Solicitação não encontrada." }

  // Sem histórico (recusa anterior a esta funcionalidade) volta pro INÍCIO da
  // fila, não pro passo que eu acharia provável. 'pendente' custa um clique a
  // mais se a solicitação no portal já tinha sido feita, mas não inventa um
  // estado — e enganar sobre "já pedi no portal" trava os dois lados esperando
  // um do outro.
  const anterior = (req.status_anterior as string | null) ?? "pendente"

  const { error } = await admin
    .from("ifood_activation_requests")
    .update({
      status: anterior,
      // A nota do passo desfeito vai junto: ela é o texto que o CLIENTE lê
      // ("não foi possível localizar a loja..."). Deixar para trás uma
      // explicação de recusa numa solicitação que voltou pra fila diria a ele
      // o oposto do que está acontecendo.
      nota: null,
      // Sem encadear desfazer: o passo anterior do passo anterior não é
      // guardado, e restaurar um valor velho daria a impressão de histórico
      // completo que não existe.
      status_anterior: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  revalidatePath("/integracao/ifood-merchants")
  revalidatePath("/importacao")
  return { ok: true, message: `Voltou para "${anterior}".` }
}

// ─── Habilitação POR APP (financeiro vs avaliações) ─────────────────────

export type AppHabilitadoState = {
  ok: boolean
  message?: string
  error?: string
}

/**
 * Marca/desmarca o "OK do admin" de um dos apps do iFood para uma loja.
 *
 * Por que existe: o vínculo (`api_store_id`) é único, mas cada app é
 * autorizado SEPARADAMENTE pelo lojista no Portal do Parceiro — dá pra ter o
 * financeiro funcionando e as avaliações voltando 403 (caso DG Foods). Este é
 * o passo final do processo: cliente manda o CNPJ → admin cadastra/vincula →
 * cliente autoriza os 2 apps no portal → admin confirma AQUI, um por um.
 */
export async function setAppHabilitado(
  _prev: AppHabilitadoState,
  formData: FormData,
): Promise<AppHabilitadoState> {
  await requireSuperadmin()
  const unitId = String(formData.get("unitId") ?? "").trim()
  const app = String(formData.get("app") ?? "").trim()
  const ligar = String(formData.get("ligar") ?? "") === "1"
  if (!unitId) return { ok: false, error: "unitId ausente" }
  if (app !== "financeiro" && app !== "avaliacoes") {
    return { ok: false, error: "app inválido" }
  }

  const coluna = app === "financeiro" ? "fin_enabled_at" : "review_enabled_at"
  const admin = createAdminClient()
  const { error } = await admin
    .from("unit_platforms")
    .update({ [coluna]: ligar ? new Date().toISOString() : null })
    .eq("unit_id", unitId)
    .eq("platform", "ifood")
  if (error) return { ok: false, error: error.message }

  revalidatePath("/integracao/ifood-merchants")
  revalidatePath("/importacao")
  return {
    ok: true,
    message: ligar ? "Habilitado!" : "Desabilitado.",
  }
}
