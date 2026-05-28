/**
 * Entry-point dos parsers de relatórios do 99 Food.
 *
 * Uso:
 *   const result = parseNinefoodReport(buffer)
 *   if (result.reportType === "dados_loja") { ... }
 *   if (result.reportType === "dados_item") { ... }
 */

import { openNinefoodWorkbook } from "./detect"
import { parseNinefoodDadosLoja } from "./parse-financeiro"
import { parseNinefoodDadosItem } from "./parse-cardapio"
import { parseNinefoodDadosPedido } from "./parse-pedidos"
import type { NinefoodParseResult } from "./types"

export type * from "./types"
export {
  detectNinefoodReportType,
  isNinefoodWorkbook,
  openNinefoodWorkbook,
} from "./detect"

export function parseNinefoodReport(buf: ArrayBuffer): NinefoodParseResult {
  const { workbook, reportType } = openNinefoodWorkbook(buf)
  try {
    if (reportType === "dados_loja") return parseNinefoodDadosLoja(workbook)
    if (reportType === "dados_item") return parseNinefoodDadosItem(workbook)
    if (reportType === "dados_pedido")
      return parseNinefoodDadosPedido(workbook)
    return {
      reportType: "unknown",
      error:
        `Não reconheci como "Dados da loja", "Dados do item" ou "Dados do pedido" do 99 Food. ` +
        `Colunas esperadas não foram encontradas.`,
    }
  } catch (e) {
    return {
      reportType: "unknown",
      error: e instanceof Error ? e.message : "Erro ao parsear relatório 99 Food",
    }
  }
}
