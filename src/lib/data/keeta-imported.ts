/**
 * Queries em cima dos dados importados do Keeta (migration 0016).
 *
 * Fontes:
 *  - keeta_daily_loja: bruto (vendas_itens), pedidos, cancelados por dia
 *  - keeta_pedidos: líquido (ganhos_liquidos) por pedido
 *
 * Espelha o shape de NinefoodResumo pra o Dashboard mesclar do mesmo jeito.
 */

import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { fetchAllRows } from "@/lib/data/paginate"
import { monthOperationWindow } from "@/lib/data/operation-window"
import { currentPeriod } from "@/lib/period"
import { getAccessibleUnitIds } from "@/lib/auth/permissions"
import { temaCancelamentoKeeta } from "@/lib/keeta/cancelamento"
import type {
  NinefoodCoverageCell,
  NinefoodCoverageMatrix,
  NinefoodCoverageStatus,
} from "@/lib/data/ninefood-imported"

/** Keeta usa a mesma estrutura de cobertura do 99 (Loja / Item / Pedido). */
export type KeetaCoverageMatrix = NinefoodCoverageMatrix

export type KeetaResumo = {
  pedidos: number
  bruto: number
  liquido: number
  cancelamentosQtd: number
  ticketMedio: number
  pctLoja: number
  hasData: boolean
  /**
   * Promoções/cupons que a LOJA bancou (não taxa que a Keeta cobra).
   * Proxy: sum(keeta_pedidos.outras_despesas) — é o campo que dispara em
   * pedidos com cupom (R$ 119 num pedido de R$ 154) e bate com o conceito
   * de "promoção custeada pela loja" do iFood/99 Food.
   */
  promocoesLoja: number
}

function emptyKeeta(): KeetaResumo {
  return {
    pedidos: 0,
    bruto: 0,
    liquido: 0,
    cancelamentosQtd: 0,
    ticketMedio: 0,
    pctLoja: 0,
    hasData: false,
    promocoesLoja: 0,
  }
}

async function pageAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
  maxRows = 200000,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (from < maxRows) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) {
      console.error("keeta pageAll error:", error.message)
      break
    }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

/**
 * Resumo mensal do Keeta por unidade. bruto/pedidos/cancelados vêm da
 * Loja diária; líquido vem dos Pedidos (ganhos líquidos somados).
 *
 * `dateRange` (opcional) restringe pra range custom (filtro de período).
 * Quando passado, filtra `data BETWEEN start AND end` ADICIONAL ao
 * ref_year/ref_month (que dão hit no índice). Assume range mono-mês.
 */
export async function getKeetaResumoByUnits(
  unitIds: string[],
  year: number,
  month: number,
  dateRange?: { start: string; end: string },
): Promise<Map<string, KeetaResumo>> {
  const out = new Map<string, KeetaResumo>()
  if (unitIds.length === 0) return out
  const admin = createAdminClient()

  // Loja diária (bruto, pedidos, cancelados)
  const loja = await pageAll<{
    unit_id: string
    vendas_itens: number | string
    total_pedidos: number | null
    pedidos_cancelados: number | null
  }>((a, b) => {
    let q = admin
      .from("keeta_daily_loja")
      .select("unit_id, vendas_itens, total_pedidos, pedidos_cancelados")
      .in("unit_id", unitIds)
      .eq("ref_year", year)
      .eq("ref_month", month)
    if (dateRange) {
      q = q.gte("data", dateRange.start).lte("data", dateRange.end)
    }
    return q.order("id").range(a, b)
  })
  for (const r of loja) {
    const cur = out.get(r.unit_id) ?? emptyKeeta()
    cur.bruto += Number(r.vendas_itens) || 0
    cur.pedidos += r.total_pedidos || 0
    cur.cancelamentosQtd += r.pedidos_cancelados || 0
    out.set(r.unit_id, cur)
  }

  // Pedidos (líquido + promoções da loja)
  const pedidos = await pageAll<{
    unit_id: string
    ganhos_liquidos: number | string | null
    vendas_itens: number | string | null
    outras_despesas: number | string | null
  }>((a, b) => {
    let q = admin
      .from("keeta_pedidos")
      .select("unit_id, ganhos_liquidos, vendas_itens, outras_despesas")
      .in("unit_id", unitIds)
      .eq("ref_year", year)
      .eq("ref_month", month)
    if (dateRange) {
      q = q.gte("data", dateRange.start).lte("data", dateRange.end)
    }
    return q.order("id").range(a, b)
  })
  const brutoFromPedidos = new Map<string, number>()
  const countFromPedidos = new Map<string, number>()
  for (const r of pedidos) {
    const cur = out.get(r.unit_id) ?? emptyKeeta()
    cur.liquido += Number(r.ganhos_liquidos) || 0
    cur.promocoesLoja += Math.abs(Number(r.outras_despesas) || 0)
    out.set(r.unit_id, cur)
    brutoFromPedidos.set(
      r.unit_id,
      (brutoFromPedidos.get(r.unit_id) ?? 0) + (Number(r.vendas_itens) || 0),
    )
    countFromPedidos.set(r.unit_id, (countFromPedidos.get(r.unit_id) ?? 0) + 1)
  }

  // Finaliza: fallbacks + derivados
  for (const [unitId, cur] of out) {
    // Se não veio Loja diária, usa os Pedidos pra bruto/pedidos
    if (cur.bruto === 0 && (brutoFromPedidos.get(unitId) ?? 0) > 0) {
      cur.bruto = brutoFromPedidos.get(unitId) ?? 0
    }
    if (cur.pedidos === 0 && (countFromPedidos.get(unitId) ?? 0) > 0) {
      cur.pedidos = countFromPedidos.get(unitId) ?? 0
    }
    // Se não veio Pedidos (líquido), assume líquido = bruto (pctLoja 100%)
    if (cur.liquido === 0 && cur.bruto > 0) cur.liquido = cur.bruto
    cur.ticketMedio = cur.pedidos > 0 ? cur.bruto / cur.pedidos : 0
    cur.pctLoja = cur.bruto > 0 ? (cur.liquido / cur.bruto) * 100 : 0
    cur.hasData = cur.bruto > 0 || cur.pedidos > 0
  }

  return out
}

