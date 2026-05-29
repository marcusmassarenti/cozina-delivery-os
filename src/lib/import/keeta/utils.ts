/**
 * Utilitários dos parsers do Keeta.
 *
 * Reaproveita helpers de DATA/STRING do 99 Food, mas tem parser de NÚMERO
 * próprio: o Keeta usa **ponto como decimal** (formato US, "70.99"), ao
 * contrário do 99 Food (vírgula decimal). Por isso NÃO dá pra reusar o
 * toNumber do 99 — ele removeria o ponto e inflaria tudo ~100×.
 *
 * Outras especificidades:
 *  - Datas como inteiro YYYYMMDD ("20260527")
 *  - Timestamps em 2 formatos: "20260527 20:02:51" e "2026-05-27 20:02:53"
 *  - Células vazias vêm como "-"
 */

export {
  toStoreId,
  parseCompactDate,
  parseCompactDateMaybe,
  toStringOrNull,
  formatDateOnly,
} from "../ninefood/utils"

import { toStringOrNull } from "../ninefood/utils"

/**
 * Número do Keeta: ponto = decimal, vírgula = milhar (formato US).
 * Aceita number puro, "70.99", "1,234.56", "3.76%", "-" e vazio.
 */
export function toNumber(v: unknown, fallback = 0): number {
  if (v == null || v === "" || v === "-") return fallback
  if (typeof v === "number") return isNaN(v) ? fallback : v
  const s = String(v).trim().replace(/%$/, "").replace(/,/g, "")
  if (s === "" || s === "-") return fallback
  const n = Number(s)
  return isNaN(n) ? fallback : n
}

/** Como toNumber, mas retorna null em vez do fallback. */
export function toNumberOrNull(v: unknown): number | null {
  if (v == null || v === "" || v === "-") return null
  if (typeof v === "number") return isNaN(v) ? null : v
  const s = String(v).trim().replace(/%$/, "").replace(/,/g, "")
  if (s === "" || s === "-") return null
  const n = Number(s)
  return isNaN(n) ? null : n
}

/**
 * Timestamp do Keeta. Aceita:
 *  - "20260527 20:02:51"  (YYYYMMDD HH:MM:SS)
 *  - "2026-05-27 20:02:53" (ISO com espaço)
 * Retorna null pra vazio/"-".
 */
export function parseKeetaDateTime(v: unknown): Date | null {
  const s = toStringOrNull(v)
  if (!s || s === "-") return null

  // ISO com hífen: "2026-05-27 20:02:53"
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (iso) {
    return new Date(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3]),
      Number(iso[4]),
      Number(iso[5]),
      Number(iso[6]),
    )
  }

  // Compacto: "20260527 20:02:51"
  const cmp = s.match(/^(\d{4})(\d{2})(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/)
  if (cmp) {
    return new Date(
      Number(cmp[1]),
      Number(cmp[2]) - 1,
      Number(cmp[3]),
      Number(cmp[4]),
      Number(cmp[5]),
      Number(cmp[6]),
    )
  }

  // Só data
  const dOnly = s.match(/^(\d{4})(\d{2})(\d{2})$/) || s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dOnly) {
    return new Date(Number(dOnly[1]), Number(dOnly[2]) - 1, Number(dOnly[3]))
  }
  return null
}

/** Pontuação de avaliação Keeta: "-" → null, número 1..5. */
export function parseRating(v: unknown): number | null {
  const s = toStringOrNull(v)
  if (!s || s === "-") return null
  const n = Number(s.replace(",", "."))
  if (isNaN(n) || n < 1 || n > 5) return null
  return Math.round(n)
}
