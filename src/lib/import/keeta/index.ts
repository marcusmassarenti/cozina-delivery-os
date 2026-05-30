/**
 * Entry-point dos parsers de relatórios do Keeta.
 *
 * Uso:
 *   const result = parseKeetaReport(buffer)
 *   if (result.reportType === "loja") { ... }
 */

import { openKeetaWorkbook } from "./detect"
import { parseKeetaLoja } from "./parse-loja"
import { parseKeetaItens } from "./parse-itens"
import { parseKeetaPedidos } from "./parse-pedidos"
import { parseKeetaPedidosRecentes } from "./parse-pedidos-recentes"
import type { KeetaParseResult } from "./types"

export type * from "./types"
export {
  detectKeetaReportType,
  isKeetaWorkbook,
  openKeetaWorkbook,
} from "./detect"

export function parseKeetaReport(buf: ArrayBuffer): KeetaParseResult {
  const { workbook, reportType } = openKeetaWorkbook(buf)
  try {
    if (reportType === "loja") return parseKeetaLoja(workbook)
    if (reportType === "item") return parseKeetaItens(workbook)
    if (reportType === "pedido") return parseKeetaPedidos(workbook)
    if (reportType === "pedido_recente")
      return parseKeetaPedidosRecentes(workbook)
    return {
      reportType: "unknown",
      error:
        `Não reconheci como "Loja diária", "Itens diário", "Pedidos" ou "Pedidos recentes" do Keeta. ` +
        `Colunas esperadas não foram encontradas.`,
    }
  } catch (e) {
    return {
      reportType: "unknown",
      error: e instanceof Error ? e.message : "Erro ao parsear relatório Keeta",
    }
  }
}
