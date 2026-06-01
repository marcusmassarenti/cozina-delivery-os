"use server"

import { revalidatePath, revalidateTag } from "next/cache"

import { requireCapability } from "@/lib/auth/guards"
import { createAdminClient } from "@/lib/supabase/admin"

export type SaveCostsState = {
  ok: boolean
  message?: string
}

/**
 * Salva (upsert parcial) os custos manuais de UMA unidade no mês, direto da
 * tabela do Resultado:
 *  - custo_produtos_cozina (CMV que veio da fábrica Cozina)
 *  - custo_operacao        (aluguel, folha, etc. — opcional)
 *
 * Só toca nessas duas colunas; o restante da linha mensal (VR, nota, etc.)
 * fica intacto graças ao onConflict. Service role + requireAuth (segue o
 * mesmo padrão das outras actions de lançamento).
 */
export async function saveUnitCosts(input: {
  unitId: string
  year: number
  month: number
  custoCozina: number
  custoOperacao: number
}): Promise<SaveCostsState> {
  const { unitId, year, month } = input
  if (!unitId || !year || !month) {
    return { ok: false, message: "Dados inválidos." }
  }
  const custoCozina = Number.isFinite(input.custoCozina)
    ? Math.max(0, input.custoCozina)
    : 0
  const custoOperacao = Number.isFinite(input.custoOperacao)
    ? Math.max(0, input.custoOperacao)
    : 0

  try {
    await requireCapability("canEdit")
    const supabase = createAdminClient()
    const { error } = await supabase.from("monthly_entries").upsert(
      {
        unit_id: unitId,
        year,
        month,
        custo_produtos_cozina: custoCozina,
        custo_operacao: custoOperacao,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "unit_id,year,month" },
    )
    if (error) return { ok: false, message: error.message }

    revalidateTag("reports", "max")
    revalidatePath("/financeiro")
    revalidatePath("/unidades/[codigo]", "page")
    revalidatePath("/")
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro desconhecido",
    }
  }
}
