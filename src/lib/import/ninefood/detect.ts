/**
 * Detecção do tipo de relatório do 99 Food a partir do header.
 *
 * Como o 99 Food usa 1 sheet ("Sheet1") com colunas configuráveis pelo usuário,
 * detectamos pelo conjunto de colunas presentes — não pelo nome da aba.
 */

import * as XLSX from "xlsx"
import type { NinefoodReportType } from "./types"

const HEADER_DADOS_LOJA = "Nome do signatário" // exclusivo do "Dados da loja"
const HEADER_DADOS_ITEM = "Nome do item" // exclusivo do "Dados do item"
const HEADER_DADOS_PEDIDO = "ID do pedido" // exclusivo do "Dados do pedido"

/** Lê só a 1ª linha (header) sem carregar o resto. */
export function readHeader(sheet: XLSX.WorkSheet): string[] {
  const ref = sheet["!ref"]
  if (!ref) return []
  const headers: string[] = []
  const range = XLSX.utils.decode_range(ref)
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c })]
    headers.push(cell?.v != null ? String(cell.v) : "")
  }
  return headers
}

export function detectNinefoodReportType(
  workbook: XLSX.WorkBook,
): NinefoodReportType {
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return "unknown"
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return "unknown"

  const headers = readHeader(sheet)
  const set = new Set(headers)

  // Detecção forte por colunas exclusivas
  if (set.has(HEADER_DADOS_PEDIDO) && set.has("Horário do pedido")) {
    return "dados_pedido"
  }
  if (set.has(HEADER_DADOS_LOJA) && set.has("Total de vendas realizadas")) {
    return "dados_loja"
  }
  if (set.has(HEADER_DADOS_ITEM) && set.has("Receita do item")) {
    return "dados_item"
  }
  return "unknown"
}

/**
 * Detecta SE o arquivo é do 99 Food (sem decidir qual tipo).
 * Usado pelo router global pra escolher iFood vs 99 Food.
 */
export function isNinefoodWorkbook(workbook: XLSX.WorkBook): boolean {
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return false
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return false
  const headers = readHeader(sheet)
  const set = new Set(headers)
  // Estrutura do 99 Food sempre tem "ID do loja" + "Data" + "Nome do estabelecimento"
  return (
    set.has("Data") &&
    set.has("Nome do estabelecimento") &&
    set.has("ID do loja")
  )
}

export function openNinefoodWorkbook(buf: ArrayBuffer): {
  workbook: XLSX.WorkBook
  reportType: NinefoodReportType
} {
  let workbook: XLSX.WorkBook
  try {
    // raw: true preserva strings longas (ID da loja 19 dígitos passa de MAX_SAFE_INTEGER)
    workbook = XLSX.read(buf, { type: "array", cellDates: false, raw: false })
  } catch (e) {
    throw new Error(
      `Não foi possível abrir o XLSX 99 Food: ${e instanceof Error ? e.message : "erro desconhecido"}`,
    )
  }
  const reportType = detectNinefoodReportType(workbook)
  return { workbook, reportType }
}
