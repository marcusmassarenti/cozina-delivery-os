/**
 * Detecção automática do tipo de relatório iFood a partir das abas
 * presentes no XLSX. Roda antes do parsing pra a UI saber qual parser
 * chamar (e qual schema de banco usar).
 */

import * as XLSX from "xlsx"
import type { IfoodReportType } from "./types"

export function detectIfoodReportType(workbook: XLSX.WorkBook): IfoodReportType {
  const sheets = new Set(workbook.SheetNames)

  // Financeiro: aba "Relatório de Conciliação"
  if (sheets.has("Relatório de Conciliação") || sheets.has("Relatorio de Conciliacao")) {
    return "financeiro"
  }

  // Cardápio: aba "Funil Loja" ou "Funil Marca" + "Itens" + "Complementos"
  const hasFunil = sheets.has("Funil Loja") || sheets.has("Funil Marca")
  if (hasFunil && sheets.has("Itens") && sheets.has("Complementos")) {
    return "cardapio"
  }

  // Avaliações: aba única "Página 1" — checa pelos cabeçalhos
  // (nome da aba "Página 1" é genérico demais, vamos olhar dentro)
  const firstSheetName = workbook.SheetNames[0]
  if (firstSheetName) {
    const sheet = workbook.Sheets[firstSheetName]
    if (sheet) {
      // Range da primeira linha
      const ref = sheet["!ref"]
      if (ref) {
        const headers: string[] = []
        const range = XLSX.utils.decode_range(ref)
        for (let c = range.s.c; c <= Math.min(range.s.c + 30, range.e.c); c++) {
          const cell = sheet[XLSX.utils.encode_cell({ r: 0, c })]
          if (cell?.v != null) headers.push(String(cell.v))
        }
        // Relatório de pedidos: tem "FORMA DE PAGAMENTO" + "ID COMPLETO DO PEDIDO"
        const hasFormaPagamento = headers.includes("FORMA DE PAGAMENTO")
        const hasIdPedido = headers.includes("ID COMPLETO DO PEDIDO")
        if (hasFormaPagamento && hasIdPedido) {
          return "pedidos"
        }
        const hasNota = headers.includes("Nota")
        const hasComentario = headers.includes("Comentário")
        const hasDataAvaliacao = headers.includes("Data da avaliação")
        if (hasNota && hasComentario && hasDataAvaliacao) {
          return "avaliacoes"
        }
      }
    }
  }

  return "unknown"
}

/**
 * Lê o ArrayBuffer e retorna o workbook + tipo detectado.
 * Lança erro se o arquivo não puder ser aberto como XLSX.
 */
export function openWorkbook(buf: ArrayBuffer): {
  workbook: XLSX.WorkBook
  reportType: IfoodReportType
} {
  let workbook: XLSX.WorkBook
  try {
    workbook = isBinarySpreadsheet(buf)
      ? XLSX.read(buf, { type: "array", cellDates: true })
      : readCsvWorkbook(buf)
  } catch (e) {
    throw new Error(
      `Não foi possível abrir o arquivo: ${e instanceof Error ? e.message : "erro desconhecido"}`,
    )
  }
  const reportType = detectIfoodReportType(workbook)
  return { workbook, reportType }
}

/** XLSX começa com "PK" (ZIP); .xls antigo com 0xD0CF. Senão, é texto/CSV. */
function isBinarySpreadsheet(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf)
  if (b.length < 2) return false
  const pk = b[0] === 0x50 && b[1] === 0x4b // PK → xlsx
  const ole = b[0] === 0xd0 && b[1] === 0xcf // .xls
  return pk || ole
}

/**
 * Lê o "Relatório de pedidos" do iFood quando vem em CSV.
 *
 * Por que não usar XLSX.read no CSV: o SheetJS coage o decimal BR de forma
 * INCONSISTENTE — em algumas linhas mantém "28,89" string, em outras vira
 * 2889 (tira a vírgula como se fosse milhar), inflando o valor ~100×.
 * Aqui montamos a planilha com TODAS as células como string (o toNumberOrNull
 * dos parsers converte "28,89" → 28.89). Decodifica latin1/Windows-1252 pra
 * o "Ç" de "TAXA DE SERVIÇO" não virar mojibake e a coluna casar.
 */
function readCsvWorkbook(buf: ArrayBuffer): XLSX.WorkBook {
  const text = new TextDecoder("windows-1252").decode(buf)
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length === 0) throw new Error("CSV vazio.")
  // Delimitador: ; (padrão BR do iFood) ou , — usa o que mais aparece no header.
  const header = lines[0]
  const delim = header.split(";").length >= header.split(",").length ? ";" : ","
  const aoa = lines.map((l) => splitCsvLine(l, delim))
  const sheet = XLSX.utils.aoa_to_sheet(aoa) // valores string → células de texto
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, "Página 1")
  return wb
}

/** Split de uma linha CSV respeitando aspas duplas e "" escapado. */
function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = ""
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delim) {
      out.push(cur)
      cur = ""
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}
