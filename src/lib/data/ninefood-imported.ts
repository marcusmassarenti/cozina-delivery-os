/**
 * Queries em cima dos dados importados do 99 Food (tabelas 0014).
 *
 * Convenção:
 * - "Month" = (ref_year, ref_month) — usado pelo Financeiro (loja)
 * - "data" = date dia-a-dia
 *
 * Estrutura simples comparada ao iFood: o XLSX do 99 Food já vem agregado
 * por dia, então não precisamos de RPC. SELECT direto + agg em JS é leve.
 */

import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

// ─── Tipos ───────────────────────────────────────────────────────────

export type NinefoodResumo = {
  /** Soma dos pedidos do mês (do "Total de vendas realizadas") */
  pedidos: number
  /** "Receita total de vendas" */
  bruto: number
  /** "Receita total" (líquido pós-taxas) */
  liquido: number
  /** Soma "Despesas de comissão da loja" */
  comissaoRs: number
  /** Soma "Taxa de canal de pagamento da loja" */
  taxaCanalPagamentoRs: number
  /** Soma "Despesas de ofertas da loja" */
  promocoesRs: number
  /** Soma de cancelamentos comerciantes */
  cancelamentosQtd: number
  /** Média da Avaliação da loja nos dias com dado */
  avaliacaoMedia: number | null
  /** Média da Taxa de Aceitação nos dias com dado */
  taxaAceitacaoMedia: number | null
  /** Média do tempo de preparo nos dias com dado */
  tempoPreparoMedio: number | null
  /** Quantos dias do mês tinham dados importados */
  diasComDados: number
  /** Ticket médio derivado (bruto / pedidos) */
  ticketMedio: number
  /** Percentual líquido / bruto */
  pctLoja: number
  /** True se há dados importados pra essa unidade/mês */
  hasData: boolean
}

// ─── getNinefoodResumoByUnits ────────────────────────────────────────

export async function getNinefoodResumoByUnits(
  unitIds: string[],
  year: number,
  month: number,
): Promise<Map<string, NinefoodResumo>> {
  const out = new Map<string, NinefoodResumo>()
  if (unitIds.length === 0) return out

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("ninefood_daily_loja")
    .select(
      "unit_id, data, pedidos, bruto, liquido, comissao_rs, taxa_canal_pagamento_rs, promocoes_rs, avaliacao_loja, taxa_aceitacao_pct, cancelamentos_qtd, tempo_medio_preparo_min",
    )
    .in("unit_id", unitIds)
    .eq("ref_year", year)
    .eq("ref_month", month)

  if (error) {
    console.error("getNinefoodResumoByUnits error:", error.message)
    return out
  }

  // Agrega em JS por unit_id
  type Acc = {
    pedidos: number
    bruto: number
    liquido: number
    comissao: number
    taxaPgto: number
    promo: number
    cancel: number
    avaliacoes: number[]
    aceitacoes: number[]
    tempos: number[]
    dias: Set<string>
  }
  const accs = new Map<string, Acc>()

  for (const row of data ?? []) {
    let acc = accs.get(row.unit_id)
    if (!acc) {
      acc = {
        pedidos: 0,
        bruto: 0,
        liquido: 0,
        comissao: 0,
        taxaPgto: 0,
        promo: 0,
        cancel: 0,
        avaliacoes: [],
        aceitacoes: [],
        tempos: [],
        dias: new Set(),
      }
      accs.set(row.unit_id, acc)
    }
    acc.pedidos += row.pedidos ?? 0
    acc.bruto += Number(row.bruto ?? 0)
    acc.liquido += Number(row.liquido ?? 0)
    acc.comissao += Number(row.comissao_rs ?? 0)
    acc.taxaPgto += Number(row.taxa_canal_pagamento_rs ?? 0)
    acc.promo += Number(row.promocoes_rs ?? 0)
    acc.cancel += row.cancelamentos_qtd ?? 0
    if (row.avaliacao_loja != null) acc.avaliacoes.push(Number(row.avaliacao_loja))
    if (row.taxa_aceitacao_pct != null)
      acc.aceitacoes.push(Number(row.taxa_aceitacao_pct))
    if (row.tempo_medio_preparo_min != null)
      acc.tempos.push(row.tempo_medio_preparo_min)
    if (row.data) acc.dias.add(row.data)
  }

  for (const [unitId, acc] of accs) {
    const ticketMedio = acc.pedidos > 0 ? acc.bruto / acc.pedidos : 0
    const pctLoja = acc.bruto > 0 ? (acc.liquido / acc.bruto) * 100 : 0
    out.set(unitId, {
      pedidos: acc.pedidos,
      bruto: acc.bruto,
      liquido: acc.liquido,
      comissaoRs: acc.comissao,
      taxaCanalPagamentoRs: acc.taxaPgto,
      promocoesRs: acc.promo,
      cancelamentosQtd: acc.cancel,
      avaliacaoMedia: mean(acc.avaliacoes),
      taxaAceitacaoMedia: mean(acc.aceitacoes),
      tempoPreparoMedio: mean(acc.tempos),
      diasComDados: acc.dias.size,
      ticketMedio,
      pctLoja,
      hasData: acc.bruto > 0 || acc.pedidos > 0,
    })
  }

  return out
}

