/**
 * Parser do relatório de Cardápio do iFood.
 *
 * Estrutura conhecida:
 * - Aba "Funil Loja" (ou "Funil Marca"):
 *   Período, Marca, Id da Loja, Nome da Loja, Estado (UF), Cidade,
 *   Visitas, Visualizações, Sacola, Revisão, Concluídos, Conversão,
 *   ...período anterior (mesmos campos)
 * - Aba "Itens":
 *   Período, Nome da Loja, Categoria, Nome do item,
 *   Visitas, Pedidos, Conversão, Vendas total (quantidade),
 *   Vendas total com promoção, Pedidos total com promoção, Valor Total
 * - Aba "Complementos":
 *   Período, Nome da Loja, Classificação, Nome do complemento,
 *   Lojas, Pedidos, Vendas Total (Quantidade), Valor total
 */

import * as XLSX from "xlsx"

import type {
  ParsedCardapio,
  ParsedComplemento,
  ParsedFunnel,
  ParsedItem,
  ParsedPeriod,
} from "./types"
import { parsePeriod, toNumber, toNumberOrNull } from "./utils"

export function parseIfoodCardapio(workbook: XLSX.WorkBook): ParsedCardapio {
  // 1) Funil Loja → identifica lojas + período + funil(s)
  const funilSheetName =
    workbook.SheetNames.find((n) => n === "Funil Loja") ??
    workbook.SheetNames.find((n) => n === "Funil Marca")
  if (!funilSheetName) {
    throw new Error("Aba 'Funil Loja' não encontrada no Cardápio")
  }
  const funilRows = sheetToObjects(workbook.Sheets[funilSheetName])
  if (funilRows.length === 0) {
    throw new Error("Aba 'Funil Loja' está vazia")
  }

  // Período vem igual em todas as linhas
  const period = parsePeriod(getStr(funilRows[0], "Período"))

  // Itera Funil Loja — pode ter 1 (diário por loja) ou N (período rede inteira)
  const porLoja = funilRows
    .map((row) => {
      const storeId = String(
        getAny(row, "Id da Loja") ?? getAny(row, "Id da loja") ?? "",
      ).trim()
      if (!storeId) return null
      return {
        storeId,
        storeName: getStrOrNull(row, "Nome da Loja"),
        funnel: parseFunnel(row),
      }
    })
    .filter((x): x is { storeId: string; storeName: string | null; funnel: ParsedFunnel } => !!x)

  if (porLoja.length === 0) {
    throw new Error("Nenhuma loja válida no Funil Loja")
  }

  // Pra fluxo diário (compat): pega a primeira loja como "loja principal"
  const first = porLoja[0]

  // 2) Itens (existe sempre, mas no fluxo multi-loja são agregados da rede)
  const itensSheet = workbook.Sheets["Itens"]
  const items: ParsedItem[] = itensSheet
    ? sheetToObjects(itensSheet).map((row) => ({
        categoria: getStrOrNull(row, "Categoria"),
        nomeItem: getStr(row, "Nome do item") || "(sem nome)",
        visitas: toNumber(row["Visitas"]),
        pedidos: toNumber(row["Pedidos"]),
        conversaoPct: toNumberOrNull(row["Conversão"]),
        qtdVendida: toNumber(row["Vendas total (quantidade)"]),
        qtdComPromocao: toNumber(row["Vendas total com promoção"]),
        pedidosComPromocao: toNumber(row["Pedidos total com promoção"]),
        valorTotal: toNumber(row["Valor Total"]),
      }))
    : []

  // 3) Complementos
  const compSheet = workbook.Sheets["Complementos"]
  const complementos: ParsedComplemento[] = compSheet
    ? sheetToObjects(compSheet).map((row) => ({
        classificacao: getStrOrNull(row, "Classificação"),
        nomeComplemento: getStr(row, "Nome do complemento") || "(sem nome)",
        lojas: toNumberOrNull(row["Lojas"]),
        pedidos: toNumber(row["Pedidos"]),
        qtdVendida: toNumber(row["Vendas Total (Quantidade)"]),
        valorTotal: toNumber(row["Valor total"]),
      }))
    : []

  return {
    reportType: "cardapio",
    period,
    isDaily: period.isDaily,
    storeId: first.storeId,
    storeName: first.storeName,
    funnel: first.funnel,
    items,
    complementos,
    porLoja,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

type Row = Record<string, unknown>

function sheetToObjects(sheet: XLSX.WorkSheet): Row[] {
  return XLSX.utils.sheet_to_json<Row>(sheet, { defval: null })
}

function getAny(row: Row, key: string): unknown {
  return row[key]
}

function getStr(row: Row, key: string): string {
  const v = row[key]
  return v == null ? "" : String(v).trim()
}

function getStrOrNull(row: Row, key: string): string | null {
  const s = getStr(row, key)
  return s === "" ? null : s
}

function parseFunnel(row: Row): ParsedFunnel {
  return {
    visitas: toNumber(row["Visitas"]),
    visualizacoes: toNumber(row["Visualizações"]),
    sacola: toNumber(row["Sacola"]),
    revisao: toNumber(row["Revisão"]),
    concluidos: toNumber(row["Concluídos"]),
    conversaoPct: toNumberOrNull(row["Conversão"]),
    visitasAnterior: toNumberOrNull(row["Visitas período anterior"]),
    visualizacoesAnterior: toNumberOrNull(row["Visualizações período anterior"]),
    sacolaAnterior: toNumberOrNull(row["Sacola período anterior"]),
    revisaoAnterior: toNumberOrNull(row["Revisão período anterior"]),
    concluidosAnterior: toNumberOrNull(
      row["Concluidos período anterior"] ?? row["Concluídos período anterior"],
    ),
    conversaoPctAnterior: toNumberOrNull(row["Conversão período anterior"]),
  }
}

// Tipo emperrado pro getStr aceitar string|null silenciosamente
export type { ParsedPeriod }
