/**
 * Parser do "Relatório de pedidos" do iFood.
 *
 * Aba única "Página 1", 1 linha por pedido. Traz forma de pagamento por
 * bandeira (Vale-Refeição: Sodexo/Alelo/Ticket/VR/iFood Voucher) + valores.
 * Um arquivo costuma ser de 1 loja (ID DA LOJA = external_store_id iFood),
 * mas agrupamos por loja pra ser defensivo.
 *
 * É usado só pra forma de pagamento/VR/operação — NÃO entra no faturamento.
 */

import * as XLSX from "xlsx"

import type { ParsedPedidos, ParsedPedidoIfood } from "./types"
import { parseIsoDateMaybe, toNumberOrNull, toStringOrNull } from "./utils"

const COLS = {
  pedidoId: "ID COMPLETO DO PEDIDO",
  nomeLoja: "NOME DA LOJA",
  idLoja: "ID DA LOJA",
  dataHora: "DATA E HORA DO PEDIDO",
  turno: "TURNO",
  pedidoCurto: "ID CURTO DO PEDIDO",
  status: "STATUS FINAL DO PEDIDO",
  valorItens: "VALOR DOS ITENS (R$)",
  totalPago: "TOTAL PAGO PELO CLIENTE (R$)",
  taxaEntrega: "TAXA DE ENTREGA PAGA PELO CLIENTE (R$)",
  incentivoIfood: "INCENTIVO PROMOCIONAL DO IFOOD (R$)",
  incentivoLoja: "INCENTIVO PROMOCIONAL DA LOJA (R$)",
  incentivoRede: "INCENTIVO PROMOCIONAL DA REDE (R$)",
  taxaServico: "TAXA DE SERVIÇO (R$)",
  taxasComissoes: "TAXAS E COMISSOES (R$)",
  valorLiquido: "VALOR LIQUIDO (R$)",
  formaPagamento: "FORMA DE PAGAMENTO",
  tipoEntrega: "TIPO DE ENTREGA",
  produtoLogistico: "PRODUTO LOGISTICO",
  canalVenda: "CANAL DE VENDA",
} as const

/** "28/05/2026 23:37:32" → Date local (ou só data DD/MM/YYYY). */
function parseBrDateTime(v: unknown): Date | null {
  const s = toStringOrNull(v)
  if (!s) return null
  const m = s.match(
    /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/,
  )
  if (m) {
    return new Date(
      Number(m[3]),
      Number(m[2]) - 1,
      Number(m[1]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6] || 0),
    )
  }
  const d = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (d) return new Date(Number(d[3]), Number(d[2]) - 1, Number(d[1]))
  return parseIsoDateMaybe(v)
}

/**
 * Normaliza a forma de pagamento crua em grupo + bandeira (quando VR).
 * Ex: "Pgto via APP - Vale Refeição (SODEXO)" → { Vale-Refeição, SODEXO }
 *     "Pgto via APP - Crédito (Mastercard)"   → { Crédito, null }
 */
export function normalizaPagamento(raw: string | null): {
  grupo: string
  bandeira: string | null
} {
  const s = (raw ?? "").trim()
  const lower = s.toLowerCase()
  if (/vale\s*refei|outros vales/.test(lower)) {
    let bandeira = "OUTROS"
    const m = s.match(/\(([^)]+)\)/)
    if (m) {
      const b = m[1].toUpperCase()
      if (b.includes("SODEXO")) bandeira = "SODEXO"
      else if (b.includes("ALELO")) bandeira = "ALELO"
      else if (b.includes("TICKET")) bandeira = "TICKET"
      else if (b.includes("IFOOD") || b.includes("MEAL")) bandeira = "IFOOD"
      else if (b === "VR" || b.startsWith("VR")) bandeira = "VR"
      else bandeira = "OUTROS"
    }
    return { grupo: "Vale-Refeição", bandeira }
  }
  if (/cr[ée]dito/.test(lower)) return { grupo: "Crédito", bandeira: null }
  if (/d[ée]bito/.test(lower)) return { grupo: "Débito", bandeira: null }
  if (/\bpix\b/.test(lower)) return { grupo: "PIX", bandeira: null }
  if (/carteira/.test(lower)) return { grupo: "Carteira", bandeira: null }
  return { grupo: "Outros", bandeira: null }
}

