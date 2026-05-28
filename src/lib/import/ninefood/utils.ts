/**
 * Utilitários compartilhados pelos parsers do 99 Food.
 *
 * Diferenças relevantes do 99 Food vs iFood:
 *  - Data vem ISO ("2026-05-27"), não dd/mm/yyyy
 *  - Moeda vem com vírgula ("540,8")
 *  - Percentual vem com ponto + sufixo ("4.04%")
 *  - ID da loja vem com 19 dígitos — precisa ser STRING sempre
 */

/** Lê o ID da loja como string (preserva os 19 dígitos). */
export function toStoreId(v: unknown): string {
  if (v == null) return ""
  if (typeof v === "number") {
    // Se virou number perdemos precisão. Mas guardamos como string
    // até onde der pra reconciliar.
    if (Number.isInteger(v) && v <= Number.MAX_SAFE_INTEGER) {
      return String(v)
    }
    // Acima de MAX_SAFE_INTEGER o JS já mudou os últimos dígitos.
    return String(v)
  }
  return String(v).trim()
}

/** "2026-05-27" → Date local meia-noite. */
export function parseIsoDate(s: unknown): Date {
  if (s instanceof Date) return s
  if (typeof s !== "string") {
    throw new Error(`Data inválida (esperado ISO yyyy-mm-dd): ${JSON.stringify(s)}`)
  }
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) throw new Error(`Data fora do padrão yyyy-mm-dd: "${s}"`)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/**
 * Data no formato YYYYMMDD ("20260527") — usado pelo "Dados do pedido".
 * Aceita ISO também por defensividade.
 */
export function parseCompactDate(v: unknown): Date {
  if (v instanceof Date) return v
  if (typeof v === "number") {
    // ex.: 20260527 como number
    const s = String(v)
    return parseCompactDate(s)
  }
  if (typeof v !== "string") {
    throw new Error(`Data inválida (YYYYMMDD): ${JSON.stringify(v)}`)
  }
  const trimmed = v.trim()
  const m8 = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (m8) {
    return new Date(Number(m8[1]), Number(m8[2]) - 1, Number(m8[3]))
  }
  // fallback pra ISO ("2026-05-27")
  return parseIsoDate(trimmed)
}

/** Como parseCompactDate mas retorna null se inválido/vazio. */
export function parseCompactDateMaybe(v: unknown): Date | null {
  if (v == null || v === "") return null
  try {
    return parseCompactDate(v)
  } catch {
    return null
  }
}

/**
 * Horário ISO sem timezone — "2026-05-27 22:39:00". Mantém como local Date.
 * Retorna null pra string vazia.
 */
export function parseTimestampMaybe(v: unknown): Date | null {
  if (v == null || v === "") return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v
  if (typeof v === "string") {
    const trimmed = v.trim()
    if (!trimmed) return null
    // "2026-05-27 22:39:00" → "2026-05-27T22:39:00" pra Date parsear
    const iso = trimmed.replace(" ", "T")
    const d = new Date(iso)
    if (isNaN(d.getTime())) return null
    return d
  }
  return null
}

/** "Sim" / "Não" → boolean | null */
export function parseSimNao(v: unknown): boolean | null {
  if (v == null) return null
  const s = String(v).trim().toLowerCase()
  if (s === "") return null
  if (s === "sim" || s === "yes" || s === "true") return true
  if (s === "não" || s === "nao" || s === "no" || s === "false") return false
  return null
}

/**
 * Number do 99 Food: pode vir como
 *  - number puro: 12345
 *  - string com vírgula decimal: "540,8"
 *  - string vazia ou "0": 0
 *  - null/undefined: 0
 */
export function toNumber(v: unknown, fallback = 0): number {
  if (v == null || v === "") return fallback
  if (typeof v === "number") return isNaN(v) ? fallback : v
  if (typeof v === "string") {
    const cleaned = v.trim().replace(/\./g, "").replace(",", ".")
    // Se ainda tem vírgula DEPOIS de já trocar (e.g. "1.234,56" → "1234.56") tudo certo.
    // Mas e se vier só "540,8"? Cleaned vira "540.8" → ok.
    // Se vier "300.00%" — primeiro removemos %.
    const noPct = cleaned.endsWith("%") ? cleaned.slice(0, -1) : cleaned
    const n = Number(noPct)
    return isNaN(n) ? fallback : n
  }
  return fallback
}

/** Como toNumber mas retorna null em vez de fallback. */
export function toNumberOrNull(v: unknown): number | null {
  if (v == null || v === "") return null
  if (typeof v === "number") return isNaN(v) ? null : v
  if (typeof v === "string") {
    const cleaned = v.trim().replace(/\./g, "").replace(",", ".")
    const noPct = cleaned.endsWith("%") ? cleaned.slice(0, -1) : cleaned
    if (noPct === "") return null
    const n = Number(noPct)
    return isNaN(n) ? null : n
  }
  return null
}

/**
 * Percentual do 99 Food: depende do relatório.
 *  - "Dados do item":  separador PONTO  → "4.04%", "300.00%"
 *  - "Dados da loja":  separador VÍRGULA → "5,56%", "88,24%", "100%"
 *
 * Aceita ambos: detecta qual separador é decimal e qual é milhar.
 * Como percentuais raramente passam de 999%, ponto é decimal SE for o
 * último separador, vírgula idem. Heurística: se ambos aparecem, o que
 * vem por último é decimal. Se só um aparece, trata como decimal.
 */
export function toPercent(v: unknown): number | null {
  if (v == null || v === "") return null
  if (typeof v === "number") return isNaN(v) ? null : v
  if (typeof v === "string") {
    const trimmed = v.trim()
    if (!trimmed) return null
    let s = trimmed.endsWith("%") ? trimmed.slice(0, -1).trim() : trimmed
    const lastDot = s.lastIndexOf(".")
    const lastComma = s.lastIndexOf(",")
    if (lastDot >= 0 && lastComma >= 0) {
      // Os 2 aparecem — o que vier por último é decimal, o outro é milhar
      if (lastComma > lastDot) {
        s = s.replace(/\./g, "").replace(",", ".")
      } else {
        s = s.replace(/,/g, "")
      }
    } else if (lastComma >= 0) {
      s = s.replace(",", ".")
    }
    // Senão só ponto (já é decimal) ou nenhum → noop
    const n = Number(s)
    return isNaN(n) ? null : n
  }
  return null
}

/** Trim + null pra vazio. */
export function toStringOrNull(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s === "" ? null : s
}

/** "YYYY-MM-DD" pra Postgres date. */
export function formatDateOnly(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}
