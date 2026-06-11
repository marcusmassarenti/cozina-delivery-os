"use server"

import { createHash, randomBytes } from "node:crypto"

import { revalidatePath } from "next/cache"

import { requireModulePermission, requireSuperadmin } from "@/lib/auth/guards"

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

// (Sync financeiro do 99 movido pra /importação — ver NinefoodSyncCard.)
