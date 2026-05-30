/**
 * Resultado (DRE consolidado) da rede.
 *
 * Junta duas fontes por unidade:
 *  - Importado (iFood + 99 Food + Keeta): faturamento bruto / líquido reais
 *    por plataforma. É o que alimenta o topo do DRE.
 *  - Lançamentos manuais (monthly_entries): custos (CMV Cozina/Loja) e VR.
 *    Quando não há lançamento, esses campos ficam zerados e a margem = líquido.
 *
 * O bruto/líquido vêm SEMPRE dos imports quando existem (fallback pro manual
 * da plataforma). Custos e VR vêm sempre do manual — não há equivalente
 * importado.
 */

import "server-only"

import { getUnits, type Unit } from "@/lib/data/units"
import { getFinanceiroResumoByUnits } from "@/lib/data/ifood-imported"
import { getNinefoodResumoByUnits } from "@/lib/data/ninefood-imported"
import { getKeetaResumoByUnits } from "@/lib/data/keeta-imported"
import { getRealMonthlyForUnits } from "@/lib/data/lancamentos"

export type ResultadoUnitRow = {
  unitId: string
  unitCode: string
  unitName: string
  pedidos: number
  bruto: number
  /** Taxas retidas pelas plataformas = bruto − líquido das plataformas */
  taxasPlataforma: number
  /** O que a plataforma repassa pra loja (soma dos líquidos importados) */
  liquidoPlataformas: number
  /** VR líquido (manual): vr_recebido − vr_taxa_8% */
  vrLiquido: number
  /** Líquido que entra na conta = líquido plataformas + VR líquido */
  totalLiquido: number
  cmvCozina: number
  cmvLoja: number
  cmvTotal: number
  /** Margem líquida = total líquido − CMV (antes do custo de operação) */
  margemLiquida: number
  /** Margem de lucro % sobre o bruto */
  margemPct: number
  /** Custo da operação (manual, opcional): aluguel, folha, etc. */
  custoOperacao: number
  /** Resultado operacional = margem líquida − custo de operação (lucro) */
  resultadoOperacional: number
  /** Resultado operacional % sobre o bruto */
  resultadoPct: number
  /** Taxa de repasse % = líquido plataformas / bruto */
  repassePct: number
  temCusto: boolean
  temOperacao: boolean
  temImport: boolean
}

export type ResultadoTotals = {
  pedidos: number
  bruto: number
  taxasPlataforma: number
  liquidoPlataformas: number
  vrLiquido: number
  totalLiquido: number
  cmvTotal: number
  margemLiquida: number
  margemPct: number
  custoOperacao: number
  resultadoOperacional: number
  resultadoPct: number
  repassePct: number
}

export type NetworkResultado = {
  rows: ResultadoUnitRow[]
  totals: ResultadoTotals
  /** Quantas unidades têm faturamento (import ou manual) no mês */
  unitsComFaturamento: number
  /** Quantas têm custo (CMV) lançado */
  unitsComCusto: number
}

/**
 * DRE consolidado da rede no mês. Uma linha por unidade ativa com
 * faturamento, ordenada por bruto DESC, + totais agregados.
 */
