/**
 * Detecção e abertura dos relatórios do Keeta.
 *
 * GOTCHA: o XLSX do Keeta vem com `!ref` quebrado — declara só a coluna A
 * mesmo tendo ~30 colunas. Se confiarmos no `!ref`, lemos só a 1ª coluna.
 * Por isso `fixSheetRange` recalcula o range real varrendo as chaves de
 * célula e regrava `sheet["!ref"]` antes de qualquer leitura.
 */

import * as XLSX from "xlsx"
import type { KeetaReportType } from "./types"

/** Recalcula o range real da planilha (Keeta vem com !ref só na coluna A). */
export function fixSheetRange(sheet: XLSX.WorkSheet): void {
  let maxR = 0
  let maxC = 0
  for (const key of Object.keys(sheet)) {
    if (key.startsWith("!")) continue
    const m = /^([A-Z]+)(\d+)$/.exec(key)
    if (!m) continue
    const c = XLSX.utils.decode_col(m[1])
    const r = parseInt(m[2], 10) - 1
    if (c > maxC) maxC = c
    if (r > maxR) maxR = r
  }
  sheet["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: maxR, c: maxC },
  })
}

/** Lê a 1ª linha (header) — assume range já corrigido. */
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

export function detectKeetaReportType(
  workbook: XLSX.WorkBook,
): KeetaReportType {
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return "unknown"
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return "unknown"
  fixSheetRange(sheet)

  const set = new Set(readHeader(sheet))

  // Colunas exclusivas de cada relatório
  if (set.has("ID do pedido") && set.has("Ganhos líquidos")) return "pedido"
  if (set.has("Total de pedidos") && set.has("Pedidos válidos")) return "loja"
  if (set.has("Nome do item") && set.has("Preço médio do item")) return "item"
  return "unknown"
}

/**
 * Detecta SE é um workbook do Keeta (sem decidir o tipo). Usado pelo router
 * global. Keeta sempre tem "ID do restaurante" + "Nome da loja" + "Data".
 */
export function isKeetaWorkbook(workbook: XLSX.WorkBook): boolean {
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return false
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return false
  fixSheetRange(sheet)
  const set = new Set(readHeader(sheet))
  return (
    set.has("Data") &&
    set.has("ID do restaurante") &&
    set.has("Nome da loja")
  )
}

export function openKeetaWorkbook(buf: ArrayBuffer): {
  workbook: XLSX.WorkBook
  reportType: KeetaReportType
} {
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buf, { type: "array", cellDates: false, raw: false })
  } catch (e) {
    throw new Error(
      `Não foi possível abrir o XLSX Keeta: ${e instanceof Error ? e.message : "erro desconhecido"}`,
    )
  }
  const reportType = detectKeetaReportType(workbook)
  return { workbook, reportType }
}