/** Resumo do Keeta pra 1 unidade no mês (usado no detalhe da unidade). */
export async function getKeetaResumoForMonth(
  unitId: string,
  year: number,
  month: number,
  dateRange?: { start: string; end: string },
): Promise<KeetaResumo> {
  const map = await getKeetaResumoByUnits([unitId], year, month, dateRange)
  return map.get(unitId) ?? emptyKeeta()
}

// ─── Network: Avaliações Keeta ───────────────────────────────────────

export type NetworkKeetaAvaliacoes = {
  total: number
  notaMedia: number
  distribucao: Record<1 | 2 | 3 | 4 | 5, number>
  comComentario: number
  // Keeta não tem tags — mantém arrays vazios pra compatibilidade
  topTagsPositivas: Array<{ tag: string; count: number }>
  topTagsNegativas: Array<{ tag: string; count: number }>
  ultimosComentarios: Array<{
    id: string
    unitId: string
    unitCode: string
    unitName: string
    nota: number
    comentario: string
    data: string
    pedidoIdCurto: string | null
  }>
  hasData: boolean
}

export async function getNetworkKeetaAvaliacoesForMonth(
  year: number,
  month: number,
  filterUnitIds?: string[],
): Promise<NetworkKeetaAvaliacoes> {
  const admin = createAdminClient()
  const monthStr = String(month).padStart(2, "0")
  const startIso = `${year}-${monthStr}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endIncl = `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`

  const rows = await fetchAllRows<{
    id: string | number
    unit_id: string
    pedido_id: string | number | null
    pontuacao_avaliacao: number | string | null
    conteudo_avaliacao: string | null
    data_avaliacao: string | null
  }>((f, t) => {
    let q = admin
      .from("keeta_pedidos")
      .select(
        "id, unit_id, pedido_id, pontuacao_avaliacao, conteudo_avaliacao, data_avaliacao",
      )
      .not("pontuacao_avaliacao", "is", null)
      .gte("data_avaliacao", startIso)
      .lte("data_avaliacao", endIncl)
      .order("id")
      .range(f, t)
    if (filterUnitIds)
      q = q.in("unit_id", filterUnitIds)
    return q
  }, "keeta_pedidos avaliacoes rede")

  // Paginação ordena por id; reordena por data_avaliacao DESC pra os
  // "últimos comentários" (a ordem do .order() na query se perde).
  rows.sort((a, b) =>
    String(b.data_avaliacao ?? "").localeCompare(String(a.data_avaliacao ?? "")),
  )

  const empty: NetworkKeetaAvaliacoes = {
    total: 0,
    notaMedia: 0,
    distribucao: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    comComentario: 0,
    topTagsPositivas: [],
    topTagsNegativas: [],
    ultimosComentarios: [],
    hasData: false,
  }
  if (rows.length === 0) return empty

  const dist: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let soma = 0
  let comComentario = 0
  for (const r of rows) {
    const n = Number(r.pontuacao_avaliacao) as 1 | 2 | 3 | 4 | 5
    if (n >= 1 && n <= 5) {
      dist[n] += 1
      soma += n
    }
    if (r.conteudo_avaliacao && String(r.conteudo_avaliacao).trim().length > 0)
      comComentario++
  }

  const comentariosNaoVazios = rows.filter(
    (r) => r.conteudo_avaliacao && String(r.conteudo_avaliacao).trim().length > 0,
  )
  const unitIds = Array.from(
    new Set(comentariosNaoVazios.slice(0, 50).map((r) => r.unit_id)),
  )
  const unitMap = new Map<string, { code: string; name: string }>()
  if (unitIds.length > 0) {
    const { data: units } = await admin
      .from("units")
      .select("id, code, name")
      .in("id", unitIds)
    for (const u of units ?? []) unitMap.set(u.id, { code: u.code, name: u.name })
  }
  const ultimosComentarios = comentariosNaoVazios.slice(0, 50).map((r) => {
    const pid = String(r.pedido_id ?? "")
    return {
      id: "keeta-" + String(r.id),
      unitId: r.unit_id,
      unitCode: unitMap.get(r.unit_id)?.code ?? "?",
      unitName: unitMap.get(r.unit_id)?.name ?? "(unidade)",
      nota: Number(r.pontuacao_avaliacao),
      comentario: String(r.conteudo_avaliacao),
      data: String(r.data_avaliacao),
      pedidoIdCurto: pid.length > 6 ? "…" + pid.slice(-6) : pid || null,
    }
  })

  return {
    total: rows.length,
    notaMedia: Math.round((soma / rows.length) * 100) / 100,
    distribucao: dist,
    comComentario,
    topTagsPositivas: [],
    topTagsNegativas: [],
    ultimosComentarios,
    hasData: true,
  }
}

// ─── Network: Top itens + Cancelamentos Keeta (Dashboard seção 3) ────

export type KeetaTopItem = {
  nomeItem: string
  qtdVendida: number
  valorTotal: number
}

/**
 * Top itens vendidos na rede no mês (Keeta). Soma keeta_daily_item por
 * nome do item; receita = Σ(qtd × preço médio). Ordenado por receita DESC.
 */
export async function getNetworkKeetaTopItemsForMonth(
  year: number,
  month: number,
  limit = 5,
  filterUnitIds?: string[],
): Promise<KeetaTopItem[]> {
  const admin = createAdminClient()
  const rows = await pageAll<{
    nome_item: string
    qtd_vendida: number | string
    preco_medio: number | string
  }>((a, b) => {
    let q = admin
      .from("keeta_daily_item")
      .select("nome_item, qtd_vendida, preco_medio")
      .eq("ref_year", year)
      .eq("ref_month", month)
      .order("id")
      .range(a, b)
    if (filterUnitIds)
      q = q.in("unit_id", filterUnitIds)
    return q
  })

  const acc = new Map<string, KeetaTopItem>()
  for (const r of rows) {
    if (!r.nome_item) continue
    const cur = acc.get(r.nome_item) ?? {
      nomeItem: r.nome_item,
      qtdVendida: 0,
      valorTotal: 0,
    }
    const qtd = Number(r.qtd_vendida) || 0
    const preco = Number(r.preco_medio) || 0
    cur.qtdVendida += qtd
    cur.valorTotal += qtd * preco
    acc.set(r.nome_item, cur)
  }
  return Array.from(acc.values())
    .map((it) => ({ ...it, valorTotal: Math.round(it.valorTotal * 100) / 100 }))
    .sort((a, b) => b.valorTotal - a.valorTotal)
    .slice(0, limit)
}

export type KeetaCancelamentoMotivo = {
  /** Tema do cancelamento, não a frase do cliente — ver lib/keeta/cancelamento */
  motivo: string
  pedidos: number
  /** Perda = soma das vendas de itens dos pedidos cancelados */
  perdaFinanceira: number
}

/**
 * Top motivos de cancelamento na rede (Keeta).
 *
 * A Keeta não manda motivo estruturado: `motivo_cancelamento` é o texto que
 * o cliente escreveu, com os links das fotos colados no fim. Agrupar por
 * esse texto dava 1 ocorrência por cancelamento (153 pedidos = 153
 * "motivos") e vazava URL no card. Agora classificamos em tema, então o
 * ranking responde "o que mais faz cancelar".
 */
export async function getNetworkKeetaCancelamentosForMonth(
  year: number,
  month: number,
  limit = 5,
  filterUnitIds?: string[],
): Promise<KeetaCancelamentoMotivo[]> {
  const admin = createAdminClient()
  const rows = await pageAll<{
    motivo_cancelamento: string | null
    vendas_itens: number | string | null
  }>((a, b) => {
    let q = admin
      .from("keeta_pedidos")
      .select("motivo_cancelamento, vendas_itens")
      .not("motivo_cancelamento", "is", null)
      .eq("ref_year", year)
      .eq("ref_month", month)
      .order("id")
      .range(a, b)
    if (filterUnitIds)
      q = q.in("unit_id", filterUnitIds)
    return q
  })

  const acc = new Map<string, KeetaCancelamentoMotivo>()
  for (const r of rows) {
    if (!r.motivo_cancelamento) continue
    const tema = temaCancelamentoKeeta(r.motivo_cancelamento)
    const cur = acc.get(tema) ?? { motivo: tema, pedidos: 0, perdaFinanceira: 0 }
    cur.pedidos += 1
    cur.perdaFinanceira += Number(r.vendas_itens) || 0
    acc.set(tema, cur)
  }
  return Array.from(acc.values())
    .sort((a, b) => b.pedidos - a.pedidos)
    .slice(0, limit)
}

// ─── Avaliações por unidade (tab Avaliações da unidade / tela /avaliacoes) ──

export type KeetaAvaliacoesResumo = {
  total: number
  notaMedia: number
  distribucao: Record<1 | 2 | 3 | 4 | 5, number>
  comComentario: number
  hasData: boolean
}

export type KeetaAvaliacaoListItem = {
  id: string
  pedidoIdCurto: string | null
  dataAvaliacao: string
  dataPedido: string | null
  nota: number
  comentario: string | null
}

/**
 * Resumo de avaliações Keeta de UMA unidade no mês.
 * Keeta não exporta tags — só nota (1-5) + comentário livre.
 */
export async function getKeetaAvaliacoesResumoForMonth(
  unitId: string,
  year: number,
  month: number,
): Promise<KeetaAvaliacoesResumo> {
  const admin = createAdminClient()
  const monthStr = String(month).padStart(2, "0")
  const startIso = `${year}-${monthStr}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endIncl = `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`

  const rows = await fetchAllRows<{
    pontuacao_avaliacao: number | string | null
    conteudo_avaliacao: string | null
  }>(
    (f, t) =>
      admin
        .from("keeta_pedidos")
        .select("pontuacao_avaliacao, conteudo_avaliacao")
        .eq("unit_id", unitId)
        .not("pontuacao_avaliacao", "is", null)
        .gte("data_avaliacao", startIso)
        .lte("data_avaliacao", endIncl)
        .order("id")
        .range(f, t),
    "keeta_pedidos avaliacoes unidade",
  )

  if (rows.length === 0) {
    return {
      total: 0,
      notaMedia: 0,
      distribucao: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      comComentario: 0,
      hasData: false,
    }
  }

  const dist: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let soma = 0
  let comComentario = 0
  for (const r of rows) {
    const n = Number(r.pontuacao_avaliacao) as 1 | 2 | 3 | 4 | 5
    if (n >= 1 && n <= 5) {
      dist[n] += 1
      soma += n
    }
    if (r.conteudo_avaliacao && String(r.conteudo_avaliacao).trim().length > 0)
      comComentario++
  }
  return {
    total: rows.length,
    notaMedia: Math.round((soma / rows.length) * 100) / 100,
    distribucao: dist,
    comComentario,
    hasData: true,
  }
}

