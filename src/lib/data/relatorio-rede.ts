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
import { getAvaliacoesCardapioWeb } from "@/lib/data/cardapioweb-avaliacoes"
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

  const [resultado, avalIfood, avalNine, avalKeeta, avalCw, entrega, coverage] =
    await Promise.all([
      getNetworkResultadoForMonth(year, month, filterUnitIds),
      getNetworkAvaliacoesForMonth(year, month, filterUnitIds),
      getNetworkNinefoodAvaliacoesForMonth(year, month, filterUnitIds),
      getNetworkKeetaAvaliacoesForMonth(year, month, filterUnitIds),
      // Canal próprio. As três acima são de marketplace; a avaliação do
      // Cardápio Web vive em outra tabela e ficava de fora da média da rede.
      getAvaliacoesCardapioWeb(activeUnitIds, year, month),
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

  // Nota média da rede: média ponderada pelas QUATRO plataformas (peso = nº
  // de avaliações). Ficou nas três de marketplace por um tempo e o comentário
  // dizia "3 plataformas" — que era o próprio sintoma, não uma decisão.
  const avals = [
    avalIfood,
    avalNine,
    avalKeeta,
    { total: avalCw.total, notaMedia: avalCw.media ?? 0 },
  ]
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

/**
 * Consolidado da rede AGREGADO sobre vários meses (período/ano). Soma os meses
 * inteiros do range — o DRE é mensal (CMV/operação por mês), então não recorta
 * dias; cada mês entra inteiro. A cobertura fica a do mês mais recente do range.
 */
export async function getNetworkReportForRange(
  months: { year: number; month: number }[],
  filterUnitIds?: string[],
): Promise<NetworkReport> {
  // Concorrência LIMITADA a 2 meses por vez: cada mês já dispara ~10 RPCs
  // pesadas (resumos das 3 plataformas, ~1,5s cada). Rodar todos os meses em
  // paralelo satura o Postgres (statement timeout); 2 por vez é seguro e ~2×
  // mais rápido que sequencial.
  const parts: NetworkReport[] = []
  for (let i = 0; i < months.length; i += 2) {
    const chunk = months.slice(i, i + 2)
    const res = await Promise.all(
      chunk.map((p) => getNetworkReportForMonth(p.year, p.month, filterUnitIds)),
    )
    parts.push(...res)
  }

  const totals: ResultadoTotals = {
    pedidos: 0,
    bruto: 0,
    receitaPropria: 0,
    taxasPlataforma: 0,
    promocoesLoja: 0,
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
  }
  let custoEntrega = 0
  let diasConsiderados = 0
  let totalAvaliacoes = 0
  let notaPond = 0
  let unitsComFaturamento = 0
  let unitsTotal = 0
  for (const r of parts) {
    totals.pedidos += r.totals.pedidos
    totals.bruto += r.totals.bruto
    totals.taxasPlataforma += r.totals.taxasPlataforma
    totals.promocoesLoja += r.totals.promocoesLoja
    totals.liquidoPlataformas += r.totals.liquidoPlataformas
    totals.vrLiquido += r.totals.vrLiquido
    totals.totalLiquido += r.totals.totalLiquido
    totals.cmvTotal += r.totals.cmvTotal
    totals.margemLiquida += r.totals.margemLiquida
    totals.custoOperacao += r.totals.custoOperacao
    totals.resultadoOperacional += r.totals.resultadoOperacional
    custoEntrega += r.custoEntrega
    diasConsiderados += r.diasConsiderados
    totalAvaliacoes += r.totalAvaliacoes
    if (r.notaMedia != null) notaPond += r.notaMedia * r.totalAvaliacoes
    unitsComFaturamento = Math.max(unitsComFaturamento, r.unitsComFaturamento)
    unitsTotal = Math.max(unitsTotal, r.unitsTotal)
  }
  totals.margemPct = totals.bruto > 0 ? (totals.margemLiquida / totals.bruto) * 100 : 0
  totals.resultadoPct =
    totals.bruto > 0 ? (totals.resultadoOperacional / totals.bruto) * 100 : 0
  totals.repassePct =
    totals.bruto > 0 ? (totals.liquidoPlataformas / totals.bruto) * 100 : 0

  return {
    totals,
    ticketMedio: totals.pedidos > 0 ? totals.bruto / totals.pedidos : 0,
    mediaPedidosDia:
      diasConsiderados > 0 ? Math.round(totals.pedidos / diasConsiderados) : 0,
    diasConsiderados,
    unitsComFaturamento,
    unitsTotal,
    notaMedia: totalAvaliacoes > 0 ? notaPond / totalAvaliacoes : null,
    totalAvaliacoes,
    custoEntrega,
    // cobertura do mês mais recente do range (a mais relevante p/ "falta importar")
    coverage: parts[parts.length - 1]!.coverage,
  }
}