export function parseIfoodPedidos(workbook: XLSX.WorkBook): ParsedPedidos {
  const sheetName =
    workbook.SheetNames.find((n) => n === "Página 1") ??
    workbook.SheetNames.find((n) => /pagina|p[áa]gina/i.test(n)) ??
    workbook.SheetNames[0]
  if (!sheetName) throw new Error("Nenhuma aba encontrada no XLSX")

  const sheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
  })
  if (rows.length === 0) throw new Error("Relatório de pedidos está vazio")

  // pedidos é um Map keyed por pedidoId (ID COMPLETO) pra deduplicar: o iFood
  // pode emitir 2 linhas com o mesmo pedido (ajuste/estorno), e o upsert do
  // save usa onConflict "unit_id,pedido_id" — sem dedup, o lote quebra com
  // "ON CONFLICT cannot affect row a second time". Last-write-wins.
  type Bucket = {
    storeId: string
    storeName: string | null
    pedidos: Map<string, ParsedPedidoIfood>
  }
  const buckets = new Map<string, Bucket>()

  for (const r of rows) {
    const storeId = toStringOrNull(r[COLS.idLoja])
    if (!storeId) continue
    const pedidoId = toStringOrNull(r[COLS.pedidoId])
    if (!pedidoId) continue

    const formaRaw = toStringOrNull(r[COLS.formaPagamento])
    const { grupo, bandeira } = normalizaPagamento(formaRaw)
    const storeName = toStringOrNull(r[COLS.nomeLoja])

    const pedido: ParsedPedidoIfood = {
      pedidoId,
      pedidoIdCurto: toStringOrNull(r[COLS.pedidoCurto]),
      horario: parseBrDateTime(r[COLS.dataHora]),
      turno: toStringOrNull(r[COLS.turno]),
      statusFinal: toStringOrNull(r[COLS.status]),
      valorItens: toNumberOrNull(r[COLS.valorItens]),
      totalPagoCliente: toNumberOrNull(r[COLS.totalPago]),
      taxaEntregaCliente: toNumberOrNull(r[COLS.taxaEntrega]),
      incentivoIfood: toNumberOrNull(r[COLS.incentivoIfood]),
      incentivoLoja: toNumberOrNull(r[COLS.incentivoLoja]),
      incentivoRede: toNumberOrNull(r[COLS.incentivoRede]),
      taxaServico: toNumberOrNull(r[COLS.taxaServico]),
      taxasComissoes: toNumberOrNull(r[COLS.taxasComissoes]),
      valorLiquido: toNumberOrNull(r[COLS.valorLiquido]),
      formaPagamento: formaRaw,
      formaGrupo: grupo,
      bandeiraVr: bandeira,
      tipoEntrega: toStringOrNull(r[COLS.tipoEntrega]),
      produtoLogistico: toStringOrNull(r[COLS.produtoLogistico]),
      canalVenda: toStringOrNull(r[COLS.canalVenda]),
    }

    let bucket = buckets.get(storeId)
    if (!bucket) {
      bucket = { storeId, storeName, pedidos: new Map() }
      buckets.set(storeId, bucket)
    } else if (!bucket.storeName && storeName) {
      bucket.storeName = storeName
    }
    bucket.pedidos.set(pedidoId, pedido)
  }

  if (buckets.size === 0) {
    throw new Error("Nenhuma linha válida no relatório de pedidos.")
  }

  return {
    reportType: "pedidos",
    porLoja: Array.from(buckets.values()).map((b) => ({
      storeId: b.storeId,
      storeName: b.storeName,
      pedidos: Array.from(b.pedidos.values()),
    })),
  }
}
