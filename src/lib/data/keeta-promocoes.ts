/**
 * ROI das campanhas do Keeta (tabela keeta_promocoes, relatório "Dados da
 * promoção"). Agrupa por regra de desconto (a campanha), somando pedidos que
 * ela trouxe, vendas de itens em promoção e o custo (despesa) da loja — pra
 * responder "qual promoção vale a pena?".
 */

import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export type KeetaCampanhaRow = {
  regra: string
  campanhas: number // nº de "atos" (instâncias de campanha) distintos
  pedidos: number // pedidos atribuídos à campanha
  vendasPromo: number // vendas de itens em promoção
  despesa: number // custo da loja (despesa da campanha)
  custoPorPedido: number // despesa / pedidos
}

export type KeetaPromocaoResumo = {
  hasData: boolean
  totalPedidos: number
  totalDespesa: number
  totalVendasPromo: number
  custoPorPedidoMedio: number
  campanhas: KeetaCampanhaRow[] // ordenadas por despesa desc
}

function empty(): KeetaPromocaoResumo {
  return {
    hasData: false,
    totalPedidos: 0,
    totalDespesa: 0,
    totalVendasPromo: 0,
    custoPorPedidoMedio: 0,
    campanhas: [],
  }
}

type Row = {
  ato_id: string
  regra_desconto: string | null
  pedidos_campanha: number | string | null
  vendas_promo_itens: number | string | null
  despesa_campanha: number | string | null
}

const num = (v: number | string | null) => Math.abs(Number(v) || 0)
const round = (n: number) => Math.round(n * 100) / 100

export async function getKeetaPromocaoResumo(
  unitIds: string[],
  year: number,
  month: number,
): Promise<KeetaPromocaoResumo> {
  if (unitIds.length === 0) return empty()
  const admin = createAdminClient()

  const rows: Row[] = []
  let from = 0
  const pageSize = 1000
  for (let i = 0; i < 300; i++) {
    const { data, error } = await admin
      .from("keeta_promocoes")
      .select(
        "ato_id, regra_desconto, pedidos_campanha, vendas_promo_itens, despesa_campanha",
      )
      .in("unit_id", unitIds)
      .eq("ref_year", year)
      .eq("ref_month", month)
      .order("id")
      .range(from, from + pageSize - 1)
    if (error) {
      console.error("getKeetaPromocaoResumo:", error.message)
      break
    }
    if (!data || data.length === 0) break
    rows.push(...(data as Row[]))
    if (data.length < pageSize) break
    from += pageSize
  }

  if (rows.length === 0) return empty()

  type Agg = {
    regra: string
    atos: Set<string>
    pedidos: number
    vendasPromo: number
    despesa: number
  }
  const byRegra = new Map<string, Agg>()
  let totalPedidos = 0
  let totalDespesa = 0
  let totalVendasPromo = 0

  for (const r of rows) {
    const regra = (r.regra_desconto ?? "").trim() || "Sem regra"
    let a = byRegra.get(regra)
    if (!a) {
      a = { regra, atos: new Set(), pedidos: 0, vendasPromo: 0, despesa: 0 }
      byRegra.set(regra, a)
    }
    a.atos.add(r.ato_id)
    const ped = num(r.pedidos_campanha)
    const vpromo = num(r.vendas_promo_itens)
    const desp = num(r.despesa_campanha)
    a.pedidos += ped
    a.vendasPromo += vpromo
    a.despesa += desp
    totalPedidos += ped
    totalVendasPromo += vpromo
    totalDespesa += desp
  }

  const campanhas: KeetaCampanhaRow[] = Array.from(byRegra.values())
    .map((a) => ({
      regra: a.regra,
      campanhas: a.atos.size,
      pedidos: Math.round(a.pedidos),
      vendasPromo: round(a.vendasPromo),
      despesa: round(a.despesa),
      custoPorPedido: a.pedidos > 0 ? round(a.despesa / a.pedidos) : 0,
    }))
    .sort((a, b) => b.despesa - a.despesa)

  return {
    hasData: true,
    totalPedidos: Math.round(totalPedidos),
    totalDespesa: round(totalDespesa),
    totalVendasPromo: round(totalVendasPromo),
    custoPorPedidoMedio: totalPedidos > 0 ? round(totalDespesa / totalPedidos) : 0,
    campanhas,
  }
}
