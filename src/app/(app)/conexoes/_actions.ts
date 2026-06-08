"use server"

import { createHash, randomBytes } from "node:crypto"

import { revalidatePath } from "next/cache"

import { requireModulePermission, requireSuperadmin } from "@/lib/auth/guards"
import { syncNinefoodBillRange } from "@/lib/ninefood/sync"

export type CreateKeyState = {
  ok: boolean
  /** Texto puro da chave — só retornado UMA vez, logo após criar. */
  key?: string
  message?: string
}

/**
 * Cria uma chave de API. Gera o texto puro, guarda só o hash (SHA-256) e
 * devolve o texto puro UMA vez pro admin copiar. Só admin pode criar.
 */
export async function createApiKey(
  _prev: CreateKeyState,
  formData: FormData,
): Promise<CreateKeyState> {
  try {
    const { admin } = await requireModulePermission("conexoes", "edit")
    const name = String(formData.get("name") ?? "").trim()
    const scope = String(formData.get("scope") ?? "read").trim()
    if (!name) return { ok: false, message: "Dê um nome pra chave." }
    if (scope !== "read" && scope !== "write") {
      return { ok: false, message: "Escopo inválido." }
    }

    const raw = randomBytes(24).toString("base64url")
    const key = `cz_live_${raw}`
    const keyHash = createHash("sha256").update(key).digest("hex")
    const keyPrefix = key.slice(0, 14)

    const { error } = await admin.from("api_clients").insert({
      name,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      scopes: [scope],
      active: true,
    })
    if (error) return { ok: false, message: error.message }

    revalidatePath("/conexoes")
    return { ok: true, key }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Erro ao criar a chave.",
    }
  }
}

/** Revoga (desativa) uma chave. Só admin. */
export async function revokeApiKey(
  id: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const { admin } = await requireModulePermission("conexoes", "edit")
    if (!id) return { ok: false, message: "Chave inválida." }
    const { error } = await admin
      .from("api_clients")
      .update({ active: false })
      .eq("id", id)
    if (error) return { ok: false, message: error.message }
    revalidatePath("/conexoes")
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Erro ao revogar.",
    }
  }
}

// ───────────────────────── 99 Food (sync financeiro) ────────────────────────

export type SetStoreIdState = { ok: boolean; message?: string }

/** Define/atualiza o app_shop_id (acceptor_code) do 99 numa unidade. */
export async function setNinefoodStoreId(
  formData: FormData,
): Promise<SetStoreIdState> {
  try {
    const { admin } = await requireSuperadmin()
    const unitId = String(formData.get("unitId") ?? "").trim()
    const appShopId = String(formData.get("appShopId") ?? "").trim()
    if (!unitId) return { ok: false, message: "Unidade inválida." }
    const { error } = await admin
      .from("unit_platforms")
      .update({ api_store_id: appShopId || null })
      .eq("unit_id", unitId)
      .eq("platform", "99food")
    if (error) return { ok: false, message: error.message }
    revalidatePath("/conexoes")
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}

export type SyncNinefoodState = {
  ok: boolean
  message?: string
  fetched?: number
  upserted?: number
  liquido?: number
}

/** Roda a sincronização do extrato do 99 de uma unidade num mês. */
export async function syncNinefoodUnit(
  formData: FormData,
): Promise<SyncNinefoodState> {
  try {
    const { admin } = await requireSuperadmin()
    const unitId = String(formData.get("unitId") ?? "").trim()
    const year = Number(formData.get("year"))
    const month = Number(formData.get("month"))
    if (!unitId || !year || !month) {
      return { ok: false, message: "Parâmetros inválidos." }
    }
    const { data: up } = await admin
      .from("unit_platforms")
      .select("api_store_id")
      .eq("unit_id", unitId)
      .eq("platform", "99food")
      .maybeSingle()
    const appShopId = up?.api_store_id
    if (!appShopId) {
      return { ok: false, message: "Defina o app_shop_id da loja primeiro." }
    }
    const mm = String(month).padStart(2, "0")
    const lastDay = new Date(year, month, 0).getDate()
    const startDate = `${year}${mm}01`
    const endDate = `${year}${mm}${String(lastDay).padStart(2, "0")}`

    const r = await syncNinefoodBillRange({ unitId, appShopId, startDate, endDate })
    revalidatePath("/conexoes")
    return {
      ok: true,
      fetched: r.fetched,
      upserted: r.upserted,
      liquido: r.liquidoTotal,
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro." }
  }
}
