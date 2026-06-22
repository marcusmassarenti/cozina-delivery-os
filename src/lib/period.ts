/**
 * Helpers pra trabalhar com período (ano + mês) nas telas que filtram
 * por mês. O período vem do query param `?periodo=YYYY-MM` na URL.
 * Se não vier, default = mês corrente.
 */

export type Period = { year: number; month: number }

/** Fuso oficial do app — a rede é toda no Brasil. */
export const APP_TZ = "America/Sao_Paulo"

/**
 * Partes de "agora" no fuso de Brasília, independente do timezone do servidor.
 * A Vercel roda em UTC, então `new Date().getDate()` lá vira o dia seguinte
 * depois das 21h daqui. Use isto pra calcular "hoje/este mês/ontem" sem erro
 * de virada de dia.
 */
export function nowParts(): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  return { year: get("year"), month: get("month"), day: get("day") }
}

/** Período (ano + mês) atual em horário de Brasília. */
export function currentPeriod(): Period {
  const { year, month } = nowParts()
  return { year, month }
}

/** "2026-05" → { year: 2026, month: 5 }; "abc" → mês corrente (Brasília) */
export function parsePeriodParam(raw: string | string[] | undefined): Period {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value) {
    const m = value.match(/^(\d{4})-(\d{2})$/)
    if (m) {
      const year = Number(m[1])
      const month = Number(m[2])
      if (year >= 2020 && year <= 2100 && month >= 1 && month <= 12) {
        return { year, month }
      }
    }
  }
  return currentPeriod()
}

/** { year: 2026, month: 5 } → "2026-05" */
export function formatPeriodKey({ year, month }: Period): string {
  return `${year}-${String(month).padStart(2, "0")}`
}

/** { year: 2026, month: 5 } → "Maio/2026" */
export function formatPeriodLabel({ year, month }: Period): string {
  const meses = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ]
  return `${meses[month - 1]}/${year}`
}

/**
 * Dias "decorridos" no mês, pra usar como denominador de média/dia:
 *  - mês corrente (BRT) → dia de hoje (mês parcial; ex.: dia 3 → divide por 3)
 *  - mês passado → total de dias do mês (28/29/30/31)
 *  - mês futuro → total de dias do mês (não deveria ter dados)
 * Sempre ≥ 1 pra não dividir por zero.
 */
export function daysElapsedInMonth({ year, month }: Period): number {
  const lastDay = new Date(year, month, 0).getDate()
  const cur = currentPeriod()
  if (year === cur.year && month === cur.month) {
    const { day } = nowParts()
    return Math.min(Math.max(day, 1), lastDay)
  }
  return lastDay
}

/** Período anterior (mês anterior) */
export function previousPeriod({ year, month }: Period): Period {
  if (month === 1) return { year: year - 1, month: 12 }
  return { year, month: month - 1 }
}

/** Período posterior */
export function nextPeriod({ year, month }: Period): Period {
  if (month === 12) return { year: year + 1, month: 1 }
  return { year, month: month + 1 }
}

// ─── Range de datas (filtro de período custom) ───────────────────────

