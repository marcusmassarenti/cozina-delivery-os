import * as XLSX from "xlsx"

/**
 * Parser da planilha "Produtos vendidos" que o JK exporta toda semana.
 * Estrutura: título "Produtos vendidos", datas (inicial/final) em serial Excel,
 * cabeçalho com "Descrição" + "Cód. item" + "Quantidade", e linhas item a item.
 *
 * O modelo real NÃO traz categoria — então referenciamos por CÓDIGO (Cód. item).
 * Pegamos: código + descrição + quantidade somada por código, e o período.
 * O preço vem do cadastro (não do arquivo).
 */

export type ProdutoVendido = {
  codigo: string
  descricao: string
  quantidade: number
}

export type ParsedProdutosVendidos =
  | {
      reportType: "produtos_vendidos"
      periodoInicio: string // YYYY-MM-DD
      periodoFim: string
      produtos: ProdutoVendido[]
    }
  | { reportType: "unknown"; error: string }

function norm(v: unknown): string {
  return String(v ?? "").trim()
}

function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  const s = norm(v)
  if (!s) return null
  const n = Number(s.replace(/\./g, "").replace(",", "."))
  return Number.isFinite(n) ? n : null
}

/** Detecta o workbook "Produtos vendidos" (título + Descrição + Quantidade). */
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
  const hasDescricao = flat.some((c) => c === "descrição" || c === "descricao")
  const hasQtd = flat.some((c) => c.includes("quantidade"))
  return hasTitulo && hasDescricao && hasQtd
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

  // cabeçalho: linha cuja alguma célula é "Descrição"
  let headerIdx = -1
  let descCol = -1
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const idx = rows[i].findIndex((c) => {
      const t = norm(c).toLowerCase()
      return t === "descrição" || t === "descricao"
    })
    if (idx >= 0) {
      headerIdx = i
      descCol = idx
      break
    }
  }
  if (headerIdx < 0)
    return { reportType: "unknown", error: "Não achei a coluna Descrição." }

  // datas da semana
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

  // soma quantidade por código.
  // Após a descrição vêm os números: [Cód. item, QUANTIDADE, valor unit, valor total].
  const map = new Map<string, { descricao: string; quantidade: number }>()
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    const descricao = norm(r[descCol])
    if (!descricao) continue
    // ignora rodapé tipo "relatório - RelProdutosVendidos.rpt"
    if (/^relat[óo]rio/i.test(descricao) || /\.rpt/i.test(descricao)) continue

    const nums: number[] = []
    for (let j = descCol + 1; j < r.length; j++) {
      if (norm(r[j]) === "") continue
      const n = toNum(r[j])
      if (n != null) nums.push(n)
    }
    if (nums.length < 2) continue // sem código + quantidade → pula
    const codigo = String(Math.round(nums[0]))
    const quantidade = nums[1] || 0

    const prev = map.get(codigo)
    if (prev) prev.quantidade += quantidade
    else map.set(codigo, { descricao, quantidade })
  }

  const produtos: ProdutoVendido[] = [...map.entries()]
    .map(([codigo, v]) => ({
      codigo,
      descricao: v.descricao,
      quantidade: v.quantidade,
    }))
    .sort((a, b) => b.quantidade - a.quantidade)

  if (produtos.length === 0)
    return { reportType: "unknown", error: "Nenhum produto encontrado." }
  if (!periodoInicio || !periodoFim)
    return {
      reportType: "unknown",
      error: "Não achei as datas (inicial/final) da semana.",
    }

  return { reportType: "produtos_vendidos", periodoInicio, periodoFim, produtos }
}
