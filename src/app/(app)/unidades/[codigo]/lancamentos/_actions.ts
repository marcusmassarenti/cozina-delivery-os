"use server"

import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"

export type ActionState = {
  ok: boolean
  message?: string
}

type PlatformDailyEntry = {
  platform: "ifood" | "99food" | "keeta"
  pedidos: number
  cancelados: number
  faturamento: number
}

const PLATFORMS = ["ifood", "99food", "keeta"] as const
type Platform = (typeof PLATFORMS)[number]

function parseNumber(v: FormDataEntryValue | null): number {
  const s = String(v ?? "").replace(/\./g, "").replace(",", ".").trim()
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

function parseInteger(v: FormDataEntryValue | null): number {
  const s = String(v ?? "").replace(/\D/g, "")
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : 0
}

export async function saveDailyEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const unitId = String(formData.get("unitId") ?? "").trim()
  const date = String(formData.get("date") ?? "").trim()
  if (!unitId || !date) return { ok: false, message: "Dados inválidos." }

  const platforms: PlatformDailyEntry[] = PLATFORMS.map((p) => ({
    platform: p,
    pedidos: parseInteger(formData.get(`${p}_pedidos`)),
    cancelados: parseInteger(formData.get(`${p}_cancelados`)),
    faturamento: parseNumber(formData.get(`${p}_faturamento`)),
  }))

  try {
    const supabase = createAdminClient()
    const rows = platforms.map((p) => ({
      unit_id: unitId,
      date,
      platform: p.platform,
      pedidos: p.pedidos,
      cancelados: p.cancelados,
      faturamento: p.faturamento,
      updated_at: new Date().toISOString(),
    }))
    const { error } = await supabase
      .from("daily_entries")
      .upsert(rows, { onConflict: "unit_id,date,platform" })
    if (error) return { ok: false, message: error.message }

    revalidatePath("/unidades/[codigo]/lancamentos", "page")
    revalidatePath("/")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro desconhecido",
    }
  }
}

export async function deleteDailyEntry(
  unitId: string,
  date: string,
): Promise<ActionState> {
  if (!unitId || !date) return { ok: false, message: "Dados inválidos." }
  try {
    const supabase = createAdminClient()
    const { error } = await supabase
      .from("daily_entries")
      .delete()
      .eq("unit_id", unitId)
      .eq("date", date)
    if (error) return { ok: false, message: error.message }
    revalidatePath("/unidades/[codigo]/lancamentos", "page")
    revalidatePath("/")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro desconhecido",
    }
  }
}

export async function saveMonthlyEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const unitId = String(formData.get("unitId") ?? "").trim()
  const year = parseInteger(formData.get("year"))
  const month = parseInteger(formData.get("month"))
  if (!unitId || !year || !month)
    return { ok: false, message: "Dados inválidos." }

  // Geral
  const general = {
    unit_id: unitId,
    year,
    month,
    custo_produtos_cozina: parseNumber(formData.get("custo_produtos_cozina")),
    custo_produtos_loja: parseNumber(formData.get("custo_produtos_loja")),
    clientes_novos: parseInteger(formData.get("clientes_novos")),
    nota_media: parseNumber(formData.get("nota_media")),
    observacoes: String(formData.get("observacoes") ?? "").trim(),
    updated_at: new Date().toISOString(),
  }

  // Por plataforma
  const platformRows = PLATFORMS.map((p: Platform) => ({
    unit_id: unitId,
    year,
    month,
    platform: p,
    taxa_entrega: parseNumber(formData.get(`${p}_taxa_entrega`)),
    promocoes: parseNumber(formData.get(`${p}_promocoes`)),
    taxa_comissao: parseNumber(formData.get(`${p}_taxa_comissao`)),
    servicos_logisticos: parseNumber(formData.get(`${p}_servicos_logisticos`)),
    outros_descontos: parseNumber(formData.get(`${p}_outros_descontos`)),
    vr_recebido: parseNumber(formData.get(`${p}_vr_recebido`)),
    cancelamentos_reembolsos: parseNumber(
      formData.get(`${p}_cancelamentos_reembolsos`),
    ),
    updated_at: new Date().toISOString(),
  }))

  try {
    const supabase = createAdminClient()

    const { error: gErr } = await supabase
      .from("monthly_entries")
      .upsert(general, { onConflict: "unit_id,year,month" })
    if (gErr) return { ok: false, message: gErr.message }

    const { error: pErr } = await supabase
      .from("monthly_platform_entries")
      .upsert(platformRows, { onConflict: "unit_id,year,month,platform" })
    if (pErr) return { ok: false, message: pErr.message }

    revalidatePath("/unidades/[codigo]/lancamentos", "page")
    revalidatePath("/")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro desconhecido",
    }
  }
}
