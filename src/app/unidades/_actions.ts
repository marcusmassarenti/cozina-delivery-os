"use server"

import { revalidatePath } from "next/cache"

import { getDefaultBrand } from "@/lib/data/units"
import { createAdminClient } from "@/lib/supabase/admin"

export type CreateUnitState = {
  ok: boolean
  message?: string
  fieldErrors?: Record<string, string>
}

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

export async function createUnit(
  _prevState: CreateUnitState,
  formData: FormData,
): Promise<CreateUnitState> {
  const code = String(formData.get("code") ?? "").trim()
  const name = String(formData.get("name") ?? "").trim()
  const city = String(formData.get("city") ?? "").trim()
  const state = String(formData.get("state") ?? "").trim().toUpperCase()
  const cnpjRaw = String(formData.get("cnpj") ?? "").trim()
  const active = formData.get("active") === "on"

  const fieldErrors: Record<string, string> = {}
  if (!code) fieldErrors.code = "Código obrigatório"
  if (!name) fieldErrors.name = "Nome obrigatório"
  if (!city) fieldErrors.city = "Cidade obrigatória"
  if (!state || state.length !== 2)
    fieldErrors.state = "UF deve ter 2 letras"
  if (cnpjRaw && !isValidCnpj(cnpjRaw))
    fieldErrors.cnpj = "CNPJ inválido"

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: "Corrija os campos destacados." }
  }

  try {
    const brand = await getDefaultBrand()
    const supabase = createAdminClient()
    const { error } = await supabase.from("units").insert({
      brand_id: brand.id,
      code,
      name,
      city,
      state,
      cnpj: cnpjRaw ? cleanCnpj(cnpjRaw) : null,
      active,
    })
    if (error) {
      if (error.code === "23505") {
        return {
          ok: false,
          fieldErrors: { code: "Já existe unidade com esse código" },
          message: "Código duplicado.",
        }
      }
      return { ok: false, message: error.message }
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
