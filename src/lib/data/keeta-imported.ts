/**
 * Queries em cima dos dados importados do Keeta (migration 0016).
 *
 * Fontes:
 *  - keeta_daily_loja: bruto (vendas_itens), pedidos, cancelados por dia
 *  - keeta_pedidos: líquido (ganhos_liquidos) por pedido
 *
 * Espelha o shape de NinefoodResumo pra o Dashboard mesclar do mesmo jeito.
 */

import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export type KeetaResumo = {
  pedidos: number
  bruto: number
  liquido: number
  cancelamentosQtd: number
  ticketMedio: number
  pctLoja: number
  hasData: boolean
}

function emptyKeeta(): KeetaResumo {
  return {
    pedidos: 0,
    bruto: 0,
    liquido: 0,
    cancelamentosQtd: 0,
    ticketMedio: 0,
    pctLoja: 0,
    hasData: false,
  }
}

async function pageAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
  maxRows = 200000,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (from < maxRows) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) {
      console.error("keeta pageAll error:", error.message)
      break
    }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

/**
 * Resumo mensal do Keeta por unidade. bruto/pedidos/cancelados vêm da
 * Loja diária; líquido vem dos Pedidos (ganhos líquidos somados).
 */
export async function getKeetaResumoByUnits(
  unitIds: string[],
  year: number,
  month: number,
): Promise<Map<string, KeetaResumo>> {
  const out = new Map<string, KeetaResumo>()
  if (unitIds.length === 0) return out
  const admin = createAdminClient()

  // Loja diária (bruto, pedidos, cancelados)
  const loja = await pageAll<{
    unit_id: string
    vendas_itens: number | string
    total_pedidos: number | null
    pedidos_cancelados: number | null
  }>((a, b) =>
    admin
      .from("keeta_daily_loja")
      .select("unit_id, vendas_itens, total_pedidos, pedidos_cancelados")
      .in("unit_id", unitIds)
      .eq("ref_year", year)
      .eq("ref_month", month)
      .range(a, b),
  )
  for (const r of loja) {
    const cur = out.get(r.unit_id) ?? emptyKeeta()
    cur.bruto += Number(r.vendas_itens) || 0
    cur.pedidos += r.total_pedidos || 0
    cur.cancelamentosQtd += r.pedidos_cancelados || 0
    out.set(r.unit_id, cur)
  }

  // Pedidos (líquido)
  const pedidos = await pageAll<{
    unit_id: string
    ganhos_liquidos: number | string | null
    vendas_itens: number | string | null
  }>((a, b) =>
    admin
      .from("keeta_pedidos")
      .select("unit_id, ganhos_liquidos, vendas_itens")
      .in("unit_id", unitIds)
      .eq("ref_year", year)
      .eq("ref_month", month)
      .range(a, b),
  )
  const brutoFromPedidos = new Map<string, number>()
  const countFromPedidos = new Map<string, number>()
  for (const r of pedidos) {
    const cur = out.get(r.unit_id) ?? emptyKeeta()
    cur.liquido += Number(r.ganhos_liquidos) || 0
    out.set(r.unit_id, cur)
    brutoFromPedidos.set(
      r.unit_id,
      (brutoFromPedidos.get(r.unit_id) ?? 0) + (Number(r.vendas_itens) || 0),
    )
    countFromPedidos.set(r.unit_id, (countFromPedidos.get(r.unit_id) ?? 0) + 1)
  }

  // Finaliza: fallbacks + derivados
  for (const [unitId, cur] of out) {
    // Se não veio Loja diária, usa os Pedidos pra bruto/pedidos
    if (cur.bruto === 0 && (brutoFromPedidos.get(unitId) ?? 0) > 0) {
      cur.bruto = brutoFromPedidos.get(unitId) ?? 0
    }
    if (cur.pedidos === 0 && (countFromPedidos.get(unitId) ?? 0) > 0) {
      cur.pedidos = countFromPedidos.get(unitId) ?? 0
    }
    // Se não veio Pedidos (líquido), assume líquido = bruto (pctLoja 100%)
    if (cur.liquido === 0 && cur.bruto > 0) cur.liquido = cur.bruto
    cur.ticketMedio = cur.pedidos > 0 ? cur.bruto / cur.pedidos : 0
    cur.pctLoja = cur.bruto > 0 ? (cur.liquido / cur.bruto) * 100 : 0
    cur.hasData = cur.bruto > 0 || cur.pedidos > 0
  }

  return out
}

/** Resumo do Keeta pra 1 unidade no mês (usado no detalhe da unidade). */
export async function getKeetaResumoForMonth(
  unitId: string,
  year: number,
  month: number,
): Promise<KeetaResumo> {
  const map = await getKeetaResumoByUnits([unitId], year, month)
  return map.get(unitId) ?? emptyKeeta()
}
