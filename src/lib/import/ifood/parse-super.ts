/**
 * Parser do relatório "Super restaurante" do iFood.
 *
 * Aba "Nível Atual" (cabeçalho na linha 1): 1 linha por loja, janela de
 * avaliação trimestral (coluna `duracao` = "2026-04-01 - 2026-06-30").
 * Colunas: nome_da_loja, merchant_id, id_da_loja, uf, cidade, duracao, mes,
 * e_elegivel, e_super, status, total_de_pedidos, pedidos_concluidos,
 * pedidos_avaliados, media_de_avaliacoes, percentual_cancelamento,
 * cancelamentos_de_responsabilidade_da_loja, percentual_de_chamados,
 * total_de_chamados_validos, chamados_pedidos_com_atraso,
 * chamados_pedidos_apos_entrega, chamados_pedidos_com_item_errado,
 * plano_de_acao, tag:avaliacao_pos_*, tag:avaliacao_neg_*.
 *
 * Percentuais vêm como fração (0.0596 = 5,96%) → guardamos em 0-100.
 */

import * as XLSX from "xlsx"

import type { ParsedSuper, ParsedSuperLoja } from "./types"
import { toNumber } from "./utils"

const SHEET = "Nível Atual"
const SHEET_PROXIMA = "Próxima Avaliação"

function acharAba(workbook: XLSX.WorkBook, nome: string, regex: RegExp) {
  return (
    workbook.Sheets[nome] ??
    workbook.Sheets[workbook.SheetNames.find((n) => regex.test(n)) ?? ""]
  )
}

export function parseIfoodSuper(workbook: XLSX.WorkBook): ParsedSuper {
  const sheet = acharAba(workbook, SHEET, /Nível Atual/i)
  if (!sheet) {
    throw new Error("Aba 'Nível Atual' não encontrada no relatório Super")
  }
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: null })
  if (rows.length === 0) throw new Error("Relatório Super está vazio")

  const porLoja: ParsedSuperLoja[] = []
  for (const row of rows) {
    const storeId = str(row["id_da_loja"])
    if (!storeId) continue
    porLoja.push(parseRow(storeId, row, "atual"))
  }
  if (porLoja.length === 0) {
    throw new Error("Nenhuma loja válida no relatório Super")
  }

  // Aba "Próxima Avaliação": como a loja está indo rumo ao próximo dia 10.
  //
  // É a parte acionável do relatório — a "Nível Atual" é um veredito já
  // fechado, sobre o qual não há mais o que fazer. Ficou anos sendo ignorada.
  //
  // NÃO é obrigatória: relatório de loja recém-aberta pode vir só com a
  // primeira aba, e não é motivo pra recusar o arquivo inteiro.
  const sheetProx = acharAba(workbook, SHEET_PROXIMA, /Pr[óo]xima Avalia/i)
  if (sheetProx) {
    for (const row of XLSX.utils.sheet_to_json<Row>(sheetProx, {
      defval: null,
    })) {
      const storeId = str(row["id_da_loja"])
      if (!storeId) continue
      porLoja.push(parseRow(storeId, row, "proxima"))
    }
  }

  return { reportType: "super", porLoja }
}

function parseRow(
  storeId: string,
  row: Row,
  tipo: "atual" | "proxima",
): ParsedSuperLoja {
  // A aba "Próxima Avaliação" não tem `duracao` — tem `dia`, a data em que o
  // parcial foi tirado. As duas pontas recebem esse dia, o que também evita
  // colidir com a chave (unit_id, period_start, period_end) das janelas reais.
  const [start, end] =
    tipo === "proxima"
      ? (() => {
          const d = isoDate(str(row["dia"])) ?? "1970-01-01"
          return [d, d] as [string, string]
        })()
      : parseDuracao(str(row["duracao"]))
  const { pos, neg } = collectTags(row)
  return {
    storeId,
    storeName: strOrNull(row["nome_da_loja"]),
    tipo,
    periodStart: start,
    periodEnd: end,
    periodLabel:
      tipo === "proxima" ? `parcial até ${br(start)}` : `${br(start)} - ${br(end)}`,
    status: strOrNull(row["status"]),
    eSuper: simNao(row["e_super"]),
    eElegivel: simNao(row["e_elegivel"]),
    totalPedidos: toNumber(row["total_de_pedidos"]),
    pedidosConcluidos: toNumber(row["pedidos_concluidos"]),
    pedidosAvaliados: toNumber(row["pedidos_avaliados"]),
    mediaAvaliacoes: numOrNull(row["media_de_avaliacoes"]),
    pctCancelamento: pctOrNull(row["percentual_cancelamento"]),
    pctChamados: pctOrNull(row["percentual_de_chamados"]),
    totalChamados: toNumber(row["total_de_chamados_validos"]),
    chamadosAtraso: toNumber(row["chamados_pedidos_com_atraso"]),
    chamadosPosEntrega: toNumber(row["chamados_pedidos_apos_entrega"]),
    chamadosItemErrado: toNumber(row["chamados_pedidos_com_item_errado"]),
    planoDeAcao: strOrNull(row["plano_de_acao"]),
    tagsPos: pos,
    tagsNeg: neg,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

type Row = Record<string, unknown>

/** Junta as colunas "tag:avaliacao_pos_x"/"tag:avaliacao_neg_x" em mapas,
 *  já com rótulo legível (underscore → espaço). Ignora contagem 0. */
function collectTags(row: Row): {
  pos: Record<string, number>
  neg: Record<string, number>
} {
  const pos: Record<string, number> = {}
  const neg: Record<string, number> = {}
  for (const [k, v] of Object.entries(row)) {
    const mPos = k.match(/^tag:avaliacao_pos_(.+)$/)
    const mNeg = k.match(/^tag:avaliacao_neg_(.+)$/)
    const n = toNumber(v)
    if (n <= 0) continue
    if (mPos) pos[label(mPos[1])] = n
    else if (mNeg) neg[label(mNeg[1])] = n
  }
  return { pos, neg }
}

function label(slug: string): string {
  return slug.replace(/_/g, " ").trim()
}

/** "2026-04-01 - 2026-06-30" → ["2026-04-01","2026-06-30"] (aceita / ou -). */
function parseDuracao(raw: string): [string, string] {
  const parts = raw.split(/\s+-\s+/)
  const a = isoDate(parts[0]) ?? "1970-01-01"
  const b = isoDate(parts[1]) ?? a
  return [a, b]
}

/** Aceita "2026-04-01" (ISO) ou "01/04/2026" (BR) → "YYYY-MM-DD". */
function isoDate(s: string | undefined): string | null {
  if (!s) return null
  const t = s.trim()
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  return null
}

function br(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ymd
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim()
}
function strOrNull(v: unknown): string | null {
  const s = str(v)
  return s === "" ? null : s
}
function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}
/** Fração (0.0596) → percentual (5.96). */
function pctOrNull(v: unknown): number | null {
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 1000 * 100) / 1000 : null
}
function simNao(v: unknown): boolean | null {
  const s = str(v).toLowerCase()
  if (s === "sim") return true
  if (s === "nao" || s === "não") return false
  return null
}
