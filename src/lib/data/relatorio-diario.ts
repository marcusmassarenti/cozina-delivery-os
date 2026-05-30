/**
 * Relatório Diário — matriz loja × dia, espelhando a planilha "Dados Diários".
 *
 * Métricas: faturamento bruto, pedidos, cancelamentos (qtd) — por dia, por
 * loja, com totais do mês e da rede.
 *
 * Fontes:
 *  - iFood: ifood_financeiro_lancamentos (linha a linha). Bruto = soma de
 *    `Venda` + `Entrada Financeira`; pedidos = pedidos únicos de venda;
 *    cancelamentos = pedidos únicos de Cancelamento Total/Parcial. Agrupado
 *    por dia de `data_fato_gerador` (convertido pro fuso BR).
 *  - 99 Food: ninefood_daily_loja (já agregado por dia).
 *  - Keeta: keeta_daily_loja (vendas_itens / total_pedidos / cancelados).
 *
 * Plataforma "todas" soma iFood + 99 + Keeta por (loja, dia).
 */

import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import type { ReportPlatform } from "@/lib/data/relatorio-diario-types"

// ─── Cobertura de importação (pro banner do Dashboard) ───────────────

export type PlatformCoverage = {
  /** Dia-do-mês da última data com dado (1..31). null = sem dado no mês */
  lastDay: number | null
  /** ISO YYYY-MM-DD da última data com dado */
  lastDate: string | null
}

export type ImportCoverage = {
  ifood: PlatformCoverage
  ninefood: PlatformCoverage
  keeta: PlatformCoverage
}

function parseDay(iso: string | null | undefined): PlatformCoverage {
  if (!iso) return { lastDay: null, lastDate: null }
  const m = /^(\d{4}-\d{2}-(\d{2}))/.exec(String(iso))
  return m ? { lastDay: parseInt(m[2], 10), lastDate: m[1] } : { lastDay: null, lastDate: null }
}

/**
 * Última data com dado importado por plataforma no mês. Queries baratas
 * (order desc + limit 1) — leve o bastante pro Dashboard.
 */
export async function getImportCoverageForMonth(
  year: number,
  month: number,
  filterUnitIds?: string[],
): Promise<ImportCoverage> {
  const admin = createAdminClient()

  let qi = admin
    .from("ifood_financeiro_lancamentos")
    .select("data_fato_gerador")
    .eq("ref_year", year)
    .eq("ref_month", month)
    .eq("fato_gerador", "Venda")
    .eq("descricao_lancamento", "Entrada Financeira")
    .not("data_fato_gerador", "is", null)
    .order("data_fato_gerador", { ascending: false })
    .limit(1)
  if (filterUnitIds && filterUnitIds.length > 0) qi = qi.in("unit_id", filterUnitIds)

  let qn = admin
    .from("ninefood_daily_loja")
    .select("data")
    .eq("ref_year", year)
    .eq("ref_month", month)
    .order("data", { ascending: false })
    .limit(1)
  if (filterUnitIds && filterUnitIds.length > 0) qn = qn.in("unit_id", filterUnitIds)

  let qk = admin
    .from("keeta_daily_loja")
    .select("data")
    .eq("ref_year", year)
    .eq("ref_month", month)
    .order("data", { ascending: false })
    .limit(1)
  if (filterUnitIds && filterUnitIds.length > 0) qk = qk.in("unit_id", filterUnitIds)

  const [{ data: di }, { data: dn }, { data: dk }] = await Promise.all([
    qi,
    qn,
    qk,
  ])

  return {
    ifood: parseDay(di?.[0]?.data_fato_gerador as string | undefined),
    ninefood: parseDay(dn?.[0]?.data as string | undefined),
    keeta: parseDay(dk?.[0]?.data as string | undefined),
  }
}

export type UnitDailyRow = {
  unitId: string
  code: string
  name: string
  /** valor por dia-do-mês (1..N). Dias sem dado ficam ausentes. */
  faturamento: Record<number, number>
  pedidos: Record<number, number>
  cancelamentos: Record<number, number>
  totalFaturamento: number
  totalPedidos: number
  totalCancelamentos: number
}