/**
 * Lista de avaliações Keeta do mês (pra tab Avaliações da unidade).
 * Sem tags — Keeta só dá nota + comentário.
 */
export async function listKeetaAvaliacoesForMonth(
  unitId: string,
  year: number,
  month: number,
  limit = 100,
): Promise<KeetaAvaliacaoListItem[]> {
  const admin = createAdminClient()
  const monthStr = String(month).padStart(2, "0")
  const startIso = `${year}-${monthStr}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endIncl = `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`

  const { data } = await admin
    .from("keeta_pedidos")
    .select(
      "id, pedido_id, data_avaliacao, horario_pedido, pontuacao_avaliacao, conteudo_avaliacao",
    )
    .eq("unit_id", unitId)
    .not("pontuacao_avaliacao", "is", null)
    .gte("data_avaliacao", startIso)
    .lte("data_avaliacao", endIncl)
    .order("data_avaliacao", { ascending: false })
    .limit(limit)

  return (data ?? []).map((r) => {
    const pedidoIdStr = String(r.pedido_id ?? "")
    return {
      id: String(r.id),
      pedidoIdCurto:
        pedidoIdStr.length > 6 ? "…" + pedidoIdStr.slice(-6) : pedidoIdStr,
      dataAvaliacao: String(r.data_avaliacao ?? ""),
      dataPedido: r.horario_pedido
        ? String(r.horario_pedido).slice(0, 10)
        : null,
      nota: Number(r.pontuacao_avaliacao ?? 0),
      comentario: r.conteudo_avaliacao ? String(r.conteudo_avaliacao) : null,
    }
  })
}

// ─── Cardápio: ranking de itens do mês (tab Cardápio da unidade) ─────

export type KeetaItemRanking = {
  nomeItem: string
  qtdVendida: number
  receita: number
  precoMedio: number
  diasComVenda: number
  /** Média do Carrinho (%) — conversão visita→carrinho (0-100) */
  conversaoMedia: number | null
}

/**
 * Top itens vendidos no mês (Keeta). Agrega keeta_daily_item por nome_item:
 * soma quantidade, receita = Σ(qtd × preço médio), dias com venda e a média
 * de conversão de carrinho. Ordenado por receita DESC.
 */
export async function getKeetaItensRankingForMonth(
  unitId: string,
  year: number,
  month: number,
  limit = 30,
): Promise<KeetaItemRanking[]> {
  const admin = createAdminClient()
  const rows = await pageAll<{
    nome_item: string
    qtd_vendida: number | string
    preco_medio: number | string
    carrinho_pct: number | string | null
    data: string
  }>((a, b) =>
    admin
      .from("keeta_daily_item")
      .select("nome_item, qtd_vendida, preco_medio, carrinho_pct, data")
      .eq("unit_id", unitId)
      .eq("ref_year", year)
      .eq("ref_month", month)
      .order("id")
      .range(a, b),
  )
  if (rows.length === 0) return []

  type Agg = {
    qtd: number
    receita: number
    dias: Set<string>
    convSoma: number
    convCount: number
  }
  const byItem = new Map<string, Agg>()
  for (const r of rows) {
    const nome = r.nome_item
    if (!nome) continue
    let a = byItem.get(nome)
    if (!a) {
      a = { qtd: 0, receita: 0, dias: new Set(), convSoma: 0, convCount: 0 }
      byItem.set(nome, a)
    }
    const qtd = Number(r.qtd_vendida) || 0
    const preco = Number(r.preco_medio) || 0
    a.qtd += qtd
    a.receita += qtd * preco
    if (r.data) a.dias.add(String(r.data))
    if (r.carrinho_pct != null) {
      a.convSoma += Number(r.carrinho_pct) || 0
      a.convCount += 1
    }
  }

  return Array.from(byItem.entries())
    .map(([nomeItem, a]) => ({
      nomeItem,
      qtdVendida: a.qtd,
      receita: Math.round(a.receita * 100) / 100,
      precoMedio: a.qtd > 0 ? Math.round((a.receita / a.qtd) * 100) / 100 : 0,
      diasComVenda: a.dias.size,
      conversaoMedia:
        a.convCount > 0
          ? Math.round((a.convSoma / a.convCount) * 100) / 100
          : null,
    }))
    .sort((x, y) => y.receita - x.receita)
    .slice(0, limit)
}

// ─── Financeiro: agregado + dia a dia (tab Financeiro da unidade) ────

export type KeetaDiaResumo = {
  data: string
  pedidos: number
  pedidosValidos: number
  bruto: number
  liquido: number
  cancelados: number
  valorMedio: number
  tempoPreparoMin: number | null
}

export type KeetaFinanceiroResumo = {
  hasData: boolean
  bruto: number
  liquido: number
  pctLoja: number
  /** Descontos da plataforma = bruto − líquido (derivado, sempre consistente) */
  descontos: number
  pedidos: number
  pedidosValidos: number
  cancelamentosQtd: number
  ticketMedio: number
  tempoPreparoMedio: number | null
  dias: KeetaDiaResumo[]
}

/**
 * Financeiro do Keeta no mês: bruto (Loja diária) + líquido (ganhos líquidos
 * dos Pedidos) + série diária. Os descontos são derivados (bruto − líquido)
 * porque os campos de despesa por pedido do Keeta se sobrepõem (comissão /
 * despesas da plataforma / taxa de entrega não somam de forma limpa).
 */
export async function getKeetaFinanceiroForMonth(
  unitId: string,
  year: number,
  month: number,
): Promise<KeetaFinanceiroResumo> {
  const admin = createAdminClient()

  const [loja, pedidos] = await Promise.all([
    pageAll<{
      data: string
      vendas_itens: number | string
      pedidos_validos: number | null
      total_pedidos: number | null
      pedidos_cancelados: number | null
      valor_medio_pedido: number | string | null
      tempo_preparo_min: number | string | null
    }>((a, b) =>
      admin
        .from("keeta_daily_loja")
        .select(
          "data, vendas_itens, pedidos_validos, total_pedidos, pedidos_cancelados, valor_medio_pedido, tempo_preparo_min",
        )
        .eq("unit_id", unitId)
        .eq("ref_year", year)
        .eq("ref_month", month)
        .order("id")
        .range(a, b),
    ),
    pageAll<{
      data: string
      ganhos_liquidos: number | string | null
    }>((a, b) =>
      admin
        .from("keeta_pedidos")
        .select("data, ganhos_liquidos")
        .eq("unit_id", unitId)
        .eq("ref_year", year)
        .eq("ref_month", month)
        .order("id")
        .range(a, b),
    ),
  ])

  const empty: KeetaFinanceiroResumo = {
    hasData: false,
    bruto: 0,
    liquido: 0,
    pctLoja: 0,
    descontos: 0,
    pedidos: 0,
    pedidosValidos: 0,
    cancelamentosQtd: 0,
    ticketMedio: 0,
    tempoPreparoMedio: 0,
    dias: [],
  }
  if (loja.length === 0 && pedidos.length === 0) return empty

  // Líquido por dia (dos pedidos)
  const liquidoPorDia = new Map<string, number>()
  let liquidoTotal = 0
  for (const p of pedidos) {
    const d = String(p.data)
    const liq = Number(p.ganhos_liquidos) || 0
    liquidoPorDia.set(d, (liquidoPorDia.get(d) ?? 0) + liq)
    liquidoTotal += liq
  }

  let bruto = 0
  let pedidosCount = 0
  let pedidosValidos = 0
  let cancelamentosQtd = 0
  let tempoSoma = 0
  let tempoCount = 0
  const dias: KeetaDiaResumo[] = []
  for (const r of loja) {
    const d = String(r.data)
    const dBruto = Number(r.vendas_itens) || 0
    const dPedidos = r.total_pedidos || 0
    const dValidos = r.pedidos_validos || 0
    const dCancel = r.pedidos_cancelados || 0
    const tempo =
      r.tempo_preparo_min != null ? Number(r.tempo_preparo_min) : null
    bruto += dBruto
    pedidosCount += dPedidos
    pedidosValidos += dValidos
    cancelamentosQtd += dCancel
    if (tempo != null && tempo > 0) {
      tempoSoma += tempo
      tempoCount += 1
    }
    dias.push({
      data: d,
      pedidos: dPedidos,
      pedidosValidos: dValidos,
      bruto: dBruto,
      liquido: liquidoPorDia.get(d) ?? 0,
      cancelados: dCancel,
      valorMedio: Number(r.valor_medio_pedido) || 0,
      tempoPreparoMin: tempo,
    })
  }
  dias.sort((a, b) => a.data.localeCompare(b.data))

  // Fallbacks quando só veio Pedidos (sem Loja diária)
  if (bruto === 0 && liquidoTotal > 0) bruto = liquidoTotal
  const liquido = liquidoTotal > 0 ? liquidoTotal : bruto
  if (pedidosCount === 0) pedidosCount = pedidos.length

  return {
    hasData: true,
    bruto,
    liquido,
    pctLoja: bruto > 0 ? (liquido / bruto) * 100 : 0,
    descontos: Math.max(0, bruto - liquido),
    pedidos: pedidosCount,
    pedidosValidos,
    cancelamentosQtd,
    ticketMedio: pedidosCount > 0 ? bruto / pedidosCount : 0,
    tempoPreparoMedio: tempoCount > 0 ? tempoSoma / tempoCount : null,
    dias,
  }
}

// ─── Cobertura: matriz loja × mês (Loja diária / Itens / Pedidos) ────

const KEETA_COMPLETE_RATIO = 0.6

/**
 * Versão Keeta do getNinefoodCoverageMatrix. Pra cada loja × mês, diz o que
 * tem importado das 3 fontes:
 *  - Loja  → keeta_daily_loja
 *  - Item  → keeta_daily_item
 *  - Pedido → keeta_pedidos
 */
export async function getKeetaCoverageMatrix(
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number,
): Promise<KeetaCoverageMatrix> {
  const admin = createAdminClient()

  const months: KeetaCoverageMatrix["months"] = []
  let y = startYear
  let m = startMonth
  while (y < endYear || (y === endYear && m <= endMonth)) {
    months.push({
      year: y,
      month: m,
      key: `${y}-${String(m).padStart(2, "0")}`,
      label: `${String(m).padStart(2, "0")}/${String(y).slice(2)}`,
    })
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }

  const rangeStart = `${startYear}-${String(startMonth).padStart(2, "0")}-01`
  const endLastDay = new Date(endYear, endMonth, 0).getDate()
  const rangeEnd = `${endYear}-${String(endMonth).padStart(2, "0")}-${String(endLastDay).padStart(2, "0")}`

  // Isolamento multi-tenant: só as lojas da empresa do usuário (null =
  // super-admin de plataforma sem vínculo → vê tudo). Empresa sem lojas → set
  // vazio → matriz vazia.
  const allowed = await getAccessibleUnitIds()
  const allowSet = allowed ? new Set(allowed) : null

  const { data: unitsRows } = await admin
    .from("units")
    .select("id, code, name, active, data_inauguracao, data_encerramento")
    .order("code")
  const units = (unitsRows ?? []).filter((u) => !allowSet || allowSet.has(u.id))
  const unitIds = units.map((u) => u.id)
  const dateToKey = (d: string) => d.slice(0, 7)

  // Lojas vinculadas à Keeta + datas por plataforma (fallback: unidade).
  const { data: platRows } = await admin
    .from("unit_platforms")
    .select("unit_id, data_inauguracao, data_encerramento")
    .eq("platform", "keeta")
    .eq("active", true)
  const platOpByUnit = new Map<
    string,
    { inaug: string | null; encer: string | null }
  >()
  for (const r of platRows ?? [])
    platOpByUnit.set(r.unit_id, {
      inaug: r.data_inauguracao,
      encer: r.data_encerramento,
    })
  const linkedToPlatform = new Set(platOpByUnit.keys())

  // 1) Loja: dias distintos por (unit, mês) — keeta_daily_loja tem unique (unit, data)
  const lojaByUnitMonth = new Map<string, Map<string, number>>()
  // 2) Item: dias distintos por (unit, mês)
  const itemByUnitMonth = new Map<string, Map<string, Set<string>>>()
  // 3) Pedido: total + dias distintos por (unit, mês)
  const pedidoByUnitMonth = new Map<
    string,
    Map<string, { total: number; dias: Set<string> }>
  >()
  // 4) Pedidos recentes: total por (unit, mês) — tabela keeta_pedidos_recentes
  const recentesByUnitMonth = new Map<string, Map<string, number>>()

  if (unitIds.length > 0) {
    type CobRow = {
      unit_id: string
      data: string
      ref_year: number | null
      ref_month: number | null
    }
    const [lojaRes, itemRes, pedRes, recRes] = await Promise.all([
      fetchAllRows<CobRow>(
        (f, t) =>
          admin
            .from("keeta_daily_loja")
            .select("unit_id, data, ref_year, ref_month")
            .in("unit_id", unitIds)
            .gte("data", rangeStart)
            .lte("data", rangeEnd)
            .order("id")
            .range(f, t),
        "keeta_daily_loja cobertura",
      ),
      fetchAllRows<{ unit_id: string; data: string }>(
        (f, t) =>
          admin
            .from("keeta_daily_item")
            .select("unit_id, data")
            .in("unit_id", unitIds)
            .gte("data", rangeStart)
            .lte("data", rangeEnd)
            .order("id")
            .range(f, t),
        "keeta_daily_item cobertura",
      ),
      fetchAllRows<CobRow>(
        (f, t) =>
          admin
            .from("keeta_pedidos")
            .select("unit_id, data, ref_year, ref_month")
            .in("unit_id", unitIds)
            .gte("data", rangeStart)
            .lte("data", rangeEnd)
            .order("id")
            .range(f, t),
        "keeta_pedidos cobertura",
      ),
      fetchAllRows<CobRow>(
        (f, t) =>
          admin
            .from("keeta_pedidos_recentes")
            .select("unit_id, data, ref_year, ref_month")
            .in("unit_id", unitIds)
            .gte("data", rangeStart)
            .lte("data", rangeEnd)
            .order("id")
            .range(f, t),
        "keeta_pedidos_recentes cobertura",
      ),
    ])

    for (const r of lojaRes) {
      const k =
        r.ref_year != null && r.ref_month != null
          ? `${r.ref_year}-${String(r.ref_month).padStart(2, "0")}`
          : dateToKey(r.data as string)
      const inner = lojaByUnitMonth.get(r.unit_id) ?? new Map<string, number>()
      inner.set(k, (inner.get(k) ?? 0) + 1)
      lojaByUnitMonth.set(r.unit_id, inner)
    }
    for (const r of itemRes) {
      const dateStr = r.data as string
      const k = dateToKey(dateStr)
      const inner =
        itemByUnitMonth.get(r.unit_id) ?? new Map<string, Set<string>>()
      const set = inner.get(k) ?? new Set<string>()
      set.add(dateStr)
      inner.set(k, set)
      itemByUnitMonth.set(r.unit_id, inner)
    }
    for (const r of pedRes) {
      const k =
        r.ref_year != null && r.ref_month != null
          ? `${r.ref_year}-${String(r.ref_month).padStart(2, "0")}`
          : dateToKey(r.data as string)
      const inner =
        pedidoByUnitMonth.get(r.unit_id) ??
        new Map<string, { total: number; dias: Set<string> }>()
      const cur = inner.get(k) ?? { total: 0, dias: new Set<string>() }
      cur.total += 1
      cur.dias.add(r.data as string)
      inner.set(k, cur)
      pedidoByUnitMonth.set(r.unit_id, inner)
    }
    for (const r of recRes) {
      const k =
        r.ref_year != null && r.ref_month != null
          ? `${r.ref_year}-${String(r.ref_month).padStart(2, "0")}`
          : dateToKey(r.data as string)
      const inner = recentesByUnitMonth.get(r.unit_id) ?? new Map<string, number>()
      inner.set(k, (inner.get(k) ?? 0) + 1)
      recentesByUnitMonth.set(r.unit_id, inner)
    }
  }

  const { year: currentYear, month: currentMonth } = currentPeriod()

  return {
    months,
    units: units.map((u) => {
      const platOp = platOpByUnit.get(u.id)
      const op = {
        dataInauguracao:
          platOp?.inaug ??
          (u as { data_inauguracao: string | null }).data_inauguracao,
        dataEncerramento:
          platOp?.encer ??
          (u as { data_encerramento: string | null }).data_encerramento,
      }
      const isLinked = linkedToPlatform.has(u.id)
      const cells: Record<string, NinefoodCoverageCell> = {}
      for (const month of months) {
        const win = monthOperationWindow(month.year, month.month, op)
        const diasNoMes = win.operatingDays
        const isCurrentMonth =
          month.year === currentYear && month.month === currentMonth
        const minComplete = isCurrentMonth
          ? 1
          : Math.max(1, Math.ceil(diasNoMes * KEETA_COMPLETE_RATIO))

        const lojaDias = lojaByUnitMonth.get(u.id)?.get(month.key) ?? 0
        const lojaStatus: NinefoodCoverageStatus =
          lojaDias >= minComplete ? "complete" : lojaDias > 0 ? "partial" : "empty"

        const itemSet = itemByUnitMonth.get(u.id)?.get(month.key)
        const itemDias = itemSet ? itemSet.size : 0
        const itemStatus: NinefoodCoverageStatus =
          itemDias >= minComplete ? "complete" : itemDias > 0 ? "partial" : "empty"

        const pedAcc = pedidoByUnitMonth.get(u.id)?.get(month.key)
        const pedTotal = pedAcc?.total ?? 0
        const pedDias = pedAcc?.dias.size ?? 0
        const pedidoStatus: NinefoodCoverageStatus =
          pedDias >= minComplete ? "complete" : pedDias > 0 ? "partial" : "empty"

        const recTotal = recentesByUnitMonth.get(u.id)?.get(month.key) ?? 0
        const recentesStatus: NinefoodCoverageStatus =
          recTotal > 0 ? "complete" : "empty"

        cells[month.key] = {
          loja: { status: lojaStatus, diasImportados: lojaDias, diasNoMes },
          item: { status: itemStatus, diasImportados: itemDias },
          pedido: {
            status: pedidoStatus,
            totalPedidos: pedTotal,
            diasComPedido: pedDias,
            diasNoMes,
          },
          recentes: { status: recentesStatus, totalPedidos: recTotal },
          applicable: isLinked && win.applicable,
        }
      }
      return {
        id: u.id,
        code: u.code,
        name: u.name,
        active: u.active,
        cells,
      }
    }),
  }
}
