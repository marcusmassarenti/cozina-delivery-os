/**
 * Dados do Ranking de lojas, com período flexível (mês, range de dias ou ano).
 *
 * Modelo único: soma os MESES que o range toca.
 *  - mês cheio → soma direto (matriz diária do mês);
 *  - mês parcial → só os dias do range (matriz diária com dateRange);
 *  - vários meses (ex.: ano inteiro) → soma de todos.
 *
 * Faturamento/pedidos/por-plataforma vêm da MATRIZ DIÁRIA (mesma fonte/definição
 * de bruto = cesta do DRE). Margem só existe quando TODOS os meses do range são
 * cheios (custo/CMV é mensal) — em range parcial a margem fica null ("—").
 *
 * A linha de evolução é sempre os 12 meses do ano do início do range (mesma
 * fonte), pra dar o contexto da tendência independente do recorte escolhido.
 */
import "server-only"

import type { PlatformId } from "@/components/platform-logo"
import { getDailyReportMatrix } from "@/lib/data/relatorio-diario"
import type { ReportPlatform } from "@/lib/data/relatorio-diario-types"
import { getNetworkResultadoForMonth } from "@/lib/data/resultado"
import {
  firstDayOfMonth,
  lastDayOfMonth,
  type DateRange,
} from "@/lib/period"

const PLATS: PlatformId[] = ["ifood", "99food", "keeta", "cardapioweb"]

export type RankingPlatformBreak = Record<PlatformId, number>

export type RankingRow = {
  unitId: string
  unitCode: string
  unitName: string
  bruto: number
  pedidos: number
  ticket: number
  /** % sobre o bruto; null quando indisponível (range parcial sem custo mensal) */
  margemPct: number | null
  temCusto: boolean
  perPlatform: RankingPlatformBreak
}

export type RankingEvolutionPoint = {
  year: number
  month: number
  bruto: number
}

export type RankingData = {
  rows: RankingRow[]
  totals: {
    bruto: number
    pedidos: number
    ticket: number
    perPlatform: RankingPlatformBreak
  }
  /** participação da rede por plataforma (= totals.perPlatform) */
  platformTotals: RankingPlatformBreak
  evolution: RankingEvolutionPoint[]
  /** true quando a margem é confiável (todos os meses do range são cheios) */
  marginAvailable: boolean
}

type UnitLite = { id: string; code: string; name: string }

type MonthSeg = {
  year: number
  month: number
  isFull: boolean
  dayRange?: DateRange
}

