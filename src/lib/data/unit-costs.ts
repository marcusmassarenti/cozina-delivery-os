import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export type CostTipo = "cmv" | "operacao"

export type CostCategory = {
  id: string
  nome: string
  tipo: CostTipo
  sort: number
  /** Valor lançado no mês pedido (0 se não houver). */
  valor: number
}

export type UnitCostBreakdown = {
  categories: CostCategory[]
  cmvTotal: number
  operacaoTotal: number
  hasCmvCats: boolean
  hasOperacaoCats: boolean
}

/** Categorias de custo da unidade + o valor de cada uma no mês pedido. */
export async function getUnitCostBreakdown(
  unitId: string,
  year: number,
  month: number,
): Promise<UnitCostBreakdown> {
  const admin = createAdminClient()

  const { data: cats } = await admin
    .from("unit_cost_categories")
    .select("id, nome, tipo, sort")
    .eq("unit_id", unitId)
    .eq("arquivada", false)
    .order("tipo")
    .order("sort")
    .order("created_at")
  const catList = cats ?? []

  const ids = catList.map((c) => c.id)
  const valMap = new Map<string, number>()
  if (ids.length) {
    const { data: vals } = await admin
      .from("unit_cost_values")
      .select("category_id, valor")
      .in("category_id", ids)
      .eq("ano", year)
      .eq("mes", month)
    for (const v of vals ?? [])
      valMap.set(v.category_id as string, Number(v.valor))
  }

  const categories: CostCategory[] = catList.map((c) => ({
    id: c.id as string,
    nome: c.nome as string,
    tipo: c.tipo as CostTipo,
    sort: (c.sort as number) ?? 0,
    valor: valMap.get(c.id as string) ?? 0,
  }))

  const cmvTotal = categories
    .filter((c) => c.tipo === "cmv")
    .reduce((s, c) => s + c.valor, 0)
  const operacaoTotal = categories
    .filter((c) => c.tipo === "operacao")
    .reduce((s, c) => s + c.valor, 0)

  return {
    categories,
    cmvTotal,
    operacaoTotal,
    hasCmvCats: categories.some((c) => c.tipo === "cmv"),
    hasOperacaoCats: categories.some((c) => c.tipo === "operacao"),
  }
}
