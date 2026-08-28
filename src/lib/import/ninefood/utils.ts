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
 * Normaliza um número que pode vir em formato US (ponto decimal) ou BR
 * (vírgula decimal), devolvendo uma string parseável pelo Number().
 *
 * Regras:
 *  - Tem ponto E vírgula → o ÚLTIMO separador é o decimal; o outro é milhar.
 *      "1.234,56" → "1234.56"   |   "1,234.56" → "1234.56"
 *  - Só vírgula → decimal quando vem 1-2 dígitos depois ("113,69" → "113.69");
 *      3 dígitos ou várias vírgulas = milhar ("1,234" → "1234").
 *  - Só ponto → decimal quando vem 1-2 dígitos depois ("113.69" → "113.69");
 *      3 dígitos ou vários pontos = milhar ("2.097" → "2097"). Mesma régua da
 *      vírgula: dinheiro não tem 3 casas decimais.
 *
 * Compartilhado com o parser do Keeta. Antes o 99 Food assumia SEMPRE ponto =
 * milhar (`.replace(/\./g,"")`), o que inflava 100× quando o decimal vinha com
 * ponto: "113.69" → 11369.
 */
export function normalizeNumeric(raw: string): string {
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
  } else if (hasDot) {
    /* ⚠️ PONTO SOZINHO COM 3 DÍGITOS DEPOIS É MILHAR, NÃO DECIMAL.
     *
     * O ramo da vírgula acima já aplicava essa régua ("1,234" = mil duzentos
     * e trinta e quatro); o do ponto não, e a assimetria custou dinheiro de
     * verdade. O relatório "Dados da loja" da 99 é pt-BR puro: vírgula
     * decimal, ponto milhar. Um dia cujo faturamento é redondo sai sem
     * decimais — "2.097" — e era lido como R$ 2,10.
     *
     * Medido em 28/08/26 na Pizzaria Forno a Lenha 4 (DG FOODS), agosto: o
     * bruto do mês saía R$ 46.892,50 quando o relatório diz R$ 51.886,50.
     * Cinco mil reais somem, e somem PARA BAIXO — o lojista vê o canal pior
     * do que é e ninguém confere um número ruim.
     *
     * A regra separa os dois formatos sem ambiguidade prática: dinheiro tem
     * 1 ou 2 casas decimais, nunca 3. Então "113.69" e "300.00" seguem
     * decimais (formato US do relatório de itens), e "2.097" e "1.234.567"
     * viram milhar. */
    const parts = s.split(".")
    const last = parts[parts.length - 1]
    if (parts.length > 2 || last.length === 3) {
      s = s.replace(/\./g, "")
    }
  }
  return s
}

/**
 * Number do 99 Food: pode vir como
 *  - number puro: 12345
 *  - string com vírgula decimal: "540,8"
 *  - string com ponto decimal (formato US): "113.69"
 *  - string vazia ou "0": 0
 *  - null/undefined: 0
 * Detecta o separador decimal por valor (ponto OU vírgula) — ver normalizeNumeric.
 */
export function toNumber(v: unknown, fallback = 0): number {
  if (v == null || v === "") return fallback
  if (typeof v === "number") return isNaN(v) ? fallback : v
  if (typeof v === "string") {
    const s = normalizeNumeric(v)
    if (s === "") return fallback
    const n = Number(s)
    return isNaN(n) ? fallback : n
  }
  return fallback
}

/** Como toNumber mas retorna null em vez de fallback. */
export function toNumberOrNull(v: unknown): number | null {
  if (v == null || v === "") return null
  if (typeof v === "number") return isNaN(v) ? null : v
  if (typeof v === "string") {
    const s = normalizeNumeric(v)
    if (s === "") return null
    const n = Number(s)
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
