"use server"

import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"

export type ActionState = {
  ok: boolean
  message?: string
}

type PlatformEntry = {
  platform: "ifood" | "99food" | "keeta"
  pedidos: number
  cancelados: number
  faturamento: number
}

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

  const platforms: PlatformEntry[] = [
    {
      platform: "ifood",
      pedidos: parseInteger(formData.get("ifood_pedidos")),
      cancelados: parseInteger(formData.get("ifood_cancelados")),
      faturamento: parseNumber(formData.get("ifood_faturamento")),
    },
    {
      platform: "99food",
      pedidos: parseInteger(formData.get("99food_pedidos")),
      cancelados: parseInteger(formData.get("99food_cancelados")),
      faturamento: parseNumber(formData.get("99food_faturamento")),
    },
    {
      platform: "keeta",
      pedidos: parseInteger(formData.get("keeta_pedidos")),
      cancelados: parseInteger(formData.get("keeta_cancelados")),
      faturamento: parseNumber(formData.get("keeta_faturamento")),
    },
  ]

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

  const payload = {
    unit_id: unitId,
    year,
    month,
    taxa_entrega_ifood: parseNumber(formData.get("taxa_entrega_ifood")),
    promocoes: parseNumber(formData.get("promocoes")),
    taxa_comissao_ifood: parseNumber(formData.get("taxa_comissao_ifood")),
    servicos_logisticos: parseNumber(formData.get("servicos_logisticos")),
    outros_descontos_ifood: parseNumber(formData.get("outros_descontos_ifood")),
    vr_recebido: parseNumber(formData.get("vr_recebido")),
    vr_taxa_media_8: parseNumber(formData.get("vr_taxa_media_8")),
    cancelamentos_reembolsos: parseNumber(formData.get("cancelamentos_reembolsos")),
    custo_produtos_cozina: parseNumber(formData.get("custo_produtos_cozina")),
    custo_produtos_loja: parseNumber(formData.get("custo_produtos_loja")),
    clientes_novos: parseInteger(formData.get("clientes_novos")),
    nota_media: parseNumber(formData.get("nota_media")),
    observacoes: String(formData.get("observacoes") ?? "").trim(),
    updated_at: new Date().toISOString(),
  }

  try {
    const supabase = createAdminClient()
    const { error } = await supabase
      .from("monthly_entries")
      .upsert(payload, { onConflict: "unit_id,year,month" })
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
