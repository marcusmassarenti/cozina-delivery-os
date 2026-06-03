import * as XLSX from "xlsx"

/**
 * Parser da planilha "Produtos vendidos" que o JK exporta toda semana.
 * Estrutura: título "Produtos vendidos", datas (inicial/final) em serial Excel,
 * cabeçalho com "Categoria" + "Quantidade", e linhas item a item.
 *
 * A gente só precisa de: Categoria (col 0) + Quantidade somada por categoria,
 * e o período da semana. O preço vem do cadastro (não do arquivo).
 */

export type ProdutoCategoria = { categoria: string; quantidade: number }

export type ParsedProdutosVendidos =
  | {
      reportType: "produtos_vendidos"
      periodoInicio: string // YYYY-MM-DD
      periodoFim: string
      categorias: ProdutoCategoria[]
    }
  | { reportType: "unknown"; error: string }

function norm(v: unknown): string {
  return String(v ?? "").trim()
}

function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  const s = norm(v)
  if (!s) return null
  // aceita "1.234,56" ou "1234.56"
  const n = Number(s.replace(/\./g, "").replace(",", "."))
  return Number.isFinite(n) ? n : null
}

/** Detecta o workbook "Produtos vendidos" (título + Categoria + Quantidade). */
export function isProdutosVendidosWorkbook(wb: XLSX.WorkBook): boolean {
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return false
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
    defval: "",
  })
  const flat = rows
    .slice(0, 6)
    .flat()
    .map((c) => norm(c).toLowerCase())
  const hasTitulo = flat.some((c) => c.includes("produtos vendidos"))
  const hasCategoria = flat.some((c) => c === "categoria")
  const hasQtd = flat.some((c) => c.includes("quantidade"))
  return hasTitulo && hasCategoria && hasQtd
}

/** Serial Excel (sistema 1900) → ISO YYYY-MM-DD. */
function excelSerialToISO(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000
  return new Date(ms).toISOString().slice(0, 10)
}

function cellToISO(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === "number" && v > 20000 && v < 80000)
    return excelSerialToISO(v)
  const m = norm(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (m) {
    const [, d, mo, y] = m
    const yy = y.length === 2 ? `20${y}` : y
    return `${yy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`
  }
  return null
}

export function parseProdutosVendidos(
  buf: ArrayBuffer,
): ParsedProdutosVendidos {
  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(buf, { type: "array" })
  } catch {
    return { reportType: "unknown", error: "Não consegui ler o arquivo." }
  }
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return { reportType: "unknown", error: "Planilha vazia." }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
    defval: "",
  })

  // cabeçalho: linha cuja alguma célula é exatamente "Categoria"
  let headerIdx = -1
  let catCol = 0
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const idx = rows[i].findIndex((c) => norm(c).toLowerCase() === "categoria")
    if (idx >= 0) {
      headerIdx = i
      catCol = idx
      break
    }
  }
  if (headerIdx < 0)
    return { reportType: "unknown", error: "Não achei a coluna Categoria." }

  // datas da semana (linhas acima/no cabeçalho)
  let periodoInicio: string | null = null
  let periodoFim: string | null = null
  for (let i = 0; i <= headerIdx; i++) {
    const r = rows[i]
    for (let j = 0; j < r.length; j++) {
      const lbl = norm(r[j]).toLowerCase()
      if (lbl.startsWith("data inicial")) {
        for (let k = j + 1; k < r.length; k++) {
          const iso = cellToISO(r[k])
          if (iso) {
            periodoInicio = iso
            break
          }
        }
      }
      if (lbl.startsWith("data final")) {
        for (let k = j + 1; k < r.length; k++) {
          const iso = cellToISO(r[k])
          if (iso) {
            periodoFim = iso
            break
          }
        }
      }
    }
  }

  // soma quantidade por categoria.
  // Quantidade = 2º número da linha depois da descrição (col 0=categoria,
  // 1=descrição; depois vêm cód.item, QUANTIDADE, valor unit, valor total).
  const map = new Map<string, number>()
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    const categoria = norm(r[catCol])
    if (!categoria) continue
    const nums: number[] = []
    for (let j = catCol + 2; j < r.length; j++) {
      if (norm(r[j]) === "") continue
      const n = toNum(r[j])
      if (n != null) nums.push(n)
    }
    const quantidade = nums.length >= 2 ? nums[1] : (nums[0] ?? 0)
    map.set(categoria, (map.get(categoria) ?? 0) + (quantidade || 0))
  }

  const categorias = [...map.entries()]
    .map(([categoria, quantidade]) => ({ categoria, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade)

  if (categorias.length === 0)
    return { reportType: "unknown", error: "Nenhuma categoria encontrada." }
  if (!periodoInicio || !periodoFim)
    return {
      reportType: "unknown",
      error: "Não achei as datas (inicial/final) da semana.",
    }

  return { reportType: "produtos_vendidos", periodoInicio, periodoFim, categorias }
}
