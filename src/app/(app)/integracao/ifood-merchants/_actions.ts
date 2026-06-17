"use server"

import { revalidatePath } from "next/cache"

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