export type DailyReportMatrix = {
  days: number[]
  units: UnitDailyRow[]
  /** Totais da rede por dia (pra linha de rodapé) */
  networkByDay: {
    faturamento: Record<number, number>
    pedidos: Record<number, number>
    cancelamentos: Record<number, number>
  }
  totalFaturamento: number
  totalPedidos: number
  totalCancelamentos: number
  hasData: boolean
}

/**
 * Dia-do-mês (1..31) a partir do prefixo YYYY-MM-DD de uma string de data.
 * Funciona tanto pra coluna `date` ("2026-05-14") quanto pra timestamp ISO
 * ("2026-05-17T00:00:00+00:00"). NÃO converte fuso: o iFood guarda a data do
 * fato como meia-noite UTC representando o dia-calendário, então o prefixo
 * já é o dia certo (converter pra America/Sao_Paulo jogaria pro dia anterior).
 */
function dateStrDay(dateStr: string): number | null {
  const m = /^\d{4}-\d{2}-(\d{2})/.exec(dateStr)
  return m ? parseInt(m[1], 10) : null
}

/**
 * Pagina uma query do Supabase via .range() — o hard-cap de 1000 linhas
 * ignora .limit() acima disso, então precisamos paginar.
 */
async function fetchAllPages<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{
    data: T[] | null
    error: { message: string } | null
  }>,
  pageSize = 1000,
  maxRows = 200000,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (from < maxRows) {
    const { data, error } = await buildQuery(from, from + pageSize - 1)
    if (error) {
      console.error("relatorio-diario fetchAllPages error:", error.message)
      break
    }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

type Buckets = {
  faturamento: Map<string, Record<number, number>> // unitId -> {day: valor}
  pedidos: Map<string, Record<number, number>>
  cancelamentos: Map<string, Record<number, number>>
}

function emptyBuckets(): Buckets {
  return {
    faturamento: new Map(),
    pedidos: new Map(),
    cancelamentos: new Map(),
  }
}

function add(
  map: Map<string, Record<number, number>>,
  unitId: string,
  day: number,
  value: number,
) {
  const cur = map.get(unitId) ?? {}
  cur[day] = (cur[day] ?? 0) + value
  map.set(unitId, cur)
}

/**
 * iFood: agrega bruto/pedidos/cancelamentos por (unit, dia).
 * Caminho rápido = RPC ifood_financeiro_diario_by_units (agrega no Postgres).
 * Se a função ainda não existir no banco (migration 0020 não rodada), cai
 * no fallback paginado antigo — sem quebrar a tela.
 */
async function loadIfood(
  unitIds: string[],
  year: number,
  month: number,
): Promise<Buckets> {
  const b = emptyBuckets()
  if (unitIds.length === 0) return b
  const admin = createAdminClient()

  const { data, error } = await admin.rpc("ifood_financeiro_diario_by_units", {
    p_unit_ids: unitIds,
    p_year: year,
    p_month: month,
  })

  if (error) {
    // Função ainda não existe → usa o caminho antigo (lento, mas correto)
    console.error("loadIfood rpc, usando fallback:", error.message)
    return loadIfoodPaginated(unitIds, year, month)
  }

  for (const r of (data ?? []) as Array<{
    unit_id: string
    dia: number
    bruto: number | string
    pedidos: number
    cancelados: number
  }>) {
    const day = Number(r.dia)
    if (!day) continue
    add(b.faturamento, r.unit_id, day, Number(r.bruto) || 0)
    add(b.pedidos, r.unit_id, day, Number(r.pedidos) || 0)
    add(b.cancelamentos, r.unit_id, day, Number(r.cancelados) || 0)
  }
  return b
}

/** Fallback antigo: pagina ifood_financeiro_lancamentos e agrega em JS. */
async function loadIfoodPaginated(
  unitIds: string[],
  year: number,
  month: number,
): Promise<Buckets> {
  const b = emptyBuckets()
  if (unitIds.length === 0) return b
  const admin = createAdminClient()

  // Vendas (bruto + pedidos únicos) — 1 linha "Entrada Financeira" por pedido.
  // Pagina por causa do hard-cap de 1000 linhas do Supabase.
  type VendaRow = {
    unit_id: string
    data_fato_gerador: string | null
    valor: number | string
    pedido_associado_ifood: string | null
  }
  const vendas = await fetchAllPages<VendaRow>((from, to) =>
    admin
      .from("ifood_financeiro_lancamentos")
      .select("unit_id, data_fato_gerador, valor, pedido_associado_ifood")
      .in("unit_id", unitIds)
      .eq("ref_year", year)
      .eq("ref_month", month)
      .eq("fato_gerador", "Venda")
      .eq("descricao_lancamento", "Entrada Financeira")
      .order("id")
      .range(from, to),
  )

  // Set de pedidos por (unit,dia) pra contar únicos
  const pedidoSet = new Map<string, Set<string>>()
  for (const r of vendas) {
    if (!r.data_fato_gerador) continue
    const day = dateStrDay(String(r.data_fato_gerador))
    if (!day) continue
    add(b.faturamento, r.unit_id, day, Number(r.valor) || 0)
    if (r.pedido_associado_ifood) {
      const key = `${r.unit_id}|${day}`
      const set = pedidoSet.get(key) ?? new Set<string>()
      set.add(String(r.pedido_associado_ifood))
      pedidoSet.set(key, set)
    }
  }
  for (const [key, set] of pedidoSet) {
    const [unitId, dayStr] = key.split("|")
    add(b.pedidos, unitId, parseInt(dayStr, 10), set.size)
  }

  // Cancelamentos — pedidos únicos de Cancelamento Total/Parcial
  type CancelRow = {
    unit_id: string
    data_fato_gerador: string | null
    pedido_associado_ifood: string | null
  }
  const cancels = await fetchAllPages<CancelRow>((from, to) =>
    admin
      .from("ifood_financeiro_lancamentos")
      .select("unit_id, data_fato_gerador, pedido_associado_ifood")
      .in("unit_id", unitIds)
      .eq("ref_year", year)
      .eq("ref_month", month)
      .in("fato_gerador", ["Cancelamento Total", "Cancelamento Parcial"])
      .order("id")
      .range(from, to),
  )

  const cancelSet = new Map<string, Set<string>>()
  for (const r of cancels) {
    if (!r.data_fato_gerador || !r.pedido_associado_ifood) continue
    const day = dateStrDay(String(r.data_fato_gerador))
    if (!day) continue
    const key = `${r.unit_id}|${day}`
    const set = cancelSet.get(key) ?? new Set<string>()
    set.add(String(r.pedido_associado_ifood))
    cancelSet.set(key, set)
  }
  for (const [key, set] of cancelSet) {
    const [unitId, dayStr] = key.split("|")
    add(b.cancelamentos, unitId, parseInt(dayStr, 10), set.size)
  }

  return b
}

/** 99 Food: agrega da tabela diária já consolidada */
async function loadNinefood(
  unitIds: string[],
  year: number,
  month: number,
): Promise<Buckets> {
  const b = emptyBuckets()
  if (unitIds.length === 0) return b
  const admin = createAdminClient()

  type LojaRow = {
    unit_id: string
    data: string
    bruto: number | string
    pedidos: number | null
    cancelamentos_qtd: number | null
  }
  const data = await fetchAllPages<LojaRow>((from, to) =>
    admin
      .from("ninefood_daily_loja")
      .select("unit_id, data, bruto, pedidos, cancelamentos_qtd")
      .in("unit_id", unitIds)
      .eq("ref_year", year)
      .eq("ref_month", month)
      .order("id")
      .range(from, to),
  )

  for (const r of data) {
    const day = dateStrDay(String(r.data))
    if (!day) continue
    add(b.faturamento, r.unit_id, day, Number(r.bruto) || 0)
    add(b.pedidos, r.unit_id, day, r.pedidos || 0)
    add(b.cancelamentos, r.unit_id, day, r.cancelamentos_qtd || 0)
  }
  return b
}

/** Keeta: agrega da Loja diária já consolidada (keeta_daily_loja). */
async function loadKeeta(
  unitIds: string[],
  year: number,
  month: number,
): Promise<Buckets> {
  const b = emptyBuckets()
  if (unitIds.length === 0) return b
  const admin = createAdminClient()

  type LojaRow = {
    unit_id: string
    data: string
    vendas_itens: number | string
    total_pedidos: number | null
    pedidos_cancelados: number | null
  }
  const data = await fetchAllPages<LojaRow>((from, to) =>
    admin
      .from("keeta_daily_loja")
      .select("unit_id, data, vendas_itens, total_pedidos, pedidos_cancelados")
      .in("unit_id", unitIds)
      .eq("ref_year", year)
      .eq("ref_month", month)
      .order("id")
      .range(from, to),
  )

  for (const r of data) {
    const day = dateStrDay(String(r.data))
    if (!day) continue
    add(b.faturamento, r.unit_id, day, Number(r.vendas_itens) || 0)
    add(b.pedidos, r.unit_id, day, r.total_pedidos || 0)
    add(b.cancelamentos, r.unit_id, day, r.pedidos_cancelados || 0)
  }
  return b
}

function mergeBuckets(...all: Buckets[]): Buckets {
  const out = emptyBuckets()
  for (const metric of ["faturamento", "pedidos", "cancelamentos"] as const) {
    for (const bk of all) {
      for (const [unitId, byDay] of bk[metric]) {
        for (const [dayStr, val] of Object.entries(byDay)) {
          add(out[metric], unitId, parseInt(dayStr, 10), val)
        }
      }
    }
  }
  return out
}

/**
 * Monta a matriz do relatório diário.
 *
 * @param units lista de unidades (code, name, id) já filtrada/ativa
 */
export async function getDailyReportMatrix(
  year: number,
  month: number,
  platform: ReportPlatform,
  units: Array<{ id: string; code: string; name: string }>,
): Promise<DailyReportMatrix> {
  const daysInMonth = new Date(year, month, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const unitIds = units.map((u) => u.id)

  let buckets: Buckets
  if (platform === "ifood") {
    buckets = await loadIfood(unitIds, year, month)
  } else if (platform === "99food") {
    buckets = await loadNinefood(unitIds, year, month)
  } else if (platform === "keeta") {
    buckets = await loadKeeta(unitIds, year, month)
  } else {
    const [a, b, c] = await Promise.all([
      loadIfood(unitIds, year, month),
      loadNinefood(unitIds, year, month),
      loadKeeta(unitIds, year, month),
    ])
    buckets = mergeBuckets(a, b, c)
  }

  const networkByDay = {
    faturamento: {} as Record<number, number>,
    pedidos: {} as Record<number, number>,
    cancelamentos: {} as Record<number, number>,
  }
  let totalFaturamento = 0
  let totalPedidos = 0
  let totalCancelamentos = 0

  const unitRows: UnitDailyRow[] = units.map((u) => {
    const fat = buckets.faturamento.get(u.id) ?? {}
    const ped = buckets.pedidos.get(u.id) ?? {}
    const can = buckets.cancelamentos.get(u.id) ?? {}

    let tf = 0
    let tp = 0
    let tc = 0
    for (const d of days) {
      if (fat[d]) {
        tf += fat[d]
        networkByDay.faturamento[d] = (networkByDay.faturamento[d] ?? 0) + fat[d]
      }
      if (ped[d]) {
        tp += ped[d]
        networkByDay.pedidos[d] = (networkByDay.pedidos[d] ?? 0) + ped[d]
      }
      if (can[d]) {
        tc += can[d]
        networkByDay.cancelamentos[d] =
          (networkByDay.cancelamentos[d] ?? 0) + can[d]
      }
    }
    totalFaturamento += tf
    totalPedidos += tp
    totalCancelamentos += tc

    return {
      unitId: u.id,
      code: u.code,
      name: u.name,
      faturamento: fat,
      pedidos: ped,
      cancelamentos: can,
      totalFaturamento: tf,
      totalPedidos: tp,
      totalCancelamentos: tc,
    }
  })

  // Ordena por faturamento desc (loja que mais vende primeiro)
  unitRows.sort((a, b) => b.totalFaturamento - a.totalFaturamento)

  return {
    days,
    units: unitRows,
    networkByDay,
    totalFaturamento,
    totalPedidos,
    totalCancelamentos,
    hasData: totalFaturamento > 0 || totalPedidos > 0,
  }
}
