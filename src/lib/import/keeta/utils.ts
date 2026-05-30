/**
 * Utilitários dos parsers do Keeta.
 *
 * Reaproveita helpers de DATA/STRING do 99 Food, mas tem parser de NÚMERO
 * próprio. O Keeta exporta em DOIS formatos de decimal dependendo da loja/
 * configuração: umas com ponto ("113.69", formato US) e outras com vírgula
 * ("113,69", formato BR). Por isso o parser detecta o separador decimal em
 * cada valor, em vez de assumir um só (assumir ponto inflava as lojas BR ~100×,
 * ex.: "113,69" → "11369").
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
 * Normaliza um número que pode vir em formato US (ponto decimal) ou BR
 * (vírgula decimal), devolvendo uma string parseável pelo Number().
 *
 * Regras:
 *  - Tem ponto E vírgula → o ÚLTIMO separador é o decimal; o outro é milhar.
 *      "1.234,56" → "1234.56"   |   "1,234.56" → "1234.56"
 *  - Só vírgula → decimal quando vem 1-2 dígitos depois ("113,69" → "113.69");
 *      3 dígitos ou várias vírgulas = milhar ("1,234" → "1234").
 *  - Só ponto (ou nenhum separador) → mantém (ponto = decimal, formato US).
 */
function normalizeNumeric(raw: string): string {
  let s = raw.trim().replace(/%$/, "").replace(/\s/g, "")
  const hasDot = s.includes(".")
  const hasComma = s.includes(",")
  if (hasDot && hasComma) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".")
    } else {
      s = s.replace(/,/g, "")
    }
  } else if (hasComma) {
    const parts = s.split(",")
    const last = parts[parts.length - 1]
    if (parts.length === 2 && last.length !== 3) {
      s = s.replace(",", ".")
    } else {
      s = s.replace(/,/g, "")
    }
  }
  return s
}

/**
 * Número do Keeta. Detecta ponto OU vírgula como decimal (ver normalizeNumeric).
 * Aceita number puro, "70.99", "113,69", "1.234,56", "3.76%", "-" e vazio.
 */
export function toNumber(v: unknown, fallback = 0): number {
  if (v == null || v === "" || v === "-") return fallback
  if (typeof v === "number") return isNaN(v) ? fallback : v
  const s = normalizeNumeric(String(v))
  if (s === "" || s === "-") return fallback
  const n = Number(s)
  return isNaN(n) ? fallback : n
}

/** Como toNumber, mas retorna null em vez do fallback. */
export function toNumberOrNull(v: unknown): number | null {
  if (v == null || v === "" || v === "-") return null
  if (typeof v === "number") return isNaN(v) ? null : v
  const s = normalizeNumeric(String(v))
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

/**
 * Moeda do "Pedidos recentes" do Keeta: vem como "R$ 66,46", "-R$ 7,48",
 * "R$ 0,00". Tira o "R$", preserva o sinal e reaproveita o toNumber (que
 * já lida com vírgula/ponto decimal). "-" e vazio → null.
 */
export function toKeetaMoneyOrNull(v: unknown): number | null {
  if (v == null || v === "" || v === "-") return null
  if (typeof v === "number") return isNaN(v) ? null : v
  const s = String(v).replace(/R\$/gi, "").trim()
  if (s === "" || s === "-") return null
  return toNumberOrNull(s)
}

/**
 * Timestamp do "Pedidos recentes": formato BR "29/05/2026 19:43" (DD/MM/YYYY
 * HH:MM, segundos opcionais). Aceita só a data também. Vazio/"-"/"/" → null.
 */
export function parseKeetaBrDateTime(v: unknown): Date | null {
  const s = toStringOrNull(v)
  if (!s || s === "-" || s === "/") return null
  const m = s.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/,
  )
  if (!m) return null
  return new Date(
    Number(m[3]),
    Number(m[2]) - 1,
    Number(m[1]),
    m[4] ? Number(m[4]) : 0,
    m[5] ? Number(m[5]) : 0,
    m[6] ? Number(m[6]) : 0,
  )
}

/** Pontuação de avaliação Keeta: "-" → null, número 1..5. */
export function parseRating(v: unknown): number | null {
  const s = toStringOrNull(v)
  if (!s || s === "-") return null
  const n = Number(s.replace(",", "."))
  if (isNaN(n) || n < 1 || n > 5) return null
  return Math.round(n)
}
