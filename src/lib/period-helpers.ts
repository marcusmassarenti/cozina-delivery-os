/**
 * Helper compartilhado pelas pages que migraram do `parsePeriodParam`
 * (legado, só mês) pro `parseRangeFromSp` (mês ou range custom).
 *
 * Uso típico:
 *   const { range, year, month, isFullMonth, queryRange } = readPeriod(sp)
 *
 * - `range` = DateRange ativo (mês inteiro corrente quando sem params)
 * - `year/month` = mês do INÍCIO do range (pra queries por (ref_year, ref_month))
 * - `isFullMonth` = true quando o range é exatamente o mês todo
 * - `queryRange` = undefined quando isFullMonth (caminho legado), senão o range
 *   pra passar pra queries que aceitam dateRange opcional
 */
import {
  parseRangeFromSp,
  rangeIsFullMonth,
  type DateRange,
} from "@/lib/period"

export type PeriodReadResult = {
  range: DateRange
  year: number
  month: number
  isFullMonth: boolean
  queryRange: DateRange | undefined
}

export function readPeriod(sp: {
  periodo?: string | string[]
  inicio?: string | string[]
  fim?: string | string[]
}): PeriodReadResult {
  const range = parseRangeFromSp(sp)
  const isFullMonth = rangeIsFullMonth(range)
  const year = Number(range.start.slice(0, 4))
  const month = Number(range.start.slice(5, 7))
  return {
    range,
    year,
    month,
    isFullMonth,
    queryRange: isFullMonth ? undefined : range,
  }
}