/** Intervalo [start, end] inclusivo no calendário. ISO YYYY-MM-DD. */
export type DateRange = {
  /** YYYY-MM-DD inclusivo. */
  start: string
  /** YYYY-MM-DD inclusivo. */
  end: string
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Limite duro: 92 dias (~3 meses) — evita range absurdo travando query. */
export const MAX_RANGE_DAYS = 92

/** YYYY-MM-DD → Date local (sem fuso). */
function isoToLocalDate(iso: string): Date {
  const m = ISO_RE.exec(iso)
  if (!m) return new Date(NaN)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** Diferença em dias entre 2 ISO (start..end inclusivos). end < start retorna -1. */
export function rangeDays({ start, end }: DateRange): number {
  const a = isoToLocalDate(start).getTime()
  const b = isoToLocalDate(end).getTime()
  if (Number.isNaN(a) || Number.isNaN(b)) return -1
  if (b < a) return -1
  return Math.round((b - a) / 86_400_000) + 1
}

/** YYYY-MM-DD do primeiro dia do mês. */
export function firstDayOfMonth({ year, month }: Period): string {
  return `${year}-${String(month).padStart(2, "0")}-01`
}

/** YYYY-MM-DD do último dia do mês. */
export function lastDayOfMonth({ year, month }: Period): string {
  const last = new Date(year, month, 0).getDate()
  return `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`
}

/** Range = mês inteiro. */
export function rangeFromPeriod(p: Period): DateRange {
  return { start: firstDayOfMonth(p), end: lastDayOfMonth(p) }
}

/**
 * True se o range cobre EXATAMENTE o mês completo (1º ao último dia).
 * Pro UI saber se está em modo "Mês" ou "Período custom".
 */
export function rangeIsFullMonth({ start, end }: DateRange): boolean {
  const a = ISO_RE.exec(start)
  const b = ISO_RE.exec(end)
  if (!a || !b) return false
  if (a[1] !== b[1] || a[2] !== b[2]) return false // anos/meses diferentes
  if (a[3] !== "01") return false
  const lastDay = new Date(Number(a[1]), Number(a[2]), 0).getDate()
  return Number(b[3]) === lastDay
}

/**
 * Lê range da query string:
 *  - ?inicio=YYYY-MM-DD&fim=YYYY-MM-DD → range custom
 *  - ?periodo=YYYY-MM → mês inteiro (compat com seletor antigo)
 *  - nada → mês corrente inteiro
 *
 * Range inválido (datas zoadas, end<start, > MAX_RANGE_DAYS) cai no mês corrente.
 */
export function parseRangeFromSp(sp: {
  inicio?: string | string[]
  fim?: string | string[]
  periodo?: string | string[]
}): DateRange {
  const get = (raw: string | string[] | undefined) =>
    Array.isArray(raw) ? raw[0] : raw
  const inicio = get(sp.inicio)
  const fim = get(sp.fim)
  if (inicio && fim && ISO_RE.test(inicio) && ISO_RE.test(fim)) {
    const r = { start: inicio, end: fim }
    const days = rangeDays(r)
    if (days >= 1 && days <= MAX_RANGE_DAYS) return r
  }
  // Mês inteiro a partir do ?periodo ou mês corrente
  return rangeFromPeriod(parsePeriodParam(sp.periodo))
}

/**
 * Label amigável do range:
 *  - mês completo → "Junho/2026"
 *  - mesmo mês, dias diferentes → "01–15 jun/2026"
 *  - meses diferentes → "26/05 – 10/06/2026"
 */
export function formatRangeLabel(r: DateRange): string {
  if (rangeIsFullMonth(r)) {
    const m = ISO_RE.exec(r.start)!
    return formatPeriodLabel({ year: Number(m[1]), month: Number(m[2]) })
  }
  const a = ISO_RE.exec(r.start)!
  const b = ISO_RE.exec(r.end)!
  const mesesAbrev = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
  ]
  if (a[1] === b[1] && a[2] === b[2]) {
    // Mesmo mês: "01–15 jun/2026"
    return `${a[3]}–${b[3]} ${mesesAbrev[Number(a[2]) - 1]}/${a[1]}`
  }
  // Meses diferentes: "26/05 – 10/06/2026"
  return `${a[3]}/${a[2]} – ${b[3]}/${b[2]}/${b[1]}`
}

/**
 * Se o range cabe em um único mês, devolve esse mês — alimenta filtros
 * por (ref_year, ref_month) que usam índice. Range cross-month retorna null.
 */
export function rangeSingleMonth(r: DateRange): Period | null {
  const a = ISO_RE.exec(r.start)
  const b = ISO_RE.exec(r.end)
  if (!a || !b) return null
  if (a[1] !== b[1] || a[2] !== b[2]) return null
  return { year: Number(a[1]), month: Number(a[2]) }
}
