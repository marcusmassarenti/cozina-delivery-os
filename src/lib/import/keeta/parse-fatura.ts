/**
 * Parser da "Fatura" consolidada do Keeta (arquivo bill-…).
 *
 * 3 abas: "Explicação" (glossário), "Detalhes da fatura" (repasse por loja/dia)
 * e "Histórico de pedidos" (1 linha por pedido, 52 colunas de taxas).
 *
 *  - "Detalhes da fatura"  → repasse: quanto e QUANDO cai (ciclo + liquidação).
 *  - "Histórico de pedidos" → taxas agregadas por loja/mês (Fase 2): a quebra
 *    OFICIAL do que a Keeta cobrou (comissão, distância, serviço mensal…).
 *    Enriquece a DRE; nunca muda o total (que vem dos relatórios base).
 */

import * as XLSX from "xlsx"
import { fixSheetRange } from "./detect"
import type {
  ParsedKeetaFatura,
  ParsedKeetaFaturaTaxas,
  ParsedKeetaRepasseLinha,
} from "./types"
import {
  parseKeetaBrDateTime,
  toKeetaMoneyOrNull,
  toStoreId,
  toStringOrNull,
} from "./utils"

const SHEET_REPASSE = "Detalhes da fatura"
const SHEET_HISTORICO = "Histórico de pedidos"

/** Custo sempre positivo (a Fatura traz taxa negativa). */
function custo(v: unknown): number {
  const n = toKeetaMoneyOrNull(v)
  return n == null ? 0 : Math.abs(n)
}

/** Aba "Histórico de pedidos": agrega as taxas por loja. Header na 3ª linha
 *  (linhas 0/1 são grupos), dados a partir da 4ª. Retorna Map<storeId, taxas>. */
function parseHistoricoTaxas(
  sheet: XLSX.WorkSheet,
): Map<string, ParsedKeetaFaturaTaxas> {
  fixSheetRange(sheet)
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: false,
  })
  const out = new Map<string, ParsedKeetaFaturaTaxas>()
  if (grid.length < 4) return out

  // Nomes reais das colunas estão na linha índice 2.
  const nomes = (grid[2] as unknown[]).map((c) => (c == null ? "" : String(c)))
  // 1ª ocorrência de cada nome (as colunas de "Processo de cálculo" repetem
  // alguns nomes lá pra frente — queremos o valor cobrado, que vem antes).
  const col = (nome: string): number => nomes.indexOf(nome)
  const cId = col("ID do restaurante")
  const cNome = col("Nome da loja")
  const cComissao = col("Comissão básica")
  const cDistancia = col("Taxa adicional de distância")
  const cPagOnline = col("Taxa de pagamento online")
  const cSaque = col("Taxa de saque antecipado")
  const cServicoMensal = col("Taxa de serviço mensal")
  const cPromoItem = col("Custos de promoção do item por conta da loja")
  const cPromoEntrega = col("Subsídios de entrega cobertos pela loja")
  const cPublicidade = col("Custos de publicidade")
  const cMarketing = col("Gasto com marketing inteligente")
  const cAjuste = col("Ajuste de comissão")
  const cAjuda = col("Dedução pelo serviço da Ajuda")

  if (cId < 0) return out

  const val = (row: unknown[], i: number) => (i < 0 ? 0 : custo(row[i]))

  for (let r = 3; r < grid.length; r++) {
    const row = grid[r] as unknown[]
    const storeId = toStoreId(row[cId])
    if (!storeId) continue

    let t = out.get(storeId)
    if (!t) {
      t = {
        comissao: 0,
        taxaDistancia: 0,
        taxaPagamentoOnline: 0,
        taxaSaqueAntecipado: 0,
        taxaServicoMensal: 0,
        promoLoja: 0,
        publicidade: 0,
        ajusteComissao: 0,
        deducaoAjuda: 0,
        pedidos: 0,
      }
      out.set(storeId, t)
    }
    t.comissao += val(row, cComissao)
    t.taxaDistancia += val(row, cDistancia)
    t.taxaPagamentoOnline += val(row, cPagOnline)
    t.taxaSaqueAntecipado += val(row, cSaque)
    t.taxaServicoMensal += val(row, cServicoMensal)
    t.promoLoja += val(row, cPromoItem) + val(row, cPromoEntrega)
    t.publicidade += val(row, cPublicidade) + val(row, cMarketing)
    t.ajusteComissao += val(row, cAjuste)
    t.deducaoAjuda += val(row, cAjuda)
    t.pedidos++
    void cNome
  }
  return out
}

export function parseKeetaFatura(workbook: XLSX.WorkBook): ParsedKeetaFatura {
  const sheet = workbook.Sheets[SHEET_REPASSE]
  if (!sheet)
    throw new Error(
      `Aba "${SHEET_REPASSE}" não encontrada. Confirma se é o arquivo de Fatura da Keeta (bill-…).`,
    )
  fixSheetRange(sheet)

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  })
  if (rows.length === 0) throw new Error("Fatura vazia (só cabeçalho).")

  // Taxas por loja (aba Histórico) — opcional; se não vier, taxas = null.
  const histSheet = workbook.Sheets[SHEET_HISTORICO]
  const taxasPorLoja = histSheet
    ? parseHistoricoTaxas(histSheet)
    : new Map<string, ParsedKeetaFaturaTaxas>()

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
      taxas: taxasPorLoja.get(b.storeId) ?? null,
    })),
  }
}