// ─── getNinefoodResumoForMonth (1 unidade, mesmo formato) ───────────

export async function getNinefoodResumoForMonth(
  unitId: string,
  year: number,
  month: number,
): Promise<NinefoodResumo> {
  const batch = await getNinefoodResumoByUnits([unitId], year, month)
  return (
    batch.get(unitId) ?? {
      pedidos: 0,
      bruto: 0,
      liquido: 0,
      comissaoRs: 0,
      taxaCanalPagamentoRs: 0,
      promocoesRs: 0,
      cancelamentosQtd: 0,
      avaliacaoMedia: null,
      taxaAceitacaoMedia: null,
      tempoPreparoMedio: null,
      diasComDados: 0,
      ticketMedio: 0,
      pctLoja: 0,
      hasData: false,
    }
  )
}

// ─── getNinefoodDiasForMonth: 1 linha por dia importado ─────────────

export type NinefoodDiaResumo = {
  data: string // YYYY-MM-DD
  pedidos: number
  bruto: number
  liquido: number
  ticketMedio: number
  comissaoRs: number
  taxaCanalPagamentoRs: number
  promocoesRs: number
  avaliacaoLoja: number | null
  taxaAceitacaoPct: number | null
  cancelamentosQtd: number | null
  tempoMedioPreparoMin: number | null
}

export async function getNinefoodDiasForMonth(
  unitId: string,
  year: number,
  month: number,
): Promise<NinefoodDiaResumo[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("ninefood_daily_loja")
    .select(
      "data, pedidos, bruto, liquido, ticket_medio, comissao_rs, taxa_canal_pagamento_rs, promocoes_rs, avaliacao_loja, taxa_aceitacao_pct, cancelamentos_qtd, tempo_medio_preparo_min",
    )
    .eq("unit_id", unitId)
    .eq("ref_year", year)
    .eq("ref_month", month)
    .order("data", { ascending: true })

  if (error) {
    console.error("getNinefoodDiasForMonth error:", error.message)
    return []
  }
  return (data ?? []).map((r) => ({
    data: r.data as string,
    pedidos: r.pedidos ?? 0,
    bruto: Number(r.bruto ?? 0),
    liquido: Number(r.liquido ?? 0),
    ticketMedio: Number(r.ticket_medio ?? 0),
    comissaoRs: Number(r.comissao_rs ?? 0),
    taxaCanalPagamentoRs: Number(r.taxa_canal_pagamento_rs ?? 0),
    promocoesRs: Number(r.promocoes_rs ?? 0),
    avaliacaoLoja: r.avaliacao_loja != null ? Number(r.avaliacao_loja) : null,
    taxaAceitacaoPct:
      r.taxa_aceitacao_pct != null ? Number(r.taxa_aceitacao_pct) : null,
    cancelamentosQtd: r.cancelamentos_qtd ?? null,
    tempoMedioPreparoMin: r.tempo_medio_preparo_min ?? null,
  }))
}

