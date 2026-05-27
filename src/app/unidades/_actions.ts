"use server"

import { revalidatePath } from "next/cache"

import { getDefaultBrand } from "@/lib/data/units"
import { createAdminClient } from "@/lib/supabase/admin"

export type CreateUnitState = {
  ok: boolean
  message?: string
  fieldErrors?: Record<string, string>
}

const ALL_PLATFORMS = ["ifood", "99food", "keeta"] as const
type PlatformId = (typeof ALL_PLATFORMS)[number]

function cleanCnpj(cnpj: string) {
  return cnpj.replace(/\D/g, "")
}

function isValidCnpj(cnpj: string): boolean {
  const c = cleanCnpj(cnpj)
  if (c.length !== 14) return false
  if (/^(\d)\1+$/.test(c)) return false
  const calc = (slice: string, weights: number[]) => {
    const sum = slice
      .split("")
      .reduce((acc, d, i) => acc + parseInt(d, 10) * weights[i], 0)
    const mod = sum % 11
    return mod < 2 ? 0 : 11 - mod
  }
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  const d1 = calc(c.slice(0, 12), w1)
  const d2 = calc(c.slice(0, 12) + d1, w2)
  return c[12] === String(d1) && c[13] === String(d2)
}

/**
 * Gera o próximo código sequencial baseado nos códigos existentes
 * que sejam numéricos puros. Códigos não-numéricos (ex.: "TST", "JK")
 * são ignorados pra não conflitar.
 */
async function generateNextCode(
  supabase: ReturnType<typeof createAdminClient>,
): Promise<string> {
  const { data } = await supabase.from("units").select("code")
  let max = 0
  for (const row of data ?? []) {
    const n = parseInt(row.code, 10)
    if (!isNaN(n) && /^\d+$/.test(row.code)) {
      max = Math.max(max, n)
    }
  }
  return String(max + 1).padStart(2, "0")
}

export async function createUnit(
  _prevState: CreateUnitState,
  formData: FormData,
): Promise<CreateUnitState> {
  const name = String(formData.get("name") ?? "").trim()
  const city = String(formData.get("city") ?? "").trim()
  const state = String(formData.get("state") ?? "").trim().toUpperCase()
  const cnpjRaw = String(formData.get("cnpj") ?? "").trim()
  const active = formData.get("active") === "on"

  // Plataformas vêm como múltiplos checkboxes com nome="platforms"
  const platformsRaw = formData.getAll("platforms").map(String)
  const platforms: PlatformId[] = ALL_PLATFORMS.filter((p) =>
    platformsRaw.includes(p),
  )

  const fieldErrors: Record<string, string> = {}
  if (!name) fieldErrors.name = "Nome obrigatório"
  if (!city) fieldErrors.city = "Cidade obrigatória"
  if (!state || state.length !== 2)
    fieldErrors.state = "UF deve ter 2 letras"
  if (cnpjRaw && !isValidCnpj(cnpjRaw)) fieldErrors.cnpj = "CNPJ inválido"

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: "Corrija os campos destacados." }
  }

  try {
    const brand = await getDefaultBrand()
    const supabase = createAdminClient()
    const code = await generateNextCode(supabase)

    const { data: unit, error } = await supabase
      .from("units")
      .insert({
        brand_id: brand.id,
        code,
        name,
        city,
        state,
        cnpj: cnpjRaw ? cleanCnpj(cnpjRaw) : null,
        active,
      })
      .select("id")
      .single()

    if (error) {
      return { ok: false, message: error.message }
    }

    // Insere as plataformas selecionadas
    if (platforms.length > 0 && unit) {
      const { error: platErr } = await supabase.from("unit_platforms").insert(
        platforms.map((p) => ({ unit_id: unit.id, platform: p, active: true })),
      )
      if (platErr) {
        // Não impede o cadastro da unidade, só loga
        console.error("Erro ao salvar plataformas:", platErr.message)
      }
    }

    revalidatePath("/unidades")
    revalidatePath("/")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro desconhecido",
    }
  }
}

export async function deleteUnit(unitId: string): Promise<CreateUnitState> {
  if (!unitId) return { ok: false, message: "ID da unidade ausente." }
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from("units").delete().eq("id", unitId)
    if (error) return { ok: false, message: error.message }
    revalidatePath("/unidades")
    revalidatePath("/")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro desconhecido",
    }
  }
}

export async function updateUnit(
  _prevState: CreateUnitState,
  formData: FormData,
): Promise<CreateUnitState> {
  const unitId = String(formData.get("unitId") ?? "").trim()
  const name = String(formData.get("name") ?? "").trim()
  const city = String(formData.get("city") ?? "").trim()
  const state = String(formData.get("state") ?? "").trim().toUpperCase()
  const cnpjRaw = String(formData.get("cnpj") ?? "").trim()
  const active = formData.get("active") === "on"

  const platformsRaw = formData.getAll("platforms").map(String)
  const platforms: PlatformId[] = ALL_PLATFORMS.filter((p) =>
    platformsRaw.includes(p),
  )

  if (!unitId) {
    return { ok: false, message: "ID da unidade ausente." }
  }

  const fieldErrors: Record<string, string> = {}
  if (!name) fieldErrors.name = "Nome obrigatório"
  if (!city) fieldErrors.city = "Cidade obrigatória"
  if (!state || state.length !== 2)
    fieldErrors.state = "UF deve ter 2 letras"
  if (cnpjRaw && !isValidCnpj(cnpjRaw)) fieldErrors.cnpj = "CNPJ inválido"

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: "Corrija os campos destacados." }
  }

  try {
    const supabase = createAdminClient()

    const { error: updErr } = await supabase
      .from("units")
      .update({
        name,
        city,
        state,
        cnpj: cnpjRaw ? cleanCnpj(cnpjRaw) : null,
        active,
      })
      .eq("id", unitId)

    if (updErr) {
      return { ok: false, message: updErr.message }
    }

    // Sync de plataformas: delete tudo + insert as marcadas
    await supabase.from("unit_platforms").delete().eq("unit_id", unitId)
    if (platforms.length > 0) {
      await supabase.from("unit_platforms").insert(
        platforms.map((p) => ({ unit_id: unitId, platform: p, active: true })),
      )
    }

    revalidatePath("/unidades")
    revalidatePath("/")
    revalidatePath(`/unidades/[codigo]`, "page")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro desconhecido",
    }
  }
}