export async function getNetworkResultadoForMonth(
  year: number,
  month: number,
  filterUnitIds?: string[],
): Promise<NetworkResultado> {
  const allUnits = await getUnits()
  let active = allUnits.filter((u) => u.active)
  if (filterUnitIds && filterUnitIds.length > 0) {
    const set = new Set(filterUnitIds)
    active = active.filter((u) => set.has(u.id))
  }
  const unitIds = active.map((u) => u.id)

  const [finByUnit, nineByUnit, keetaByUnit, manualByUnit] = await Promise.all([
    getFinanceiroResumoByUnits(unitIds, year, month),
    getNinefoodResumoByUnits(unitIds, year, month),
    getKeetaResumoByUnits(unitIds, year, month),
    getRealMonthlyForUnits(unitIds, year, month),
  ])

  const platBruto = (u: Unit, id: "ifood" | "99food" | "keeta") =>
    u.monthly.platforms.find((p) => p.id === id)?.bruto ?? 0
  const platLiquido = (u: Unit, id: "ifood" | "99food" | "keeta") =>
    u.monthly.platforms.find((p) => p.id === id)?.liquido ?? 0

  const rows: ResultadoUnitRow[] = []
  for (const u of active) {
    const fin = finByUnit.get(u.id)
    const nine = nineByUnit.get(u.id)
    const keeta = keetaByUnit.get(u.id)
    const manual = manualByUnit.get(u.id)

    const hasIfood = fin?.hasData ?? false
    const has99 = nine?.hasData ?? false
    const hasKeeta = keeta?.hasData ?? false
    const temImport = hasIfood || has99 || hasKeeta

    // Bruto / líquido por plataforma (importado preferido, fallback manual)
    const ifoodBruto = hasIfood ? fin!.bruto : platBruto(u, "ifood")
    const ifoodLiq = hasIfood ? fin!.liquido : platLiquido(u, "ifood")
    const nineBruto = has99 ? nine!.bruto : platBruto(u, "99food")
    const nineLiq = has99 ? nine!.liquido : platLiquido(u, "99food")
    const keetaBruto = hasKeeta ? keeta!.bruto : platBruto(u, "keeta")
    const keetaLiq = hasKeeta ? keeta!.liquido : platLiquido(u, "keeta")

    const bruto = ifoodBruto + nineBruto + keetaBruto
    const liquidoPlataformas = ifoodLiq + nineLiq + keetaLiq

    let pedidos = 0
    if (hasIfood) pedidos += fin!.pedidosUnicos
    if (has99) pedidos += nine!.pedidos
    if (hasKeeta) pedidos += keeta!.pedidos
    if (!temImport) pedidos = u.monthly.pedidos

    // Custos + VR vêm do manual
    const cmvCozina = manual?.custoProdutosCozina ?? 0
    const cmvLoja = manual?.custoProdutosLoja ?? 0
    const cmvTotal = cmvCozina + (cmvLoja ?? 0)
    const custoOperacao = manual?.custoOperacao ?? 0
    const vrLiquido = manual
      ? Math.max(0, manual.vrRecebido - manual.vrTaxaMedia8)
      : 0

    const taxasPlataforma = Math.max(0, bruto - liquidoPlataformas)
    const totalLiquido = liquidoPlataformas + vrLiquido
    const margemLiquida = totalLiquido - cmvTotal
    const margemPct = bruto > 0 ? (margemLiquida / bruto) * 100 : 0
    const resultadoOperacional = margemLiquida - custoOperacao
    const resultadoPct = bruto > 0 ? (resultadoOperacional / bruto) * 100 : 0
    const repassePct = bruto > 0 ? (liquidoPlataformas / bruto) * 100 : 0

    // Só entra no DRE quem tem faturamento (import ou manual)
    if (bruto <= 0 && pedidos <= 0) continue

    rows.push({
      unitId: u.id,
      unitCode: u.code,
      unitName: u.name,
      pedidos,
      bruto,
      taxasPlataforma,
      liquidoPlataformas,
      vrLiquido,
      totalLiquido,
      cmvCozina,
      cmvLoja: cmvLoja ?? 0,
      cmvTotal,
      margemLiquida,
      margemPct,
      custoOperacao,
      resultadoOperacional,
      resultadoPct,
      repassePct,
      temCusto: cmvTotal > 0,
      temOperacao: custoOperacao > 0,
      temImport,
    })
  }

  rows.sort((a, b) => b.bruto - a.bruto)

  const totals = rows.reduce<ResultadoTotals>(
    (acc, r) => {
      acc.pedidos += r.pedidos
      acc.bruto += r.bruto
      acc.taxasPlataforma += r.taxasPlataforma
      acc.liquidoPlataformas += r.liquidoPlataformas
      acc.vrLiquido += r.vrLiquido
      acc.totalLiquido += r.totalLiquido
      acc.cmvTotal += r.cmvTotal
      acc.margemLiquida += r.margemLiquida
      acc.custoOperacao += r.custoOperacao
      acc.resultadoOperacional += r.resultadoOperacional
      return acc
    },
    {
      pedidos: 0,
      bruto: 0,
      taxasPlataforma: 0,
      liquidoPlataformas: 0,
      vrLiquido: 0,
      totalLiquido: 0,
      cmvTotal: 0,
      margemLiquida: 0,
      margemPct: 0,
      custoOperacao: 0,
      resultadoOperacional: 0,
      resultadoPct: 0,
      repassePct: 0,
    },
  )
  totals.margemPct = totals.bruto > 0 ? (totals.margemLiquida / totals.bruto) * 100 : 0
  totals.resultadoPct =
    totals.bruto > 0 ? (totals.resultadoOperacional / totals.bruto) * 100 : 0
  totals.repassePct =
    totals.bruto > 0 ? (totals.liquidoPlataformas / totals.bruto) * 100 : 0

  return {
    rows,
    totals,
    unitsComFaturamento: rows.length,
    unitsComCusto: rows.filter((r) => r.temCusto).length,
  }
}
