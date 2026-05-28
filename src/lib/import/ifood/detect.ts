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
    workbook = XLSX.read(buf, { type: "array", cellDates: true })
  } catch (e) {
    throw new Error(
      `Não foi possível abrir o arquivo como XLSX: ${e instanceof Error ? e.message : "erro desconhecido"}`,
    )
  }
  const reportType = detectIfoodReportType(workbook)
  return { workbook, reportType }
}
