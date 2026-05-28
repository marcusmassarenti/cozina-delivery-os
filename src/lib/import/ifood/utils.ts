/**
 * Utilitários compartilhados pelos parsers do iFood.
 */

import type { ParsedPeriod } from "./types"

/**
 * Parseia "27/05/2026" ou "21/05/2026 - 27/05/2026".
 */
export function parsePeriod(raw: string | null | undefined): ParsedPeriod {
  if (!raw || typeof raw !== "string") {
    throw new Error(`Período inválido: ${raw}`)
  }
  const trimmed = raw.trim()
  const parts = trimmed.split(/\s*-\s*/)
  if (parts.length === 1) {
    const d = parseBrDate(parts[0])
    return { raw: trimmed, start: d, end: d, isDaily: true }
  }
  if (parts.length === 2) {
    const start = parseBrDate(parts[0])
    const end = parseBrDate(parts[1])
    return {
      raw: trimmed,
      start,
      end,
      isDaily: start.getTime() === end.getTime(),
    }
  }
  throw new Error(`Período em formato inesperado: "${raw}"`)
}

/** "27/05/2026" → Date em meia-noite local */
export function parseBrDate(s: string): Date {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) throw new Error(`Data inválida (esperado dd/mm/aaaa): "${s}"`)
  const [, d, mo, y] = m
  return new Date(Number(y), Number(mo) - 1, Number(d))
}

/** ISO ou similar → Date (ou null se vazio/inválido) */
export function parseIsoDateMaybe(v: unknown): Date | null {
  if (v == null || v === "") return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v
  if (typeof v === "number") {
    // Excel serial date (raro nesses relatórios, mas defensivo)
    const d = excelSerialToDate(v)
    return isNaN(d.getTime()) ? null : d
  }
  if (typeof v === "string") {
    const trimmed = v.trim()
    if (!trimmed) return null
    const d = new Date(trimmed)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

/** "2026-05-01" → Date (date-only, sem timezone) */
export function parseDateOnlyMaybe(v: unknown): Date | null {
  if (v == null || v === "") return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) {
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    }
  }
  return parseIsoDateMaybe(v)
}

/** Excel armazena datas como dias desde 1899-12-30 */
function excelSerialToDate(serial: number): Date {
  const epoch = new Date(Date.UTC(1899, 11, 30))
  return new Date(epoch.getTime() + serial * 86400000)
}

/** Force-coerce pra number, retornando fallback se NaN/null */
export function toNumber(v: unknown, fallback = 0): number {
  if (v == null || v === "") return fallback
  if (typeof v === "number") return isNaN(v) ? fallback : v
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."))
    return isNaN(n) ? fallback : n
  }
  return fallback
}

/** Mesmo que toNumber mas devolve null em vez de fallback */
export function toNumberOrNull(v: unknown): number | null {
  if (v == null || v === "") return null
  if (typeof v === "number") return isNaN(v) ? null : v
  if (typeof v === "string") {
    const n = Number(v.replace(",", "."))
    return isNaN(n) ? null : n
  }
  return null
}

/** Trim + null pra string vazia */
export function toStringOrNull(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === "" ? null : s
}

/** "SIM"/"NAO" → true/false/null */
export function parseSimNao(v: unknown): boolean | null {
  if (v == null) return null
  const s = String(v).trim().toUpperCase()
  if (s === "SIM" || s === "S" || s === "TRUE" || s === "1") return true
  if (s === "NAO" || s === "NÃO" || s === "N" || s === "FALSE" || s === "0") return false
  return null
}

/** "2026-05" → { year: 2026, month: 5 } */
export function parseCompetencia(raw: string): { year: number; month: number } {
  const m = raw.trim().match(/^(\d{4})-(\d{2})$/)
  if (!m) throw new Error(`Competência inválida (esperado AAAA-MM): "${raw}"`)
  return { year: Number(m[1]), month: Number(m[2]) }
}
