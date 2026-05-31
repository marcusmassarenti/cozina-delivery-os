"use server"

import { revalidatePath, revalidateTag } from "next/cache"

import { requireAuth } from "@/lib/auth/guards"
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

/** "YYYY-MM-DD" válido → mantém; vazio/ inválido → null. */
function dateOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
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
  const dataInauguracao = dateOrNull(formData.get("data_inauguracao"))
  const dataEncerramento = dateOrNull(formData.get("data_encerramento"))

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
    await requireAuth()
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
        data_inauguracao: dataInauguracao,
        data_encerramento: dataEncerramento,
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

    revalidateTag("units", "max")
    revalidateTag("reports", "max")
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
    await requireAuth()
    const supabase = createAdminClient()
    const { error } = await supabase.from("units").delete().eq("id", unitId)
    if (error) return { ok: false, message: error.message }
    revalidateTag("units", "max")
    revalidateTag("reports", "max")
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
  const dataInauguracao = dateOrNull(formData.get("data_inauguracao"))
  const dataEncerramento = dateOrNull(formData.get("data_encerramento"))

  const platformsRaw = formData.getAll("platforms").map(String)
  const platforms: PlatformId[] = ALL_PLATFORMS.filter((p) =>
    platformsRaw.includes(p),
  )

  // IDs externos por plataforma (ifoodStoreId, _99foodStoreId, keetaStoreId)
  const ifoodStoreId =
    String(formData.get("ifoodStoreId") ?? "").trim() || null
  const _99foodStoreId =
    String(formData.get("_99foodStoreId") ?? "").trim() || null
  const keetaStoreId =
    String(formData.get("keetaStoreId") ?? "").trim() || null
  const inaugByPlatform: Partial<Record<PlatformId, string | null>> = {
    ifood: dateOrNull(formData.get("ifoodInauguracao")),
    "99food": dateOrNull(formData.get("_99foodInauguracao")),
    keeta: dateOrNull(formData.get("keetaInauguracao")),
  }

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
    await requireAuth()
    const supabase = createAdminClient()

    const { error: updErr } = await supabase
      .from("units")
      .update({
        name,
        city,
        state,
        cnpj: cnpjRaw ? cleanCnpj(cnpjRaw) : null,
        active,
        data_inauguracao: dataInauguracao,
        data_encerramento: dataEncerramento,
      })
      .eq("id", unitId)

    if (updErr) {
      return { ok: false, message: updErr.message }
    }

    // Sync de plataformas:
    // - Mantém external_store_id já existente (a menos que o form sobrescreva)
    // - Adiciona linhas pras plataformas marcadas
    // - Remove linhas das plataformas desmarcadas
    const externalIdByPlatform: Partial<Record<PlatformId, string | null>> = {
      ifood: ifoodStoreId,
      "99food": _99foodStoreId,
      keeta: keetaStoreId,
    }

    // Pega os atuais (pra preservar external_store_id se o form não veio)
    const { data: existingRows } = await supabase
      .from("unit_platforms")
      .select("platform, external_store_id")
      .eq("unit_id", unitId)
    const existingMap = new Map(
      (existingRows ?? []).map((r) => [
        r.platform as PlatformId,
        r.external_store_id as string | null,
      ]),
    )

    await supabase.from("unit_platforms").delete().eq("unit_id", unitId)
    if (platforms.length > 0) {
      await supabase.from("unit_platforms").insert(
        platforms.map((p) => ({
          unit_id: unitId,
          platform: p,
          active: true,
          // Preferência: o que veio no form > o que já tinha
          external_store_id:
            externalIdByPlatform[p] !== undefined &&
            externalIdByPlatform[p] !== null
              ? externalIdByPlatform[p]
              : existingMap.get(p) ?? null,
          // Inauguração por plataforma (o form vem pré-preenchido).
          data_inauguracao: inaugByPlatform[p] ?? null,
        })),
      )
    }

    revalidateTag("units", "max")
    revalidateTag("reports", "max")
    revalidatePath("/unidades")
    revalidatePath("/")
    revalidatePath("/importacao")
    revalidatePath(`/unidades/[codigo]`, "page")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro desconhecido",
    }
  }
}
