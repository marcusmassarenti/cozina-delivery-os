/**
 * Parser da "Fatura" consolidada do Keeta (arquivo bill-…).
 *
 * O arquivo tem 3 abas: "Explicação" (glossário), "Detalhes da fatura" e
 * "Histórico de pedidos". Neste Fase 1 lemos a aba de REPASSE
 * ("Detalhes da fatura") — 1 linha por (loja, dia) com o valor a repassar,
 * o ciclo de faturamento (semana) e a DATA DE LIQUIDAÇÃO (quando cai).
 *
 * (O "Histórico de pedidos", com 52 colunas de taxas granulares, fica pra
 * uma fase seguinte.)
 */

import * as XLSX from "xlsx"
import { fixSheetRange } from "./detect"
import type { ParsedKeetaFatura, ParsedKeetaRepasseLinha } from "./types"
import {
  parseKeetaBrDateTime,
  toKeetaMoneyOrNull,
  toStoreId,
  toStringOrNull,
} from "./utils"

const SHEET = "Detalhes da fatura"

export function parseKeetaFatura(workbook: XLSX.WorkBook): ParsedKeetaFatura {
  const sheet = workbook.Sheets[SHEET]
  if (!sheet)
    throw new Error(
      `Aba "${SHEET}" não encontrada. Confirma se é o arquivo de Fatura da Keeta (bill-…).`,
    )
  fixSheetRange(sheet)

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  })
  if (rows.length === 0) throw new Error("Fatura vazia (só cabeçalho).")

  type Bucket = {
    storeId: string
    storeName: string | null
    byDay: Map<string, ParsedKeetaRepasseLinha>
  }
  const buckets = new Map<string, Bucket>()

  for (const r of rows) {
    const storeId = toStoreId(r["ID do restaurante"])
    if (!storeId) continue
    const dataTransacao = parseKeetaBrDateTime(r["Data da transação"])
    if (!dataTransacao) continue

    const storeName = toStringOrNull(r["Nome da loja"])
    const valor = toKeetaMoneyOrNull(r["Pagamento total"])

    let bucket = buckets.get(storeId)
    if (!bucket) {
      bucket = { storeId, storeName, byDay: new Map() }
      buckets.set(storeId, bucket)
    } else if (!bucket.storeName && storeName) {
      bucket.storeName = storeName
    }

    // Chave por dia — se a mesma loja tiver +1 linha no dia (múltiplos objetos
    // de repasse), soma os valores num único registro.
    const key = `${dataTransacao.getFullYear()}-${dataTransacao.getMonth()}-${dataTransacao.getDate()}`
    const existing = bucket.byDay.get(key)
    if (existing) {
      existing.valorRepasse = (existing.valorRepasse ?? 0) + (valor ?? 0)
    } else {
      bucket.byDay.set(key, {
        dataTransacao,
        cicloFaturamento: toStringOrNull(r["Ciclo de faturamento"]),
        dataLiquidacao: parseKeetaBrDateTime(r["Data da liquidação"]),
        status: toStringOrNull(r["Status do repasse"]),
        valorRepasse: valor,
        cnpj: toStringOrNull(r["CNPJ"]),
      })
    }
  }

  return {
    reportType: "fatura",
    porLoja: [...buckets.values()].map((b) => ({
      storeId: b.storeId,
      storeName: b.storeName,
      repasses: [...b.byDay.values()].sort(
        (a, b2) => a.dataTransacao.getTime() - b2.dataTransacao.getTime(),
      ),
    })),
  }
}
