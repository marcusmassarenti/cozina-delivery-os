/**
 * Parser do relatório "Qualidade da operação" do iFood.
 *
 * Estrutura conhecida (aba "Indicadores principais"):
 * - Linha 1: "iFood" · Linha 2: seção · Linha 3: CABEÇALHO (por isso range:2)
 * - Linha 4+: 1 linha por (loja, DIA). No modo rede vêm todas as lojas.
 *
 * Colunas: Nome da loja, Id loja, Cidade, Estado, Período (SEMANA, "17/08 - 23/08"),
 * Nível super, Pedidos totais, Valor total do cancelamento com entrega (R$),
 * Negociações super, % Negociações super, % Respostas nas negociações,
 * Cancelamentos super, % Cancelamentos super, Pedidos atrasados 5 min+,
 * % Pedidos atrasados 5 min+, Tempo médio atraso (min), Tempo médio preparo (min),
 * % Pedidos entregador aguardo 5 min+, % ...15 min+, Quantidade avaliações,
 * Média avaliações, Média tempo online / dia, % Tempo online real vs planejado,
 * Tempo fechamentos e pausas por ações (min), Variação vs período anterior (x4),
 * Top motivos de cancelamento (R$), Top motivos de chamados com cancelamento (R$).
 *
 * ⚠️ AS UNIDADES DESTE ARQUIVO NÃO SÃO TODAS IGUAIS. Medido no relatório de
 * 13/jul a 23/ago/26 (12 lojas, 63 linhas), depois de o import quebrar com
 * `numeric field overflow` na JK e na SJC:
 *
 *  • `% ...` (aguardo, negociações, tempo online real vs planejado) vêm como
 *    FRAÇÃO (0.994 = 99,4%) → multiplicamos por 100.
 *  • `Média tempo online / dia` vem em HORAS (3,5 a 13,73). Multiplicar por
 *    100 dava 1.165 e estourava `numeric(6,3)` em quem passava de 10h — e nas
 *    outras dez lojas gravou 860 calado, que ninguém leria como 8,6h.
 *  • `Variação vs período anterior` JÁ VEM EM PONTOS PERCENTUAIS (−20 a +24),
 *    e a das avaliações vem em ESTRELAS (−5 a +5). Nenhuma multiplica por 100.
 *
 * A regra que sobra: só multiplica por 100 o que está entre −1 e 1 por
 * definição. O resto é grandeza com unidade própria.
 * Agregação diário→período: contagens somam; percentuais são recompostos a
 * partir das somas (ex.: % cancelamento = Σcancelamentos / Σpedidos) ou
 * ponderados pelo volume do dia; Nível super e variações vêm do dia mais recente.
 */

import * as XLSX from "xlsx"

import type { ParsedQualidade, ParsedQualidadeLoja } from "./types"
import { toNumber } from "./utils"

const SHEET = "Indicadores principais"

export function parseIfoodQualidade(workbook: XLSX.WorkBook): ParsedQualidade {
  const sheet = workbook.Sheets[SHEET]
  if (!sheet) {
    throw new Error(`Aba '${SHEET}' não encontrada no relatório de Qualidade`)
  }
  // O cabeçalho está na linha 3 → range:2 (0-based). A dimension do arquivo
  // vem quebrada ("A1"), mas o SheetJS recompõe o range real na leitura.
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: null, range: 2 })
  if (rows.length === 0) {
    throw new Error(`Aba '${SHEET}' está vazia`)
  }

  // Agrupa por loja (Id loja)
  const grupos = new Map<string, Row[]>()
  for (const row of rows) {
    const storeId = str(pick(row, "Id loja", "Id da loja"))
    if (!storeId) continue
    const arr = grupos.get(storeId)
    if (arr) arr.push(row)
    else grupos.set(storeId, [row])
  }

  const porLoja: ParsedQualidadeLoja[] = []
  for (const [storeId, dias] of grupos) {
    porLoja.push(aggregate(storeId, dias))
  }

  if (porLoja.length === 0) {
    throw new Error("Nenhuma loja válida no relatório de Qualidade")
  }
  return { reportType: "qualidade", porLoja }
}

// ─── Agregação de um grupo (loja) ────────────────────────────────────

