/**
 * Taxa/custo de entrega por unidade e plataforma, no mês.
 *
 * Cada plataforma reporta a entrega de um jeito:
 *  - iFood : lançamento "Taxa entrega iFood" no Financeiro (vem negativo =
 *            custo descontado do repasse). Somamos o valor absoluto.
 *  - Keeta : coluna taxa_entrega em keeta_pedidos (faixa de frete por pedido).
 *  - 99    : a taxa de entrega vem zerada no export atual, então usamos o
 *            custo logístico + o custo da loja com frete grátis (ninefood_pedidos).
 *
 * É um CUSTO de entrega da loja — serve pra análise de margem/operação.
 */

import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export type DeliveryFee = {
  ifood: number
  ninefood: number
  keeta: number
  total: number
}

function emptyFee(): DeliveryFee {
  return { ifood: 0, ninefood: 0, keeta: 0, total: 0 }
}

async function pageAll<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
  maxRows = 300000,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (from < maxRows) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) {
      console.error("taxa-entrega pageAll error:", error.message)
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
 * Custo de entrega por unidade no mês, separado por plataforma.
 * Retorna só unidades com algum custo.
 */
export async function getDeliveryFeeByUnits(
  unitIds: string[],
  year: number,
  month: number,
): Promise<Map<string, DeliveryFee>> {
  const out = new Map<string, DeliveryFee>()
  if (unitIds.length === 0) return out
  const admin = createAdminClient()
  const ensure = (id: string) => {
    let f = out.get(id)
    if (!f) {
      f = emptyFee()
      out.set(id, f)
    }
    return f
  }

  // iFood: lançamento "Taxa entrega iFood" (negativo = custo)
  const ifood = await pageAll<{ unit_id: string; valor: number | string }>(
    (a, b) =>
      admin
        .from("ifood_financeiro_lancamentos")
        .select("unit_id, valor")
        .in("unit_id", unitIds)
        .eq("ref_year", year)
        .eq("ref_month", month)
        .eq("descricao_lancamento", "Taxa entrega iFood")
        .range(a, b),
  )
  for (const r of ifood) {
    ensure(r.unit_id).ifood += Math.abs(Number(r.valor) || 0)
  }

  // 99 Food: custo logístico + frete grátis bancado pela loja (por pedido)
  const nine = await pageAll<{
    unit_id: string
    custos_logisticos: number | string | null
    custo_loja_oferta_entrega_gratis: number | string | null
  }>((a, b) =>
    admin
      .from("ninefood_pedidos")
      .select("unit_id, custos_logisticos, custo_loja_oferta_entrega_gratis")
      .in("unit_id", unitIds)
      .eq("ref_year", year)
      .eq("ref_month", month)
      .range(a, b),
  )
  for (const r of nine) {
    ensure(r.unit_id).ninefood +=
      Math.abs(Number(r.custos_logisticos) || 0) +
      Math.abs(Number(r.custo_loja_oferta_entrega_gratis) || 0)
  }

  // Keeta: taxa_entrega por pedido
  const keeta = await pageAll<{
    unit_id: string
    taxa_entrega: number | string | null
  }>((a, b) =>
    admin
      .from("keeta_pedidos")
      .select("unit_id, taxa_entrega")
      .in("unit_id", unitIds)
      .eq("ref_year", year)
      .eq("ref_month", month)
      .range(a, b),
  )
  for (const r of keeta) {
    ensure(r.unit_id).keeta += Math.abs(Number(r.taxa_entrega) || 0)
  }

  for (const f of out.values()) {
    f.ifood = Math.round(f.ifood * 100) / 100
    f.ninefood = Math.round(f.ninefood * 100) / 100
    f.keeta = Math.round(f.keeta * 100) / 100
    f.total = Math.round((f.ifood + f.ninefood + f.keeta) * 100) / 100
  }
  return out
}

/** Custo de entrega de 1 unidade no mês. */
export async function getDeliveryFeeForMonth(
  unitId: string,
  year: number,
  month: number,
): Promise<DeliveryFee> {
  const map = await getDeliveryFeeByUnits([unitId], year, month)
  return map.get(unitId) ?? emptyFee()
}

/**
 * Total de custo de entrega da rede no mês (somando as unidades),
 * com breakdown por plataforma. Aceita filtro de unidades.
 */
export async function getNetworkDeliveryFee(
  unitIds: string[],
  year: number,
  month: number,
): Promise<DeliveryFee> {
  const map = await getDeliveryFeeByUnits(unitIds, year, month)
  const acc = emptyFee()
  for (const f of map.values()) {
    acc.ifood += f.ifood
    acc.ninefood += f.ninefood
    acc.keeta += f.keeta
  }
  acc.ifood = Math.round(acc.ifood * 100) / 100
  acc.ninefood = Math.round(acc.ninefood * 100) / 100
  acc.keeta = Math.round(acc.keeta * 100) / 100
  acc.total = Math.round((acc.ifood + acc.ninefood + acc.keeta) * 100) / 100
  return acc
}