// ─── getNinefoodItensRankingForMonth: top itens vendidos ────────────

export type NinefoodItemRanking = {
  nomeItem: string
  receita: number
  qtdVendida: number
  precoMedio: number
  alcanceMedio: number
  conversaoMedia: number | null
  diasComVenda: number
}

export async function getNinefoodItensRankingForMonth(
  unitId: string,
  year: number,
  month: number,
  limit = 30,
): Promise<NinefoodItemRanking[]> {
  const admin = createAdminClient()
  // ref_year/ref_month não existem nessa tabela — filtra por data range
  const monthStr = String(month).padStart(2, "0")
  const startIso = `${year}-${monthStr}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const endExcl = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`

  const { data, error } = await admin
    .from("ninefood_daily_item")
    .select("nome_item, receita, qtd_vendida, preco_medio, alcance, conversao_pct")
    .eq("unit_id", unitId)
    .gte("data", startIso)
    .lt("data", endExcl)

  if (error) {
    console.error("getNinefoodItensRankingForMonth error:", error.message)
    return []
  }

  // Agrega em JS por nome_item
  type Acc = {
    nomeItem: string
    receita: number
    qtdVendida: number
    precos: number[]
    alcances: number[]
    conversoes: number[]
    dias: number
  }
  const accs = new Map<string, Acc>()

  for (const row of data ?? []) {
    if (!row.nome_item) continue
    let acc = accs.get(row.nome_item)
    if (!acc) {
      acc = {
        nomeItem: row.nome_item,
        receita: 0,
        qtdVendida: 0,
        precos: [],
        alcances: [],
        conversoes: [],
        dias: 0,
      }
      accs.set(row.nome_item, acc)
    }
    acc.receita += Number(row.receita ?? 0)
    acc.qtdVendida += row.qtd_vendida ?? 0
    if (row.preco_medio && Number(row.preco_medio) > 0) {
      acc.precos.push(Number(row.preco_medio))
    }
    if (row.alcance && row.alcance > 0) {
      acc.alcances.push(row.alcance)
    }
    if (row.conversao_pct != null) {
      acc.conversoes.push(Number(row.conversao_pct))
    }
    if ((row.qtd_vendida ?? 0) > 0) acc.dias += 1
  }

  return Array.from(accs.values())
    .map((a) => ({
      nomeItem: a.nomeItem,
      receita: a.receita,
      qtdVendida: a.qtdVendida,
      precoMedio: a.precos.length > 0 ? mean(a.precos) ?? 0 : 0,
      alcanceMedio: a.alcances.length > 0 ? mean(a.alcances) ?? 0 : 0,
      conversaoMedia: a.conversoes.length > 0 ? mean(a.conversoes) : null,
      diasComVenda: a.dias,
    }))
    .sort((a, b) => b.receita - a.receita)
    .slice(0, limit)
}

// ─── ninefoodHasAnyDataForMonth: qualquer dado importado no mês? ────

/**
 * Retorna true se há qualquer dado importado do 99 Food (Loja OU Item)
 * pra essa unidade no mês. Usado pelo gate "Unidade sem dados no mês"
 * da página de detalhe — sem isso, Marcus importa só Cardápio e a página
 * bloqueia tudo achando que não tem nada.
 */
