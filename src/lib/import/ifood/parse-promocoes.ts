/**
 * Parser do relatório "Promoções" do iFood.
 *
 * Aba "Promoção" (cabeçalho na linha 1): 1 linha por (loja × campanha).
 * Colunas: Período, Marca, Id da Loja, Nome da Loja, Estado (UF), Cidade,
 * Classificação, Promoções, Campaign_id, Pedidos, Valor dos itens,
 * Ticket médio, Taxa de entrega, Investimento total, Investimento lojas,
 * Investimento lojas por pedido, Retorno lojas, Investimento rede,
 * Investimento rede por pedido, Retorno rede, Retorno rede + lojas,
 * Investimento iFood, Investimento indústria.
 *
 * Investimentos são R$ (Investimento total = lojas + rede + iFood + indústria).
 * Somamos por loja. pedidos/valor podem duplicar em campanhas combinadas —
 * por isso o número âncora é investimento_lojas (não duplica).
 */

import * as XLSX from "xlsx"

import type { ParsedPromocoes, ParsedPromocoesLoja } from "./types"
import { parsePeriod, toNumber } from "./utils"

const SHEET = "Promoção"

export function parseIfoodPromocoes(workbook: XLSX.WorkBook): ParsedPromocoes {
  const sheet = workbook.Sheets[SHEET] ?? workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) {
    throw new Error("Aba 'Promoção' não encontrada no relatório de Promoções")
  }
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: null })
  if (rows.length === 0) {
    throw new Error("Relatório de Promoções está vazio")
  }

  const grupos = new Map<string, Row[]>()
  for (const row of rows) {
    const storeId = str(pick(row, "Id da Loja"))
    if (!storeId) continue
    const arr = grupos.get(storeId)
    if (arr) arr.push(row)
    else grupos.set(storeId, [row])
  }

  const porLoja: ParsedPromocoesLoja[] = []
  for (const [storeId, campanhas] of grupos) {
    porLoja.push(aggregate(storeId, campanhas))
  }
  if (porLoja.length === 0) {
    throw new Error("Nenhuma loja válida no relatório de Promoções")
  }
  return { reportType: "promocoes", porLoja }
}

function aggregate(storeId: string, campanhas: Row[]): ParsedPromocoesLoja {
  const period = parsePeriod(str(pick(campanhas[0], "Período")))
  let pedidos = 0
  let valorItens = 0
  let invTotal = 0
  let invLojas = 0
  let invRede = 0
  let invIfood = 0
  let invIndustria = 0
  let n = 0

  for (const r of campanhas) {
    // Linha "válida" = tem campanha (ignora eventuais linhas de total/vazias)
    if (!str(pick(r, "Campaign_id")) && !str(pick(r, "Promoções"))) continue
    n += 1
    pedidos += toNumber(pick(r, "Pedidos"))
    valorItens += toNumber(pick(r, "Valor dos itens"))
    invTotal += toNumber(pick(r, "Investimento total"))
    invLojas += toNumber(pick(r, "Investimento lojas"))
    invRede += toNumber(pick(r, "Investimento rede"))
    invIfood += toNumber(pick(r, "Investimento iFood"))
    invIndustria += toNumber(pick(r, "Investimento indústria"))
  }

  return {
    storeId,
    storeName: strOrNull(pick(campanhas[0], "Nome da Loja")),
    periodStart: ymd(period.start),
    periodEnd: ymd(period.end),
    periodLabel: period.raw,
    nCampanhas: n,
    pedidos,
    valorItens: round2(valorItens),
    investimentoTotal: round2(invTotal),
    investimentoLojas: round2(invLojas),
    investimentoRede: round2(invRede),
    investimentoIfood: round2(invIfood),
    investimentoIndustria: round2(invIndustria),
    roasLojas: invLojas > 0 ? round3(valorItens / invLojas) : null,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

type Row = Record<string, unknown>

/** Header contém o trecho (case-insensitive). "Investimento rede" casa antes de
 *  "Investimento rede por pedido" pela ordem das colunas. */
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
function ymd(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}
function round2(n: number): number {
  return Math.round(n * 100) / 100
}
function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
