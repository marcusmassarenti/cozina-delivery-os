/**
 * Agregador do financeiro AUTOMÁTICO do 99 Food (tabela ninefood_bill,
 * alimentada pela Financial API). Soma o extrato por pedido em totais
 * por unidade/período.
 *
 * Mapa pro DRE (a CALIBRAR com 1 mês de dado real):
 *   - bruto    ← Σ meal_original (order_type=1)         · receita de vendas
 *   - liquido  ← Σ settlement_amount (todos os tipos)    · ⭐ repasse real
 *   - comissao ← Σ commission_amount
 *   - taxaPgto ← Σ pay_commission
 *   - logistica← Σ b2p_delivery
 *   - promoLoja← Σ |shop_activity_outcome| + |free_delivery_outcome|
 *   - vr       ← Σ meal_voucher
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { fetchAllRows } from "@/lib/data/paginate"

export type NinefoodApiResumo = {
  unitId: string
  /** pedidos de receita (order_type=1) */
  pedidos: number
  /** linhas de reembolso (order_type 2/3/4) */
  reembolsos: number
  /** receita bruta de vendas (Σ meal_original em order_type=1) */
  bruto: number
  /** ⭐ líquido real a repassar (Σ settlement_amount, todos os tipos) */
  liquido: number
  comissao: number
  taxaPgto: number
  logistica: number
  /** custo de promoções bancado pela loja (item + frete grátis) */
  promoLoja: number
  /** VR (vale-refeição) recebido */
  vr: number
  vat: number
  hasData: boolean
}

type BillRow = {
  unit_id: string
  order_type: number
  meal_original: number | null
  settlement_amount: number | null
  commission_amount: number | null
  pay_commission: number | null
  b2p_delivery: number | null
  shop_activity_outcome: number | null
  free_delivery_outcome: number | null
  meal_voucher: number | null
  vat_amount: number | null
}

const n = (v: number | null | undefined) => Number(v ?? 0)

/** Resumo do financeiro da API por unidade num mês de referência. */
export async function getNinefoodApiResumoByUnits(
  unitIds: string[],
  year: number,
  month: number,
): Promise<Map<string, NinefoodApiResumo>> {
  const out = new Map<string, NinefoodApiResumo>()
  if (unitIds.length === 0) return out

  const admin = createAdminClient()
  const rows = await fetchAllRows<BillRow>(
    (from, to) =>
      admin
        .from("ninefood_bill")
        .select(
          "unit_id, order_type, meal_original, settlement_amount, commission_amount, pay_commission, b2p_delivery, shop_activity_outcome, free_delivery_outcome, meal_voucher, vat_amount",
        )
        .in("unit_id", unitIds)
        .eq("ref_year", year)
        .eq("ref_month", month)
        .order("id")
        .range(from, to),
    "getNinefoodApiResumoByUnits",
  )

  const ensure = (unitId: string): NinefoodApiResumo => {
    let acc = out.get(unitId)
    if (!acc) {
      acc = {
        unitId,
        pedidos: 0,
        reembolsos: 0,
        bruto: 0,
        liquido: 0,
        comissao: 0,
        taxaPgto: 0,
        logistica: 0,
        promoLoja: 0,
        vr: 0,
        vat: 0,
        hasData: false,
      }
      out.set(unitId, acc)
    }
    return acc
  }

  for (const r of rows) {
    const acc = ensure(r.unit_id)
    acc.hasData = true
    if (r.order_type === 1) {
      acc.pedidos += 1
      acc.bruto += n(r.meal_original)
    } else if (r.order_type === 2 || r.order_type === 3 || r.order_type === 4) {
      acc.reembolsos += 1
    }
    // líquido e taxas somam todos os tipos (reembolso entra negativo)
    acc.liquido += n(r.settlement_amount)
    acc.comissao += n(r.commission_amount)
    acc.taxaPgto += n(r.pay_commission)
    acc.logistica += n(r.b2p_delivery)
    acc.vr += n(r.meal_voucher)
    acc.vat += n(r.vat_amount)
    acc.promoLoja +=
      Math.abs(Math.min(0, n(r.shop_activity_outcome))) +
      Math.abs(Math.min(0, n(r.free_delivery_outcome)))
  }

  return out
}

/** Quais unidades têm dado da API no período (pra preferir API vs manual). */
export async function getNinefoodApiUnitsWithData(
  unitIds: string[],
  year: number,
  month: number,
): Promise<Set<string>> {
  const resumo = await getNinefoodApiResumoByUnits(unitIds, year, month)
  return new Set(
    [...resumo.values()].filter((r) => r.hasData).map((r) => r.unitId),
  )
}
