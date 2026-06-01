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
