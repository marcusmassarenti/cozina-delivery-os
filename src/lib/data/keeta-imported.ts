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
 */
export async function getKeetaResumoByUnits(
  unitIds: string[],
  year: number,
  month: number,
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
  }>((a, b) =>
    admin
      .from("keeta_daily_loja")
      .select("unit_id, vendas_itens, total_pedidos, pedidos_cancelados")
      .in("unit_id", unitIds)
      .eq("ref_year", year)
      .eq("ref_month", month)
      .range(a, b),
  )
  for (const r of loja) {
    const cur = out.get(r.unit_id) ?? emptyKeeta()
    cur.bruto += Number(r.vendas_itens) || 0
    cur.pedidos += r.total_pedidos || 0
    cur.cancelamentosQtd += r.pedidos_cancelados || 0
    out.set(r.unit_id, cur)
  }

  // Pedidos (líquido)
  const pedidos = await pageAll<{
    unit_id: string
    ganhos_liquidos: number | string | null
    vendas_itens: number | string | null
  }>((a, b) =>
    admin
      .from("keeta_pedidos")
      .select("unit_id, ganhos_liquidos, vendas_itens")
      .in("unit_id", unitIds)
      .eq("ref_year", year)
      .eq("ref_month", month)
      .range(a, b),
  )
  const brutoFromPedidos = new Map<string, number>()
  const countFromPedidos = new Map<string, number>()
  for (const r of pedidos) {
    const cur = out.get(r.unit_id) ?? emptyKeeta()
    cur.liquido += Number(r.ganhos_liquidos) || 0
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
): Promise<KeetaResumo> {
  const map = await getKeetaResumoByUnits([unitId], year, month)
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

  let q = admin
    .from("keeta_pedidos")
    .select("id, unit_id, pedido_id, pontuacao_avaliacao, conteudo_avaliacao, data_avaliacao")
    .not("pontuacao_avaliacao", "is", null)
    .gte("data_avaliacao", startIso)
    .lte("data_avaliacao", endIncl)
    .order("data_avaliacao", { ascending: false })
    .limit(50000)
  if (filterUnitIds && filterUnitIds.length > 0) q = q.in("unit_id", filterUnitIds)
  const { data } = await q

  const rows = data ?? []
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
    new Set(comentariosNaoVazios.slice(0, 10).map((r) => r.unit_id)),
  )
  const unitMap = new Map<string, { code: string; name: string }>()
  if (unitIds.length > 0) {
    const { data: units } = await admin
      .from("units")
      .select("id, code, name")
      .in("id", unitIds)
    for (const u of units ?? []) unitMap.set(u.id, { code: u.code, name: u.name })
  }
  const ultimosComentarios = comentariosNaoVazios.slice(0, 5).map((r) => {
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

  const { data } = await admin
    .from("keeta_pedidos")
    .select("pontuacao_avaliacao, conteudo_avaliacao")
    .eq("unit_id", unitId)
    .not("pontuacao_avaliacao", "is", null)
    .gte("data_avaliacao", startIso)
    .lte("data_avaliacao", endIncl)
    .limit(50000)

  const rows = data ?? []
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

  const { data: unitsRows } = await admin
    .from("units")
    .select("id, code, name, active")
    .order("code")
  const units = unitsRows ?? []
  const unitIds = units.map((u) => u.id)
  const dateToKey = (d: string) => d.slice(0, 7)

  // 1) Loja: dias distintos por (unit, mês) — keeta_daily_loja tem unique (unit, data)
  const lojaByUnitMonth = new Map<string, Map<string, number>>()
  // 2) Item: dias distintos por (unit, mês)
  const itemByUnitMonth = new Map<string, Map<string, Set<string>>>()
  // 3) Pedido: total + dias distintos por (unit, mês)
  const pedidoByUnitMonth = new Map<
    string,
    Map<string, { total: number; dias: Set<string> }>
  >()

  if (unitIds.length > 0) {
    const [lojaRes, itemRes, pedRes] = await Promise.all([
      admin
        .from("keeta_daily_loja")
        .select("unit_id, data, ref_year, ref_month")
        .in("unit_id", unitIds)
        .gte("data", rangeStart)
        .lte("data", rangeEnd)
        .limit(50000),
      admin
        .from("keeta_daily_item")
        .select("unit_id, data")
        .in("unit_id", unitIds)
        .gte("data", rangeStart)
        .lte("data", rangeEnd)
        .limit(200000),
      admin
        .from("keeta_pedidos")
        .select("unit_id, data, ref_year, ref_month")
        .in("unit_id", unitIds)
        .gte("data", rangeStart)
        .lte("data", rangeEnd)
        .limit(200000),
    ])

    for (const r of lojaRes.data ?? []) {
      const k =
        r.ref_year != null && r.ref_month != null
          ? `${r.ref_year}-${String(r.ref_month).padStart(2, "0")}`
          : dateToKey(r.data as string)
      const inner = lojaByUnitMonth.get(r.unit_id) ?? new Map<string, number>()
      inner.set(k, (inner.get(k) ?? 0) + 1)
      lojaByUnitMonth.set(r.unit_id, inner)
    }
    for (const r of itemRes.data ?? []) {
      const dateStr = r.data as string
      const k = dateToKey(dateStr)
      const inner =
        itemByUnitMonth.get(r.unit_id) ?? new Map<string, Set<string>>()
      const set = inner.get(k) ?? new Set<string>()
      set.add(dateStr)
      inner.set(k, set)
      itemByUnitMonth.set(r.unit_id, inner)
    }
    for (const r of pedRes.data ?? []) {
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

  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1

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
          : Math.ceil(diasNoMes * KEETA_COMPLETE_RATIO)

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
