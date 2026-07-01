/**
 * Parser do relatório "Dados da promoção" do Keeta.
 * 1 linha = 1 campanha (ID do ato) × loja × dia. Traz o ROI de cada promoção:
 * pedidos que ela trouxe, vendas geradas e o custo (despesa) da loja.
 * Multi-loja → agrupa por storeId.
 *
 * GOTCHAS: mesma pegadinha de !ref quebrado dos outros Keeta; "Data" vem como
 * inteiro YYYYMMDD; valores em BR/US (toNumberOrNull cobre os dois).
 */

import * as XLSX from "xlsx"
import { fixSheetRange, readHeader } from "./detect"
import type { ParsedKeetaPromocaoLinha, ParsedKeetaPromocoes } from "./types"
import {
  parseCompactDate,
  toNumberOrNull,
  toStoreId,
  toStringOrNull,
} from "./utils"

const REQUIRED = ["Data", "ID do restaurante", "ID do ato", "Regras de desconto"] as const

export function parseKeetaPromocoes(
  workbook: XLSX.WorkBook,
): ParsedKeetaPromocoes {
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error("XLSX sem abas.")
  const sheet = workbook.Sheets[sheetName]
  fixSheetRange(sheet)
  const headers = readHeader(sheet)

  for (const col of REQUIRED) {
    if (!headers.includes(col)) {
      throw new Error(
        `Coluna obrigatória "${col}" não encontrada. Confirma se é o relatório "Dados da promoção" do Keeta.`,
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
    promocoes: ParsedKeetaPromocaoLinha[]
  }
  const buckets = new Map<string, Bucket>()

  for (const r of rows) {
    const storeId = toStoreId(r["ID do restaurante"])
    if (!storeId) continue
    const atoId = toStoreId(r["ID do ato"])
    if (!atoId) continue // sem campanha não há o que medir

    let data: Date
    try {
      data = parseCompactDate(r["Data"])
    } catch {
      continue // linha sem data válida — pula
    }

    const storeName = toStringOrNull(r["Nome da loja"])

    const linha: ParsedKeetaPromocaoLinha = {
      data,
      atoId,
      regraDesconto: toStringOrNull(r["Regras de desconto"]),
      pedidosCampanha: toNumberOrNull(r["Pedidos da campanha"]),
      pedidosValidos: toNumberOrNull(r["Pedidos válidos"]),
      vendasPromoItens: toNumberOrNull(r["Vendas de promoção de itens"]),
      vendasItens: toNumberOrNull(r["Vendas de itens"]),
      despesaCampanha: toNumberOrNull(r["Despesas da campanha"]),
      despesa: toNumberOrNull(r["Despesa"]),
      despesaMediaCampanha: toNumberOrNull(r["Despesas médias da campanha"]),
      despesaUnidade: toNumberOrNull(r["Despesa (unidade)"]),
    }

    let bucket = buckets.get(storeId)
    if (!bucket) {
      bucket = { storeId, storeName, promocoes: [] }
      buckets.set(storeId, bucket)
    } else if (!bucket.storeName && storeName) {
      bucket.storeName = storeName
    }
    bucket.promocoes.push(linha)
  }

  if (buckets.size === 0) throw new Error("Nenhuma linha válida no relatório.")

  return {
    reportType: "promocao",
    porLoja: Array.from(buckets.values()).map((b) => ({
      storeId: b.storeId,
      storeName: b.storeName,
      promocoes: dedupe(b.promocoes),
    })),
  }
}

/**
 * unique (unit_id, data, ato_id): se a mesma campanha aparecer 2× no mesmo dia,
 * mantém a linha com maior despesa (mais completa).
 */
function dedupe(
  list: ParsedKeetaPromocaoLinha[],
): ParsedKeetaPromocaoLinha[] {
  const key = (l: ParsedKeetaPromocaoLinha) =>
    `${l.data.getTime()}|${l.atoId}`
  const score = (l: ParsedKeetaPromocaoLinha) =>
    Math.abs(l.despesaCampanha ?? 0) + Math.abs(l.pedidosCampanha ?? 0)
  const m = new Map<string, ParsedKeetaPromocaoLinha>()
  for (const l of list) {
    const ex = m.get(key(l))
    if (!ex || score(l) > score(ex)) m.set(key(l), l)
  }
  return Array.from(m.values())
}
