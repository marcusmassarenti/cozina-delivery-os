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
      cnpj: m.documents?.CNPJ?.value ?? null,
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
  const { error } = await admin
    .from("ifood_activation_requests")
    .update({ status, nota, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { ok: false, error: error.message }

  revalidatePath("/integracao/ifood-merchants")
  revalidatePath("/importacao")
  return { ok: true, message: "Status atualizado." }
}