export async function ninefoodHasAnyDataForMonth(
  unitId: string,
  year: number,
  month: number,
): Promise<boolean> {
  const admin = createAdminClient()
  const monthStr = String(month).padStart(2, "0")
  const startIso = `${year}-${monthStr}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const endExcl = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`

  const [lojaRes, itemRes] = await Promise.all([
    admin
      .from("ninefood_daily_loja")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", unitId)
      .eq("ref_year", year)
      .eq("ref_month", month),
    admin
      .from("ninefood_daily_item")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", unitId)
      .gte("data", startIso)
      .lt("data", endExcl),
  ])
  return (lojaRes.count ?? 0) > 0 || (itemRes.count ?? 0) > 0
}

// ─── Avaliações 99 Food (das tabelas ninefood_pedidos) ──────────────

export type NinefoodAvaliacoesResumo = {
  total: number
  notaMedia: number
  distribucao: Record<1 | 2 | 3 | 4 | 5, number>
  comComentario: number
  topTagsPositivas: Array<{ tag: string; count: number }>
  topTagsNegativas: Array<{ tag: string; count: number }>
  hasData: boolean
}

export type NinefoodAvaliacaoListItem = {
  id: string
  pedidoIdCurto: string | null
  dataAvaliacao: string
  dataPedido: string | null
  nota: number
  comentario: string | null
  tags: string[]
  /** Cliente: 0 pedidos antes = novo */
  qtdPedidosAnteriores: number | null
}

/**
 * Resumo de avaliações do 99 Food no mês. Espelha AvaliacoesResumo do iFood.
 *
 * O 99 Food não separa tags entre positivas/negativas — vêm em string única.
 * Classificamos por nota: nota >= 4 → positivas; nota <= 2 → negativas.
 */
export async function getNinefoodAvaliacoesResumoForMonth(
  unitId: string,
  year: number,
  month: number,
): Promise<NinefoodAvaliacoesResumo> {
  const admin = createAdminClient()
  const monthStr = String(month).padStart(2, "0")
  const startIso = `${year}-${monthStr}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const endExcl = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`

  const { data } = await admin
    .from("ninefood_pedidos")
    .select("nivel_avaliacao, conteudo_avaliacao, tag_avaliacao")
    .eq("unit_id", unitId)
    .not("nivel_avaliacao", "is", null)
    .gte("data_avaliacao", startIso)
    .lt("data_avaliacao", endExcl)
    .limit(50000)

  const rows = data ?? []
  if (rows.length === 0) {
    return {
      total: 0,
      notaMedia: 0,
      distribucao: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      comComentario: 0,
      topTagsPositivas: [],
      topTagsNegativas: [],
      hasData: false,
    }
  }

  const dist: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0,
  }
  let soma = 0
  let comComentario = 0
  const tagPos = new Map<string, number>()
  const tagNeg = new Map<string, number>()
  for (const r of rows) {
    const nota = Number(r.nivel_avaliacao) as 1 | 2 | 3 | 4 | 5
    if (nota >= 1 && nota <= 5) {
      dist[nota] += 1
      soma += nota
    }
    if (r.conteudo_avaliacao && String(r.conteudo_avaliacao).trim().length > 0) {
      comComentario++
    }
    if (r.tag_avaliacao) {
      const tags = String(r.tag_avaliacao)
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean)
      const target = nota >= 4 ? tagPos : nota <= 2 ? tagNeg : null
      if (target) {
        for (const t of tags) target.set(t, (target.get(t) ?? 0) + 1)
      }
    }
  }
  return {
    total: rows.length,
    notaMedia: Math.round((soma / rows.length) * 100) / 100,
    distribucao: dist,
    comComentario,
    topTagsPositivas: Array.from(tagPos.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag, count]) => ({ tag, count })),
    topTagsNegativas: Array.from(tagNeg.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag, count]) => ({ tag, count })),
    hasData: true,
  }
}

/**
 * Lista de avaliações do mês (pra tab Avaliações da unidade).
 * Inclui comentário + tags + qtd pedidos anteriores do cliente.
 */
