/**
 * Parser do relatório "Pedidos" do Keeta (File C).
 * 1 linha = 1 pedido. Traz financeiro, cancelamento e avaliação juntos.
 * Multi-loja → agrupa por storeId.
 */

import * as XLSX from "xlsx"
import { fixSheetRange, readHeader } from "./detect"
import type { ParsedKeetaPedido, ParsedKeetaPedidos } from "./types"
import {
  parseCompactDate,
  parseCompactDateMaybe,
  parseKeetaDateTime,
  parseRating,
  toNumberOrNull,
  toStoreId,
  toStringOrNull,
} from "./utils"

const REQUIRED = [
  "Data",
  "ID do restaurante",
  "Nome da loja",
  "ID do pedido",
] as const

export function parseKeetaPedidos(
  workbook: XLSX.WorkBook,
): ParsedKeetaPedidos {
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error("XLSX sem abas.")
  const sheet = workbook.Sheets[sheetName]
  fixSheetRange(sheet)
  const headers = readHeader(sheet)

  for (const col of REQUIRED) {
    if (!headers.includes(col)) {
      throw new Error(
        `Coluna obrigatória "${col}" não encontrada. Confirma se é o relatório "Pedidos" do Keeta.`,
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
    pedidos: ParsedKeetaPedido[]
  }
  const buckets = new Map<string, Bucket>()

  for (const r of rows) {
    const storeId = toStoreId(r["ID do restaurante"])
    if (!storeId) continue
    const pedidoId = toStringOrNull(r["ID do pedido"])
    if (!pedidoId) continue

    let data: Date
    try {
      data = parseCompactDate(r["Data"])
    } catch {
      continue
    }
    const storeName = toStringOrNull(r["Nome da loja"])

    const pedido: ParsedKeetaPedido = {
      pedidoId,
      data,
      tipoPedido: toStringOrNull(r["Tipo de pedido"]),
      horarioPedido: parseKeetaDateTime(r["Horário do pedido"]),
      horarioConclusao: parseKeetaDateTime(r["Horário da conclusão"]),
      statusPedido: toStringOrNull(r["Status do pedido"]),
      tipoCancelamento: nullDash(r["Tipo de cancelamento"]),
      motivoCancelamento: nullDash(r["Motivo do cancelamento do pedido"]),

      ganhosLiquidos: toNumberOrNull(r["Ganhos líquidos"]),
      vendasItens: toNumberOrNull(r["Vendas de itens"]),
      outrosGanhos: toNumberOrNull(r["Outros ganhos"]),
      despesa: toNumberOrNull(r["Despesa"]),
      despesasPlataforma: toNumberOrNull(r["Despesas da plataforma"]),
      comissao: toNumberOrNull(r["Comissão"]),
      outrasDespesas: toNumberOrNull(r["Outras despesas"]),
      taxaEntrega: toNumberOrNull(r["Taxa de entrega"]),

      detalheItem: toStringOrNull(r["Detalhe do item"]),
      tempoPreparoMin: toNumberOrNull(r["Tempo de preparo (min)"]),

      dataAvaliacao: parseCompactDateMaybe(nullDash(r["Data da avaliação"])),
      pontuacaoAvaliacao: parseRating(r["Pontuação da avaliação"]),
      conteudoAvaliacao: nullDash(r["Conteúdo da avaliação"]),
      respostaAvaliacao: nullDash(r["Resposta da avaliação"]),
    }

    let bucket = buckets.get(storeId)
    if (!bucket) {
      bucket = { storeId, storeName, pedidos: [] }
      buckets.set(storeId, bucket)
    } else if (!bucket.storeName && storeName) {
      bucket.storeName = storeName
    }
    bucket.pedidos.push(pedido)
  }

  if (buckets.size === 0) throw new Error("Nenhuma linha válida no relatório.")

  return {
    reportType: "pedido",
    porLoja: Array.from(buckets.values()).map((b) => ({
      storeId: b.storeId,
      storeName: b.storeName,
      pedidos: dedupePedidos(b.pedidos),
    })),
  }
}

/**
 * Um mesmo pedido_id pode aparecer em várias linhas (pedidos cancelados
 * geram linhas de compensação/reembolso). Como a tabela tem unique
 * (unit_id, pedido_id), deduplicamos mantendo a linha com mais informação
 * (financeiro + avaliação). Sem isso, o upsert quebra com "ON CONFLICT DO
 * UPDATE command cannot affect row a second time".
 */
function dedupePedidos(list: ParsedKeetaPedido[]): ParsedKeetaPedido[] {
  const score = (p: ParsedKeetaPedido) =>
    Math.abs(p.ganhosLiquidos ?? 0) +
    Math.abs(p.vendasItens ?? 0) +
    (p.conteudoAvaliacao ? 1000 : 0) +
    (p.pontuacaoAvaliacao ? 1000 : 0)
  const m = new Map<string, ParsedKeetaPedido>()
  for (const p of list) {
    const ex = m.get(p.pedidoId)
    if (!ex || score(p) > score(ex)) m.set(p.pedidoId, p)
  }
  return Array.from(m.values())
}

/** Keeta usa "-" pra vazio em campos de texto. */
function nullDash(v: unknown): string | null {
  const s = toStringOrNull(v)
  return s === "-" ? null : s
}
