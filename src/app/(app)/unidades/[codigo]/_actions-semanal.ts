"use server"

import { revalidatePath } from "next/cache"

import { requireUnitWrite } from "@/lib/auth/guards"
import { getAuthUser } from "@/lib/auth/permissions"
import { salvarRelatorioSemanal } from "@/lib/data/relatorio-semanal"

export type SalvarSemanaState = {
  ok: boolean
  message?: string
  error?: string
}

/**
 * Grava o comentário da semana.
 *
 * `requireUnitWrite` porque escrever aqui é escrever NA LOJA: o comentário
 * vai junto do relatório que a agência entrega ao cliente dela. Quem não pode
 * editar a unidade não pode falar por ela.
 */
export async function salvarSemana(
  _prev: SalvarSemanaState,
  formData: FormData,
): Promise<SalvarSemanaState> {
  const unitId = String(formData.get("unitId") ?? "").trim()
  const semana = String(formData.get("semana") ?? "").trim()
  const texto = String(formData.get("texto") ?? "")
  const codigo = String(formData.get("codigo") ?? "").trim()

  if (!unitId || !semana) return { ok: false, error: "Semana não identificada." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(semana)) {
    return { ok: false, error: "Semana em formato inesperado." }
  }

  await requireUnitWrite(unitId)

  const user = await getAuthUser()
  const r = await salvarRelatorioSemanal(unitId, semana, texto, user?.id ?? null)
  if (!r.ok) return { ok: false, error: r.error }

  if (codigo) revalidatePath(`/unidades/${codigo}`)
  return {
    ok: true,
    message: texto.trim()
      ? "Comentário salvo — semana marcada como entregue."
      : "Comentário limpo — semana volta a pendente.",
  }
}