export async function listNinefoodAvaliacoesForMonth(
  unitId: string,
  year: number,
  month: number,
  limit = 100,
): Promise<NinefoodAvaliacaoListItem[]> {
  const admin = createAdminClient()
  const monthStr = String(month).padStart(2, "0")
  const startIso = `${year}-${monthStr}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const endExcl = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`

  const { data } = await admin
    .from("ninefood_pedidos")
    .select(
      "id, pedido_id, data_avaliacao, horario_pedido, nivel_avaliacao, conteudo_avaliacao, tag_avaliacao, qtd_pedidos_anteriores_cliente",
    )
    .eq("unit_id", unitId)
    .not("nivel_avaliacao", "is", null)
    .gte("data_avaliacao", startIso)
    .lt("data_avaliacao", endExcl)
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
      nota: Number(r.nivel_avaliacao ?? 0),
      comentario: r.conteudo_avaliacao
        ? String(r.conteudo_avaliacao)
        : null,
      tags: r.tag_avaliacao
        ? String(r.tag_avaliacao)
            .split(/[,;]/)
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
      qtdPedidosAnteriores:
        r.qtd_pedidos_anteriores_cliente != null
          ? Number(r.qtd_pedidos_anteriores_cliente)
          : null,
    }
  })
}

// ─── Cobertura: matriz loja × mês das 3 fontes 99 Food ──────────────

export type NinefoodCoverageStatus = "complete" | "partial" | "empty"

export type NinefoodCoverageCell = {
  loja: {
    // Dados da loja (financeiro agregado por dia)
    status: NinefoodCoverageStatus
    diasImportados: number
    diasNoMes: number
  }
  item: {
    // Dados do item (cardápio)
    status: NinefoodCoverageStatus
    diasImportados: number
  }
  pedido: {
    // Dados do pedido (avaliações + clientes + logística)
    status: NinefoodCoverageStatus
    totalPedidos: number
    diasComPedido: number
    diasNoMes: number
  }
}

export type NinefoodCoverageMatrix = {
  months: Array<{ year: number; month: number; key: string; label: string }>
  units: Array<{
    id: string
    code: string
    name: string
    active: boolean
    cells: Record<string, NinefoodCoverageCell>
  }>
}

/** Mesmo threshold do iFood: 60% dos dias do mês = completo. */
const NINEFOOD_COMPLETE_RATIO = 0.6

/**
 * Versão 99 Food do getCoverageMatrix do iFood.
 * Pra cada loja × mês, diz o que tem importado das 3 fontes:
 *  - Loja (ninefood_daily_loja)
 *  - Item (ninefood_daily_item)
 *  - Pedido (ninefood_pedidos)
 */
