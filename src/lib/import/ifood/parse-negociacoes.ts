/**
 * Parser do relatório "Negociações" do iFood.
 *
 * Aba "Relatório de negociações" (cabeçalho na linha 1): 1 linha por
 * negociação/pedido. NÃO tem coluna de período — a janela é derivada das
 * datas dos pedidos (coluna "Data e hora do pedido").
 *
 * Colunas relevantes: Id da loja, Nome da loja, Data e hora do pedido,
 * Valor total do pedido (R$), Motivo da solicitação, Negociação impactou
 * no super, Resposta da loja, Valor do cupom (R$), Valor do reembolso (R$),
 * Cancelamento evitado (SIM/NÃO).
 *
 * Agregamos por loja: total, cancelamentos evitados (+ receita salva),
 * reembolsos, cupons, % respondidas, impacto no super e motivos.
 */

import * as XLSX from "xlsx"

import type { ParsedNegociacoes, ParsedNegociacoesLoja } from "./types"
import { toNumber } from "./utils"

export function parseIfoodNegociacoes(workbook: XLSX.WorkBook): ParsedNegociacoes {
  const sheet =
    workbook.Sheets["Relatório de negociações"] ??
    workbook.Sheets[
      workbook.SheetNames.find((n) => /negocia/i.test(n)) ?? workbook.SheetNames[0]
    ]
  if (!sheet) throw new Error("Aba de negociações não encontrada")
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: null })
  if (rows.length === 0) throw new Error("Relatório de Negociações está vazio")

  const grupos = new Map<string, Row[]>()
  for (const row of rows) {
    const storeId = str(pick(row, "Id da loja"))
    if (!storeId) continue
    const arr = grupos.get(storeId)
    if (arr) arr.push(row)
    else grupos.set(storeId, [row])
  }

  const porLoja: ParsedNegociacoesLoja[] = []
  for (const [storeId, negs] of grupos) {
    porLoja.push(aggregate(storeId, negs))
  }
  if (porLoja.length === 0) {
    throw new Error("Nenhuma loja válida no relatório de Negociações")
  }
  return { reportType: "negociacoes", porLoja }
}

function aggregate(storeId: string, negs: Row[]): ParsedNegociacoesLoja {
  let evitados = 0
  let valorEvitado = 0
  let reembolso = 0
  let cupom = 0
  let respondidas = 0
  let impactou = 0
  const motivos: Record<string, number> = {}
  const datas: Date[] = []

  for (const r of negs) {
    const d = parseDate(pick(r, "Data e hora do pedido"))
    if (d) datas.push(d)

    if (sim(pick(r, "Cancelamento evitado"))) {
      evitados += 1
      valorEvitado += toNumber(pick(r, "Valor total do pedido"))
    }
    reembolso += toNumber(pick(r, "Valor do reembolso"))
    cupom += toNumber(pick(r, "Valor do cupom"))
    if (respondeu(pick(r, "Resposta da loja"))) respondidas += 1
    if (sim(pick(r, "Negociação impactou no super"))) impactou += 1

    const motivo = str(pick(r, "Motivo da solicitação"))
    if (motivo && motivo !== "-") {
      const nome = titulo(motivo)
      motivos[nome] = (motivos[nome] ?? 0) + 1
    }
  }

  const min = datas.length
    ? datas.reduce((a, d) => (d < a ? d : a), datas[0])
    : new Date()
  const max = datas.length
    ? datas.reduce((a, d) => (d > a ? d : a), datas[0])
    : min
  const total = negs.length

  return {
    storeId,
    storeName: strOrNull(pick(negs[0], "Nome da loja")),
    periodStart: ymd(min),
    periodEnd: ymd(max),
    periodLabel: `${br(min)} - ${br(max)}`,
    totalNegociacoes: total,
    cancelamentosEvitados: evitados,
    valorEvitado: round2(valorEvitado),
    reembolsoTotal: round2(reembolso),
    cupomTotal: round2(cupom),
    respondidas,
    pctRespondidas: total > 0 ? round3((respondidas / total) * 100) : null,
    impactouSuper: impactou,
    topMotivos: motivos,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

type Row = Record<string, unknown>

function pick(row: Row, needle: string): unknown {
  const low = needle.toLowerCase()
  const k = Object.keys(row).find((key) => key.toLowerCase().includes(low))
  return k !== undefined ? row[k] : null
}
function str(v: unknown): string {
  return v == null ? "" : String(v).trim()
}
function strOrNull(v: unknown): string | null {
  const s = str(v)
  return s === "" ? null : s
}
/** "SIM" → true (aceita acento/caixa). */
function sim(v: unknown): boolean {
  return /^s(im)?$/i.test(str(v))
}
/** Respondeu = qualquer coisa menos "NÃO RESPONDEU"/"-"/vazio. */
function respondeu(v: unknown): boolean {
  const s = str(v).toUpperCase()
  return s !== "" && s !== "-" && !s.includes("NÃO RESPONDEU") && !s.includes("NAO RESPONDEU")
}
/** "PEDIDO OU ITEM VEIO ERRADO" → "Pedido ou item veio errado". */
function titulo(s: string): string {
  const low = s.toLowerCase().trim()
  return low.charAt(0).toUpperCase() + low.slice(1)
}
function parseDate(v: unknown): Date | null {
  if (v instanceof Date) return v
  const s = str(v)
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  return null
}
function ymd(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}
function br(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${dd}/${mm}/${d.getFullYear()}`
}
function round2(n: number): number {
  return Math.round(n * 100) / 100
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
