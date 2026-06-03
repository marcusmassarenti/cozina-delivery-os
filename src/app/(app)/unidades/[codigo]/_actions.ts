"use server"

import { revalidatePath } from "next/cache"

import { requireModulePermission } from "@/lib/auth/guards"

export type FechamentoState = { ok: boolean; message?: string }

export async function saveFechamento(input: {
  unitId: string
  unitCode: string
  periodoInicio: string
  periodoFim: string
  recebidoIfood: number
  recebidoKeeta: number
  recebido99: number
  creditoDebito: number
  custoProdutos: number
  custoVinagrete: number
  acerto: Record<string, unknown>
  observacoes: string
}): Promise<FechamentoState> {
  try {
    const { admin, userId } = await requireModulePermission("financeiro", "edit")

    if (!input.unitId || !input.periodoInicio || !input.periodoFim) {
      return { ok: false, message: "Escolha a semana (início e fim)." }
    }
    if (input.periodoFim < input.periodoInicio) {
      return { ok: false, message: "Fim da semana antes do início." }
    }

    // Valores ≥ 0, exceto crédito/débito que pode ser negativo.
    const pos = (n: number) => (Number.isFinite(n) ? Math.max(0, n) : 0)
    const any = (n: number) => (Number.isFinite(n) ? n : 0)

    const { error } = await admin.from("unit_fechamentos").upsert(
      {
        unit_id: input.unitId,
        periodo_inicio: input.periodoInicio,
        periodo_fim: input.periodoFim,
        recebido_ifood: pos(input.recebidoIfood),
        recebido_keeta: pos(input.recebidoKeeta),
        recebido_99: pos(input.recebido99),
        credito_debito: any(input.creditoDebito),
        custo_produtos: pos(input.custoProdutos),
        custo_vinagrete: pos(input.custoVinagrete),
        acerto: input.acerto ?? {},
        observacoes: input.observacoes?.trim() || null,
        created_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "unit_id,periodo_inicio,periodo_fim" },
    )
    if (error) return { ok: false, message: error.message }

    revalidatePath(`/unidades/${input.unitCode}`)
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Erro desconhecido",
    }
  }
}

export async function deleteFechamento(
  id: string,
  unitCode: string,
): Promise<FechamentoState> {
  try {
    const { admin } = await requireModulePermission("financeiro", "edit")
    if (!id) return { ok: false, message: "ID ausente." }
    const { error } = await admin
      .from("unit_fechamentos")
      .delete()
      .eq("id", id)
    if (error) return { ok: false, message: error.message }
    revalidatePath(`/unidades/${unitCode}`)
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Erro desconhecido",
    }
  }
}