function aggregate(storeId: string, dias: Row[]): ParsedQualidadeLoja {
  // Ordena por fim da semana desc → primeiro = semana mais recente (Nível
  // super, variações, que são sempre "vs o período anterior").
  const comSemana = dias
    .map((r) => ({ r, s: parseSemana(pick(r, "Período")) }))
    .sort((a, b) => (b.s?.fim.getTime() ?? 0) - (a.s?.fim.getTime() ?? 0))
  const recente = comSemana[0].r
  const semanas = comSemana
    .map((x) => x.s)
    .filter((x): x is { ini: Date; fim: Date } => !!x)
  if (semanas.length === 0) {
    // Sem período não há o que gravar: a chave da tabela é (loja, início,
    // fim), e inventar uma data faz a próxima importação sobrescrever esta.
    throw new Error(
      `Loja ${storeId}: não consegui ler a coluna "Período" (esperado algo como "17/08 - 23/08")`,
    )
  }
  const min = semanas.reduce((a, s) => (s.ini < a ? s.ini : a), semanas[0]!.ini)
  const max = semanas.reduce((a, s) => (s.fim > a ? s.fim : a), semanas[0]!.fim)

  // Somatórios
  let pedidos = 0
  let cancelValor = 0
  let negociacoes = 0
  let cancelamentos = 0
  let atrasados = 0
  let avaliacoes = 0
  let pausas = 0
  // Ponderações (Σ valor*peso e Σ peso)
  let respNegNum = 0 // % respostas × negociações
  let atrasoNum = 0 // tempo atraso × atrasados
  let preparoNum = 0 // tempo preparo × pedidos
  let aguardo5Num = 0
  let aguardo15Num = 0
  let mediaAvalNum = 0 // média × qtd avaliações
  // Médias simples (por dia)
  let tempoOnlineSum = 0
  let tempoOnlineDiaSum = 0
  let tempoOnlineDias = 0
  const motivosCancel: string[] = []
  const motivosChamado: string[] = []

  for (const r of dias) {
    const ped = toNumber(pick(r, "Pedidos totais"))
    const neg = toNumber(pick(r, "Negociações super"))
    const atr = toNumber(pick(r, "Pedidos atrasados 5 min+"))
    const aval = toNumber(pick(r, "Quantidade avaliações"))
    pedidos += ped
    cancelValor += toNumber(pick(r, "Valor total do cancelamento com entrega (R$)"))
    negociacoes += neg
    cancelamentos += toNumber(pick(r, "Cancelamentos super"))
    atrasados += atr
    avaliacoes += aval
    pausas += toNumber(pick(r, "Tempo fechamentos e pausas por ações (min)"))

    respNegNum += frac(pick(r, "% Respostas nas negociações")) * neg
    atrasoNum += toNumber(pick(r, "Tempo médio atraso (min)")) * atr
    preparoNum += toNumber(pick(r, "Tempo médio preparo (min)")) * ped
    aguardo5Num += frac(pick(r, "% Pedidos entregador aguardo 5 min+")) * ped
    aguardo15Num += frac(pick(r, "% Pedidos entregador aguardo 15 min+")) * ped
    mediaAvalNum += toNumber(pick(r, "Média avaliações")) * aval

    // Tempo online: médias simples por dia com dado
    const tOn = pick(r, "% Tempo online real vs planejado")
    const tOnDia = pick(r, "Média tempo online / dia")
    if (tOn != null || tOnDia != null) {
      tempoOnlineSum += frac(tOn)
      // HORAS por dia, não fração. Ver o bloco de unidades no topo.
      tempoOnlineDiaSum += toNumber(tOnDia, 0)
      tempoOnlineDias += 1
    }

    const mc = motivo(pick(r, "Top motivos de cancelamento"))
    if (mc) motivosCancel.push(mc)
    const mch = motivo(pick(r, "Top motivos de chamados"))
    if (mch) motivosChamado.push(mch)
  }

  const pctFrom = (num: number, den: number) =>
    den > 0 ? round3((num / den) * 100) : null

  return {
    storeId,
    storeName: strOrNull(pick(recente, "Nome da loja")),
    periodStart: ymd(min),
    periodEnd: ymd(max),
    periodLabel: `${br(min)} - ${br(max)}`,
    nivelSuper: cleanNivel(str(pick(recente, "Nível super"))),
    pedidosTotais: pedidos,
    cancelamentoValor: round2(cancelValor),
    negociacoes,
    pctNegociacoes: pctFrom(negociacoes, pedidos),
    pctRespostasNegociacoes:
      negociacoes > 0 ? round3((respNegNum / negociacoes) * 100) : null,
    cancelamentos,
    pctCancelamento: pctFrom(cancelamentos, pedidos),
    pedidosAtrasados: atrasados,
    pctAtrasados: pctFrom(atrasados, pedidos),
    tempoMedioAtrasoMin: atrasados > 0 ? round2(atrasoNum / atrasados) : null,
    tempoMedioPreparoMin: pedidos > 0 ? round2(preparoNum / pedidos) : null,
    pctEntregadorAguardo5: pedidos > 0 ? round3((aguardo5Num / pedidos) * 100) : null,
    pctEntregadorAguardo15:
      pedidos > 0 ? round3((aguardo15Num / pedidos) * 100) : null,
    qtdAvaliacoes: avaliacoes,
    mediaAvaliacoes: avaliacoes > 0 ? round2(mediaAvalNum / avaliacoes) : null,
    pctTempoOnline:
      tempoOnlineDias > 0 ? round3((tempoOnlineSum / tempoOnlineDias) * 100) : null,
    // Horas por dia (média das semanas), sem ×100.
    mediaTempoOnlineDia:
      tempoOnlineDias > 0 ? round3(tempoOnlineDiaSum / tempoOnlineDias) : null,
    tempoPausasMin: round2(pausas),
    varCancelamentos: variacao(pick(recente, "Variação vs período anterior - cancelamentos")),
    varChamados: variacao(pick(recente, "Variação vs período anterior - pedidos com c")),
    varAvaliacoes: variacao(pick(recente, "Variação vs período anterior - média")),
    varTempoOnline: variacao(pick(recente, "Variação vs período anterior - tempo online")),
    topMotivosCancelamento: dedupJoin(motivosCancel),
    topMotivosChamados: dedupJoin(motivosChamado),
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

type Row = Record<string, unknown>

/** Acha o valor da 1a coluna cujo header contém um dos trechos (case-insensitive). */
function pick(row: Row, ...needles: string[]): unknown {
  const keys = Object.keys(row)
  for (const n of needles) {
    const low = n.toLowerCase()
    const k = keys.find((key) => key.toLowerCase().includes(low))
    if (k !== undefined) return row[k]
  }
  return null
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim()
}
function strOrNull(v: unknown): string | null {
  const s = str(v)
  return s === "" ? null : s
}

/** Número que já vem como fração (0.994) → percentual base (multiplicamos por 100 fora). */
function frac(v: unknown): number {
  return toNumber(v, 0)
}
/**
 * Variação vs período anterior: o número JÁ está na unidade final.
 *
 * As três colunas com "(%)" no título vêm em pontos percentuais (−20 a +24 no
 * arquivo medido) e a das avaliações vem em estrelas (−5 a +5). Multiplicar
 * por 100 gravava "−500%" de variação de nota, que é um número impossível
 * numa escala de 0 a 5 — e ninguém tinha como saber, porque não havia tela
 * mostrando esse campo.
 */
function variacao(v: unknown): number | null {
  if (v == null || v === "" || v === "-") return null
  const n = Number(v)
  return Number.isFinite(n) ? round3(n) : null
}

/** "Nivel 5" fica; "-" ou vazio vira null. */
function cleanNivel(s: string): string | null {
  if (!s || s === "-") return null
  return s
}

/** Motivo do dia: "1. Cliente não quer...: R$ 59,88" — ignora "-"/vazio. */
function motivo(v: unknown): string | null {
  const s = str(v)
  if (!s || s === "-") return null
  return s
}

function dedupJoin(list: string[]): string | null {
  const uniq = [...new Set(list.map((s) => s.replace(/^\d+\.\s*/, "").trim()))]
  return uniq.length > 0 ? uniq.slice(0, 5).join(" · ") : null
}

/**
 * A coluna "Período" é uma SEMANA sem ano: "17/08 - 23/08".
 *
 * Era lida por um regex de `dd/mm/yyyy`, que nunca casava — então toda linha
 * virava `null`, o mínimo e o máximo caíam no fallback `new Date(0)` e as dez
 * lojas que "importaram com sucesso" ficaram gravadas com período
 * 01/01/1970 a 01/01/1970. Pior: a chave única é (unit_id, period_start,
 * period_end), então toda importação futura colidiria nessa mesma data e
 * sobrescreveria a anterior. Falha calada, com carimbo de sucesso.
 *
 * O ano não está no arquivo. Assume o ano corrente e recua um quando a data
 * cairia no futuro — é o que acontece com relatório tirado em janeiro sobre
 * as semanas de dezembro. Pela mesma razão, faixa que termina antes de
 * começar (27/12 - 02/01) tem o fim no ano seguinte.
 */
function parseSemana(
  v: unknown,
  hoje = new Date(),
): { ini: Date; fim: Date } | null {
  if (v instanceof Date) return { ini: v, fim: v }
  const s = str(v)

  const faixa = s.match(/(\d{1,2})\/(\d{1,2})\s*[-–a]+\s*(\d{1,2})\/(\d{1,2})/)
  if (faixa) {
    const ano = hoje.getFullYear()
    let ini = new Date(ano, Number(faixa[2]) - 1, Number(faixa[1]))
    let fim = new Date(ano, Number(faixa[4]) - 1, Number(faixa[3]))
    // Margem de 2 dias: o relatório pode incluir a semana corrente, cujo fim
    // é "amanhã" sem que isso signifique ano errado.
    const futuro = new Date(hoje.getTime() + 2 * 86400_000)
    if (ini > futuro) {
      ini = new Date(ano - 1, ini.getMonth(), ini.getDate())
      fim = new Date(ano - 1, fim.getMonth(), fim.getDate())
    }
    if (fim < ini) fim = new Date(fim.getFullYear() + 1, fim.getMonth(), fim.getDate())
    return { ini, fim }
  }

  const dia = s.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (dia) {
    const d = new Date(Number(dia[3]), Number(dia[2]) - 1, Number(dia[1]))
    return { ini: d, fim: d }
  }
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
