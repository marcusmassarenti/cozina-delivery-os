/**
 * Entry-point dos parsers de relatórios do iFood.
 *
 * Uso:
 *   const result = await parseIfoodReport(buffer)
 *   if (result.reportType === "cardapio") { ... }
 *   if (result.reportType === "financeiro") { ... }
 */

import { openWorkbook } from "./detect"
import { parseIfoodAvaliacoes } from "./parse-avaliacoes"
import { parseIfoodCardapio } from "./parse-cardapio"
import { parseIfoodFinanceiro } from "./parse-financeiro"
import { parseIfoodPedidos } from "./parse-pedidos"
import type { ParseResult } from "./types"

export type * from "./types"
export { detectIfoodReportType } from "./detect"

export function parseIfoodReport(buf: ArrayBuffer): ParseResult {
  const { workbook, reportType } = openWorkbook(buf)

  try {
    if (reportType === "cardapio") return parseIfoodCardapio(workbook)
    if (reportType === "financeiro") return parseIfoodFinanceiro(workbook)
    if (reportType === "avaliacoes") return parseIfoodAvaliacoes(workbook)
    if (reportType === "pedidos") return parseIfoodPedidos(workbook)
    if (reportType === "vendas") return { reportType: "vendas" }
    return {
      reportType: "unknown",
      error: `Tipo de relatório não reconhecido. Abas: ${workbook.SheetNames.join(", ")}`,
    }
  } catch (e) {
    return {
      reportType: "unknown",
      error: e instanceof Error ? e.message : "Erro ao parsear o relatório",
    }
  }
}
