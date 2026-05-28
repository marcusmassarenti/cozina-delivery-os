/**
 * Helpers pra trabalhar com período (ano + mês) nas telas que filtram
 * por mês. O período vem do query param `?periodo=YYYY-MM` na URL.
 * Se não vier, default = mês corrente.
 */

export type Period = { year: number; month: number }

/** "2026-05" → { year: 2026, month: 5 }; "abc" → mês corrente */
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
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
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
