/**
 * Relatório consolidado da rede no mês — junta num objeto só os números que
 * hoje ficam espalhados (DRE, avaliações, custo de entrega, cobertura).
 *
 * Ancora no `getNetworkResultadoForMonth` (mesma fonte da tela Financeiro/DRE),
 * pra o consolidado bater com o resto do sistema, sem re-ler as tabelas grandes.
 */
import "server-only"

import { getUnits } from "@/lib/data/units"
import {
  getNetworkResultadoForMonth,
  type ResultadoTotals,
} from "@/lib/data/resultado"
import { getNetworkAvaliacoesForMonth } from "@/lib/data/ifood-imported"
import { getNetworkNinefoodAvaliacoesForMonth } from "@/lib/data/ninefood-imported"
import { getNetworkKeetaAvaliacoesForMonth } from "@/lib/data/keeta-imported"
import { getNetworkDeliveryFee } from "@/lib/data/taxa-entrega"
import {
  getImportCoverageForMonth,
  type ImportCoverage,
} from "@/lib/data/relatorio-diario"
import { nowParts } from "@/lib/period"

export type NetworkReport = {
  totals: ResultadoTotals
  ticketMedio: number
  mediaPedidosDia: number
  /** Dias usados no denominador da média/dia (decorridos no mês corrente). */
  diasConsiderados: number
  unitsComFaturamento: number
  unitsTotal: number
  notaMedia: number | null
  totalAvaliacoes: number
  custoEntrega: number
  coverage: ImportCoverage
}

export async function getNetworkReportForMonth(
  year: number,
  month: number,
  filterUnitIds?: string[],
): Promise<NetworkReport> {
  const units = await getUnits()
  const allActiveIds = units.filter((u) => u.active).map((u) => u.id)
  const activeUnitIds =
    filterUnitIds ? filterUnitIds : allActiveIds

  const [resultado, avalIfood, avalNine, avalKeeta, entrega, coverage] =
    await Promise.all([
      getNetworkResultadoForMonth(year, month, filterUnitIds),
      getNetworkAvaliacoesForMonth(year, month, filterUnitIds),
      getNetworkNinefoodAvaliacoesForMonth(year, month, filterUnitIds),
      getNetworkKeetaAvaliacoesForMonth(year, month, filterUnitIds),
      getNetworkDeliveryFee(activeUnitIds, year, month),
      getImportCoverageForMonth(year, month, filterUnitIds),
    ])

  const totals = resultado.totals
  const ticketMedio = totals.pedidos > 0 ? totals.bruto / totals.pedidos : 0

  // Média pedidos/dia: dias decorridos no mês corrente (ou mês inteiro se
  // fechado), sempre em horário de Brasília.
  const np = nowParts()
  const diasNoMes = new Date(year, month, 0).getDate()
  const diasConsiderados =
    year === np.year && month === np.month
      ? Math.min(np.day, diasNoMes)
      : diasNoMes
  const mediaPedidosDia =
    diasConsiderados > 0 ? Math.round(totals.pedidos / diasConsiderados) : 0

  // Nota média da rede: média ponderada pelas 3 plataformas (peso = nº de aval).
  const avals = [avalIfood, avalNine, avalKeeta]
  const totalAvaliacoes = avals.reduce((s, a) => s + a.total, 0)
  const notaMedia =
    totalAvaliacoes > 0
      ? avals.reduce((s, a) => s + a.notaMedia * a.total, 0) / totalAvaliacoes
      : null

  return {
    totals,
    ticketMedio,
    mediaPedidosDia,
    diasConsiderados,
    unitsComFaturamento: resultado.unitsComFaturamento,
    unitsTotal: activeUnitIds.length,
    notaMedia,
    totalAvaliacoes,
    custoEntrega: entrega.total,
    coverage,
  }
}
