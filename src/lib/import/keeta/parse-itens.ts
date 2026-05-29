/**
 * Parser do relatório "Itens diário" do Keeta (File D).
 * 1 linha = 1 item × 1 dia × 1 loja. Agrupa por storeId.
 * "Vendas" é a QUANTIDADE vendida; receita = qtd * preço médio (derivada).
 */

import * as XLSX from "xlsx"
import { fixSheetRange, readHeader } from "./detect"
import type { ParsedKeetaItem, ParsedKeetaItemDia } from "./types"
import {
  parseCompactDate,
  toNumber,
  toNumberOrNull,
  toStoreId,
  toStringOrNull,
} from "./utils"

const REQUIRED = ["Data", "ID do restaurante", "Nome da loja", "Nome do item"] as const

export function parseKeetaItens(workbook: XLSX.WorkBook): ParsedKeetaItem {
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error("XLSX sem abas.")
  const sheet = workbook.Sheets[sheetName]
  fixSheetRange(sheet)
  const headers = readHeader(sheet)

  for (const col of REQUIRED) {
    if (!headers.includes(col)) {
      throw new Error(
        `Coluna obrigatória "${col}" não encontrada. Confirma se é o relatório "Itens diário" do Keeta.`,
      )
    }
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  })
  if (rows.length === 0) throw new Error("Relatório vazio (só cabeçalho).")

  type Bucket = {
    storeId: string
    storeName: string | null
    itens: ParsedKeetaItemDia[]
  }
  const buckets = new Map<string, Bucket>()

  for (const r of rows) {
    const storeId = toStoreId(r["ID do restaurante"])
    if (!storeId) continue
    const nomeItem = toStringOrNull(r["Nome do item"])
    if (!nomeItem) continue

    let data: Date
    try {
      data = parseCompactDate(r["Data"])
    } catch {
      continue
    }
    const storeName = toStringOrNull(r["Nome da loja"])

    const item: ParsedKeetaItemDia = {
      data,
      itemId: toStringOrNull(r["ID do item"]),
      nomeItem,
      qtdVendida: toNumber(r["Vendas"]),
      precoMedio: toNumber(r["Preço médio do item"]),
      alcance: roundOrNull(toNumberOrNull(r["Alcance de clientes"])),
      addCarrinho: roundOrNull(
        toNumberOrNull(r["Clientes que adicionaram ao carrinho"]),
      ),
      carrinhoPct: toNumberOrNull(r["Carrinho (%)"]),
    }

    let bucket = buckets.get(storeId)
    if (!bucket) {
      bucket = { storeId, storeName, itens: [] }
      buckets.set(storeId, bucket)
    } else if (!bucket.storeName && storeName) {
      bucket.storeName = storeName
    }
    bucket.itens.push(item)
  }

  if (buckets.size === 0) throw new Error("Nenhuma linha válida no relatório.")

  return {
    reportType: "item",
    porLoja: Array.from(buckets.values()),
  }
}

function roundOrNull(n: number | null): number | null {
  return n == null ? null : Math.round(n)
}
