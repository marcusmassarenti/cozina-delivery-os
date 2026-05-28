/**
 * Parser do relatório "Dados do item" do 99 Food.
 *
 * Cada linha = 1 loja × 1 dia × 1 item.
 * Agrupamos por storeId. Equivalente do ifood_daily_items.
 */

import * as XLSX from "xlsx"
import { readHeader } from "./detect"
import type {
  ParsedNinefoodDadosItem,
  ParsedNinefoodItemDia,
} from "./types"
import {
  parseIsoDate,
  toNumber,
  toPercent,
  toStoreId,
  toStringOrNull,
} from "./utils"

const REQUIRED_COLS = [
  "Data",
  "Nome do estabelecimento",
  "ID do loja",
  "Nome do item",
  "Receita do item",
  "Volume de vendas do item",
  "Média de preço do item",
] as const

const OPTIONAL_COLS = {
  alcance: "Alcance",
  add_carrinho: "Clientes que adicionaram ao carrinho",
  conversao: "Taxa de conversão de adição ao carrinho",
} as const

export function parseNinefoodDadosItem(
  workbook: XLSX.WorkBook,
): ParsedNinefoodDadosItem {
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error("XLSX sem abas.")
  const sheet = workbook.Sheets[sheetName]
  const headers = readHeader(sheet)

  for (const col of REQUIRED_COLS) {
    if (!headers.includes(col)) {
      throw new Error(
        `Coluna obrigatória "${col}" não encontrada. Confirma o tipo "Dados do item" no painel do 99 Food.`,
      )
    }
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  })

  if (rows.length === 0) {
    throw new Error("Relatório vazio (sem linhas).")
  }

  type Bucket = {
    storeId: string
    storeName: string | null
    cidade: string | null
    itens: ParsedNinefoodItemDia[]
  }
  const buckets = new Map<string, Bucket>()

  for (const r of rows) {
    const storeId = toStoreId(r["ID do loja"])
    if (!storeId) continue
    const nomeItem = toStringOrNull(r["Nome do item"])
    if (!nomeItem) continue

    let data: Date
    try {
      data = parseIsoDate(r["Data"])
    } catch (e) {
      throw new Error(
        `Linha com data inválida (loja ${storeId}, item ${nomeItem}): ${e instanceof Error ? e.message : String(e)}`,
      )
    }

    const item: ParsedNinefoodItemDia = {
      data,
      nomeItem,
      receita: toNumber(r["Receita do item"]),
      qtdVendida: Math.round(toNumber(r["Volume de vendas do item"])),
      precoMedio: toNumber(r["Média de preço do item"]),
      alcance: Math.round(toNumber(r[OPTIONAL_COLS.alcance])),
      addCarrinho: Math.round(toNumber(r[OPTIONAL_COLS.add_carrinho])),
      conversaoPct: headers.includes(OPTIONAL_COLS.conversao)
        ? toPercent(r[OPTIONAL_COLS.conversao])
        : null,
    }

    let bucket = buckets.get(storeId)
    if (!bucket) {
      bucket = {
        storeId,
        storeName: toStringOrNull(r["Nome do estabelecimento"]),
        cidade: toStringOrNull(r["Cidade"]),
        itens: [],
      }
      buckets.set(storeId, bucket)
    }
    bucket.itens.push(item)
  }

  if (buckets.size === 0) {
    throw new Error("Nenhuma linha válida no relatório.")
  }

  return {
    reportType: "dados_item",
    porLoja: Array.from(buckets.values()),
  }
}
