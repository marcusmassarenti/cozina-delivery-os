"use server"

import { revalidatePath, revalidateTag } from "next/cache"

import { requireAuth } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"

export type SaveMetaState = { ok: boolean; message?: string }

/**
 * Salva a meta mensal de faturamento de UMA loja (upsert parcial em
 * monthly_entries — só toca em meta_faturamento, o resto da linha fica intacto).
 */
export async function saveMetaFaturamento(input: {
  unitId: string
  year: number
  month: number
  meta: number
}): Promise<SaveMetaState> {
  const { unitId, year, month } = input
  if (!unitId || !year || !month) {
    return { ok: false, message: "Dados inválidos." }
  }
  const meta = Number.isFinite(input.meta) ? Math.max(0, input.meta) : 0

  try {
    await requireAuth()
    const supabase = createAdminClient()
    const { error } = await supabase.from("monthly_entries").upsert(
      {
        unit_id: unitId,
        year,
        month,
        meta_faturamento: meta,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "unit_id,year,month" },
    )
    if (error) return { ok: false, message: error.message }

    revalidateTag("reports", "max")
    revalidatePath("/relatorios/acompanhamento")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro desconhecido",
    }
  }
}
