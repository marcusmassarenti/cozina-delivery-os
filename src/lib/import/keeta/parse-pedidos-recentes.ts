/**
 * Parser do relatório "Pedidos recentes" do Keeta.
 * 1 linha = 1 pedido. Traz o que o "Dados do pedido" NÃO tem: promoção
 * financiada pela Keeta vs pela loja, taxas granulares, preço original e
 * detalhe de cancelamento. Multi-loja → agrupa por storeId.
 *
 * GOTCHAS deste export:
 *  - "Número do pedido" aparece em 2 colunas; o SheetJS renomeia a 2ª pra
 *    "Número do pedido_1" (que é o número curto de 4 dígitos).
 *  - Valores vêm como "R$ 66,46" / "-R$ 7,48" → toKeetaMoneyOrNull.
 *  - Datas como "29/05/2026 19:43" (DD/MM/YYYY) → parseKeetaBrDateTime.
 *  - Não tem coluna "Data": o dia sai do "Horário do pedido".
 */

import * as XLSX from "xlsx"
import { fixSheetRange, readHeader } from "./detect"
import type {
  ParsedKeetaPedidoRecente,
  ParsedKeetaPedidosRecentes,
} from "./types"
import {
  parseKeetaBrDateTime,
  toKeetaMoneyOrNull,
  toStoreId,
  toStringOrNull,
} from "./utils"

const REQUIRED = [
  "ID do restaurante",
  "Número do pedido",
  "Promoção financiada pela Keeta",
] as const

/** Turno a partir da hora do pedido (alinhado ao iFood: ALMOCO/JANTAR). */
function turnoFromHour(d: Date | null): string | null {
  if (!d) return null
  const h = d.getHours()
  if (h < 5) return "MADRUGADA"
  if (h < 11) return "MANHA"
  if (h < 15) return "ALMOCO"
  if (h < 18) return "TARDE"
  return "JANTAR"
}

/** Keeta usa "-" ou "/" pra vazio em campos de texto. */
function nullDash(v: unknown): string | null {
  const s = toStringOrNull(v)
  return s === "-" || s === "/" ? null : s
}

export function parseKeetaPedidosRecentes(
  workbook: XLSX.WorkBook,
): ParsedKeetaPedidosRecentes {
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error("XLSX sem abas.")
  const sheet = workbook.Sheets[sheetName]
  fixSheetRange(sheet)
  const headers = readHeader(sheet)

  for (const col of REQUIRED) {
    if (!headers.includes(col)) {
      throw new Error(
        `Coluna obrigatória "${col}" não encontrada. Confirma se é o relatório "Pedidos recentes" do Keeta.`,
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
    pedidos: ParsedKeetaPedidoRecente[]
  }
  const buckets = new Map<string, Bucket>()

  for (const r of rows) {
    const storeId = toStoreId(r["ID do restaurante"])
    if (!storeId) continue
    const numeroPedido = toStringOrNull(r["Número do pedido"])
    if (!numeroPedido) continue

    const horarioPedido = parseKeetaBrDateTime(r["Horário do pedido"])
    const horarioConclusao = parseKeetaBrDateTime(r["Horário de conclusão"])
    const data = horarioPedido ?? horarioConclusao
    if (!data) continue // sem data não dá pra referenciar o mês

    const storeName = toStringOrNull(r["Nome da loja"])

    const pedido: ParsedKeetaPedidoRecente = {
      numeroPedido,
      numeroPedidoCurto: toStringOrNull(r["Número do pedido_1"]),
      data,
      horarioPedido,
      horarioConclusao,
      horarioCancelamento: parseKeetaBrDateTime(r["Horário de cancelamento"]),
      turno: turnoFromHour(horarioPedido),

      statusPedido: nullDash(r["Status do pedido"]),
      tipoReembolso: nullDash(r["Tipos de reembolso"]),
      motivoCancelamento: nullDash(r["Motivo do cancelamento do pedido"]),
      quemCancelou: nullDash(r["Quem cancelou"]),
      responsabilidade: nullDash(r["Responsabilidade"]),
      motivoDecisao: nullDash(r["Motivo da decisão"]),

      itens: nullDash(r["Itens"]),
      tipoCampanha: nullDash(r["Tipo de campanha"]),

      ganhos: toKeetaMoneyOrNull(r["Ganhos"]),
      valorPagoCliente: toKeetaMoneyOrNull(r["Valor pago pelo cliente"]),
      precoOriginal: toKeetaMoneyOrNull(r["Preço original"]),
      ressarcimentoPlataforma: toKeetaMoneyOrNull(
        r["Ressarcimento da plataforma"],
      ),

      comissaoBasica: toKeetaMoneyOrNull(r["Comissão básica"]),
      taxaDistancia: toKeetaMoneyOrNull(r["Taxa adicional de distância"]),
      taxaSaqueAntecipado: toKeetaMoneyOrNull(r["Taxa de saque antecipado"]),
      taxaPagamentoOnline: toKeetaMoneyOrNull(r["Taxa de pagamento online"]),
      diferencaPaga: toKeetaMoneyOrNull(r["Diferença paga"]),

      descontoKeeta: toKeetaMoneyOrNull(r["Desconto da Keeta"]),
      promoKeeta: toKeetaMoneyOrNull(r["Promoção financiada pela Keeta"]),
      promoLoja: toKeetaMoneyOrNull(r["Promoção financiada pela loja"]),
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
    reportType: "pedido_recente",
    porLoja: Array.from(buckets.values()).map((b) => ({
      storeId: b.storeId,
      storeName: b.storeName,
      pedidos: dedupe(b.pedidos),
    })),
  }
}

/**
 * unique (unit_id, numero_pedido): um pedido pode aparecer em mais de uma
 * linha (reembolso/ajuste). Mantém a linha com mais informação financeira.
 */
function dedupe(
  list: ParsedKeetaPedidoRecente[],
): ParsedKeetaPedidoRecente[] {
  const score = (p: ParsedKeetaPedidoRecente) =>
    Math.abs(p.ganhos ?? 0) +
    Math.abs(p.valorPagoCliente ?? 0) +
    Math.abs(p.promoKeeta ?? 0)
  const m = new Map<string, ParsedKeetaPedidoRecente>()
  for (const p of list) {
    const ex = m.get(p.numeroPedido)
    if (!ex || score(p) > score(ex)) m.set(p.numeroPedido, p)
  }
  return Array.from(m.values())
}