/** Meses que o range toca, com o sub-range de dias dentro de cada um. */
function monthsInRange(range: DateRange): MonthSeg[] {
  const startY = Number(range.start.slice(0, 4))
  const startM = Number(range.start.slice(5, 7))
  const endY = Number(range.end.slice(0, 4))
  const endM = Number(range.end.slice(5, 7))

  const segs: MonthSeg[] = []
  let y = startY
  let m = startM
  // guard: no máximo 24 meses (2 anos) pra não estourar
  for (let i = 0; i < 24; i++) {
    const monthFirst = firstDayOfMonth({ year: y, month: m })
    const monthLast = lastDayOfMonth({ year: y, month: m })
    const segStart = range.start > monthFirst ? range.start : monthFirst
    const segEnd = range.end < monthLast ? range.end : monthLast
    const isFull = segStart === monthFirst && segEnd === monthLast
    segs.push({
      year: y,
      month: m,
      isFull,
      dayRange: isFull ? undefined : { start: segStart, end: segEnd },
    })
    if (y === endY && m === endM) break
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return segs
}

const emptyBreak = (): RankingPlatformBreak => ({
  ifood: 0,
  "99food": 0,
  keeta: 0,
  cardapioweb: 0,
})

export async function getRankingData(
  range: DateRange,
  units: UnitLite[],
): Promise<RankingData> {
  if (units.length === 0) {
    return {
      rows: [],
      totals: { bruto: 0, pedidos: 0, ticket: 0, perPlatform: emptyBreak() },
      platformTotals: emptyBreak(),
      evolution: [],
      marginAvailable: false,
    }
  }

  const segs = monthsInRange(range)
  const marginAvailable = segs.every((s) => s.isFull)
  const startYear = segs[0]?.year ?? Number(range.start.slice(0, 4))

  // --- Faturamento/pedidos/plataforma: 1 matriz por (mês × plataforma) ---
  type Cell = { seg: MonthSeg; plat: PlatformId; promise: ReturnType<typeof getDailyReportMatrix> }
  const cells: Cell[] = []
  for (const seg of segs) {
    for (const plat of PLATS) {
      cells.push({
        seg,
        plat,
        promise: getDailyReportMatrix(
          seg.year,
          seg.month,
          plat as ReportPlatform,
          units,
          seg.dayRange,
        ),
      })
    }
  }

  // --- Evolução: rede mês a mês no ano do início (12 pontos, mesma fonte) ---
  const evoMonths = Array.from({ length: 12 }, (_, i) => i + 1)
  const evoPromises = evoMonths.map((m) =>
    getDailyReportMatrix(startYear, m, "todas" as ReportPlatform, units),
  )

  // --- Margem: só quando todos os meses são cheios (DRE é mensal) ---
  const resultadoPromises = marginAvailable
    ? segs.map((s) =>
        getNetworkResultadoForMonth(
          s.year,
          s.month,
          units.map((u) => u.id),
        ),
      )
    : []

  const [cellResults, evoResults, resultadoResults] = await Promise.all([
    Promise.all(cells.map((c) => c.promise)),
    Promise.all(evoPromises),
    Promise.all(resultadoPromises),
  ])

  // Acumula por unidade
  const meta = new Map<string, UnitLite>(units.map((u) => [u.id, u]))
  const perPlat = new Map<string, RankingPlatformBreak>()
  const pedidos = new Map<string, number>()
  for (let i = 0; i < cells.length; i++) {
    const { plat } = cells[i]
    const matrix = cellResults[i]
    for (const row of matrix.units) {
      const pb = perPlat.get(row.unitId) ?? emptyBreak()
      pb[plat] += row.totalFaturamento
      perPlat.set(row.unitId, pb)
      pedidos.set(
        row.unitId,
        (pedidos.get(row.unitId) ?? 0) + row.totalPedidos,
      )
    }
  }

  // Margem agregada por unidade (Σ margem líquida / Σ bruto do DRE)
  const margLiq = new Map<string, number>()
  const margBruto = new Map<string, number>()
  const temCustoSet = new Set<string>()
  for (const res of resultadoResults) {
    for (const r of res.rows) {
      if (r.temCusto) {
        margLiq.set(
          r.unitId,
          (margLiq.get(r.unitId) ?? 0) + (r.margemPct / 100) * r.bruto,
        )
        margBruto.set(r.unitId, (margBruto.get(r.unitId) ?? 0) + r.bruto)
        temCustoSet.add(r.unitId)
      }
    }
  }

  const rows: RankingRow[] = []
  const totalsBreak = emptyBreak()
  let totalPedidos = 0
  for (const [unitId, pb] of perPlat) {
    const u = meta.get(unitId)
    if (!u) continue
    const bruto = pb.ifood + pb["99food"] + pb.keeta + pb.cardapioweb
    const ped = pedidos.get(unitId) ?? 0
    const tc = temCustoSet.has(unitId)
    const mb = margBruto.get(unitId) ?? 0
    rows.push({
      unitId,
      unitCode: u.code,
      unitName: u.name,
      bruto,
      pedidos: ped,
      ticket: ped > 0 ? bruto / ped : 0,
      margemPct: marginAvailable && tc && mb > 0 ? (margLiq.get(unitId)! / mb) * 100 : null,
      temCusto: tc,
      perPlatform: pb,
    })
    totalsBreak.ifood += pb.ifood
    totalsBreak["99food"] += pb["99food"]
    totalsBreak.keeta += pb.keeta
    totalPedidos += ped
  }

  const totalBruto = totalsBreak.ifood + totalsBreak["99food"] + totalsBreak.keeta

  const evolutionFull: RankingEvolutionPoint[] = evoResults.map((m, i) => ({
    year: startYear,
    month: evoMonths[i],
    bruto: m.totalFaturamento,
  }))
  // Corta os meses VAZIOS do FIM (ex.: jul–dez ainda sem dado) pra a linha não
  // despencar a zero. Mantém zeros do meio (queda real é informação).
  let lastWithData = -1
  for (let i = 0; i < evolutionFull.length; i++) {
    if (evolutionFull[i].bruto > 0) lastWithData = i
  }
  const evolution = evolutionFull.slice(0, Math.max(lastWithData + 1, 1))

  return {
    rows,
    totals: {
      bruto: totalBruto,
      pedidos: totalPedidos,
      ticket: totalPedidos > 0 ? totalBruto / totalPedidos : 0,
      perPlatform: totalsBreak,
    },
    platformTotals: totalsBreak,
    evolution,
    marginAvailable,
  }
}