export async function getNinefoodCoverageMatrix(
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number,
): Promise<NinefoodCoverageMatrix> {
  const admin = createAdminClient()

  // Gera lista de meses no range
  const months: NinefoodCoverageMatrix["months"] = []
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

  // Todas unidades
  const { data: unitsRows } = await admin
    .from("units")
    .select("id, code, name, active")
    .order("code")
  const units = unitsRows ?? []
  const unitIds = units.map((u) => u.id)

  const dateToKey = (d: string) => d.slice(0, 7)

  // 1) Loja: agrupa por (unit, year-month) e conta DIAS DISTINTOS
  // Como ninefood_daily_loja tem UNIQUE (unit_id, data), basta contar rows.
  const lojaByUnitMonth = new Map<string, Map<string, number>>()
  if (unitIds.length > 0) {
    const { data } = await admin
      .from("ninefood_daily_loja")
      .select("unit_id, data, ref_year, ref_month")
      .in("unit_id", unitIds)
      .gte("data", rangeStart)
      .lte("data", rangeEnd)
      .limit(50000)
    for (const r of data ?? []) {
      const k =
        r.ref_year != null && r.ref_month != null
          ? `${r.ref_year}-${String(r.ref_month).padStart(2, "0")}`
          : dateToKey(r.data as string)
      const inner = lojaByUnitMonth.get(r.unit_id) ?? new Map<string, number>()
      inner.set(k, (inner.get(k) ?? 0) + 1)
      lojaByUnitMonth.set(r.unit_id, inner)
    }
  }

  // 2) Item: conta DIAS DISTINTOS por (unit, year-month)
  // ninefood_daily_item NÃO tem unique por dia (tem por item-dia), então
  // usamos Set pra contar dias únicos.
  const itemByUnitMonth = new Map<string, Map<string, Set<string>>>()
  if (unitIds.length > 0) {
    const { data } = await admin
      .from("ninefood_daily_item")
      .select("unit_id, data")
      .in("unit_id", unitIds)
      .gte("data", rangeStart)
      .lte("data", rangeEnd)
      .limit(100000)
    for (const r of data ?? []) {
      const dateStr = r.data as string
      const k = dateToKey(dateStr)
      const inner =
        itemByUnitMonth.get(r.unit_id) ?? new Map<string, Set<string>>()
      const set = inner.get(k) ?? new Set<string>()
      set.add(dateStr)
      inner.set(k, set)
      itemByUnitMonth.set(r.unit_id, inner)
    }
  }

  // 3) Pedido: conta total + dias distintos por (unit, year-month)
  const pedidoByUnitMonth = new Map<
    string,
    Map<string, { total: number; dias: Set<string> }>
  >()
  if (unitIds.length > 0) {
    const { data } = await admin
      .from("ninefood_pedidos")
      .select("unit_id, data, ref_year, ref_month")
      .in("unit_id", unitIds)
      .gte("data", rangeStart)
      .lte("data", rangeEnd)
      .limit(200000)
    for (const r of data ?? []) {
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
  }

  // Mês corrente — qualquer dado conta como completo
  const todayLocal = new Date()
  const currentYear = todayLocal.getFullYear()
  const currentMonth = todayLocal.getMonth() + 1

  return {
    months,
    units: units.map((u) => {
      const cells: Record<string, NinefoodCoverageCell> = {}
      for (const month of months) {
        const diasNoMes = new Date(month.year, month.month, 0).getDate()
        const isCurrentMonth =
          month.year === currentYear && month.month === currentMonth
        const minComplete = isCurrentMonth
          ? 1
          : Math.ceil(diasNoMes * NINEFOOD_COMPLETE_RATIO)

        // Loja
        const lojaDias = lojaByUnitMonth.get(u.id)?.get(month.key) ?? 0
        const lojaStatus: NinefoodCoverageStatus =
          lojaDias >= minComplete
            ? "complete"
            : lojaDias > 0
              ? "partial"
              : "empty"

        // Item
        const itemSet = itemByUnitMonth.get(u.id)?.get(month.key)
        const itemDias = itemSet ? itemSet.size : 0
        const itemStatus: NinefoodCoverageStatus =
          itemDias >= minComplete
            ? "complete"
            : itemDias > 0
              ? "partial"
              : "empty"

        // Pedido
        const pedAcc = pedidoByUnitMonth.get(u.id)?.get(month.key)
        const pedTotal = pedAcc?.total ?? 0
        const pedDias = pedAcc?.dias.size ?? 0
        const pedidoStatus: NinefoodCoverageStatus =
          pedDias >= minComplete
            ? "complete"
            : pedDias > 0
              ? "partial"
              : "empty"

        cells[month.key] = {
          loja: { status: lojaStatus, diasImportados: lojaDias, diasNoMes },
          item: { status: itemStatus, diasImportados: itemDias },
          pedido: {
            status: pedidoStatus,
            totalPedidos: pedTotal,
            diasComPedido: pedDias,
            diasNoMes,
          },
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

// ─── Helpers ─────────────────────────────────────────────────────────

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  const sum = values.reduce((s, v) => s + v, 0)
  return Math.round((sum / values.length) * 100) / 100
}
