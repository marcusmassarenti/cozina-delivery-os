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

import { unstable_cache } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  CANAIS_PROPRIOS,
  installIdsDeProducao,
} from "@/lib/data/cardapioweb-imported"
import { getNinefoodApiBillDiarioByUnits } from "@/lib/data/ninefood-imported"
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
  if (filterUnitIds) qi = qi.in("unit_id", filterUnitIds)

  // O relatório de PEDIDOS do iFood (ifood_pedidos) também é dado importado e
  // já traz bruto+líquido. Sem isto, quem sobe só o Pedidos (sem a Conciliação)
  // via "nenhum dado importado" — falso alarme.
  let qiPed = admin
    .from("ifood_pedidos")
    .select("data")
    .eq("ref_year", year)
    .eq("ref_month", month)
    .order("data", { ascending: false })
    .limit(1)
  if (filterUnitIds) qiPed = qiPed.in("unit_id", filterUnitIds)

  let qn = admin
    .from("ninefood_daily_loja")
    .select("data")
    .eq("ref_year", year)
    .eq("ref_month", month)
    .order("data", { ascending: false })
    .limit(1)
  if (filterUnitIds) qn = qn.in("unit_id", filterUnitIds)

  let qk = admin
    .from("keeta_daily_loja")
    .select("data")
    .eq("ref_year", year)
    .eq("ref_month", month)
    .order("data", { ascending: false })
    .limit(1)
  if (filterUnitIds) qk = qk.in("unit_id", filterUnitIds)

  const [{ data: di }, { data: diPed }, { data: dn }, { data: dk }] =
    await Promise.all([qi, qiPed, qn, qk])

  // iFood: mais recente entre a Conciliação e o relatório de Pedidos.
  const ifoodLatest =
    [
      di?.[0]?.data_fato_gerador as string | undefined,
      diPed?.[0]?.data as string | undefined,
    ]
      .filter((d): d is string => !!d)
      .sort()
      .pop() ?? null

  // 99 Food também vem pela API (ninefood_api_bill). Considera a última
  // business_date com financeiro no mês e usa a MAIS RECENTE entre import e API.
  const mm = String(month).padStart(2, "0")
  const lastDay = new Date(year, month, 0).getDate()
  let qnApi = admin
    .from("ninefood_api_bill")
    .select("business_date")
    .gte("business_date", `${year}-${mm}-01`)
    .lte("business_date", `${year}-${mm}-${String(lastDay).padStart(2, "0")}`)
    .order("business_date", { ascending: false })
    .limit(1)
  if (filterUnitIds) {
    const { data: links } = await admin
      .from("ninefood_store_links")
      .select("app_shop_id")
      .in("unit_id", filterUnitIds)
    const shops = (links ?? []).map(
      (r) => (r as { app_shop_id: string }).app_shop_id,
    )
    qnApi = qnApi.in("app_shop_id", shops.length ? shops : ["__none__"])
  }
  const { data: dnApi } = await qnApi

  const ninefoodLatest =
    [
      dn?.[0]?.data as string | undefined,
      dnApi?.[0]?.business_date as string | undefined,
    ]
      .filter((d): d is string => !!d)
      .sort()
      .pop() ?? null

  return {
    ifood: parseDay(ifoodLatest),
    ninefood: parseDay(ninefoodLatest),
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
  dateRange?: { start: string; end: string },
): Promise<Buckets> {
  const b = emptyBuckets()
  if (unitIds.length === 0) return b
  // Range custom: RPC só agrega por mês inteiro, então sempre cai no
  // paginated quando há filtro de dia.
  if (dateRange) return loadIfoodPaginated(unitIds, year, month, dateRange)
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
  dateRange?: { start: string; end: string },
): Promise<Buckets> {
  const b = emptyBuckets()
  if (unitIds.length === 0) return b
  const admin = createAdminClient()

  // Vendas (bruto + pedidos únicos) — 1 linha "Entrada Financeira" por pedido.
  // Pagina por causa do hard-cap de 1000 linhas do Supabase.
  // Bruto = valor_cesta_final (GMV/cesta), MESMA definição do DRE e do Portal.
  // O campo `valor` da Entrada Financeira já vem líquido das promoções custeadas
  // pela loja, então subestimaria o faturamento (ex.: Itaim −24%). Fallback pro
  // `valor` só se a cesta não tiver sido importada naquela linha.
  type VendaRow = {
    unit_id: string
    data_fato_gerador: string | null
    valor: number | string
    valor_cesta_final: number | string | null
    pedido_associado_ifood: string | null
  }
  const vendas = await fetchAllPages<VendaRow>((from, to) => {
    let q = admin
      .from("ifood_financeiro_lancamentos")
      .select(
        "unit_id, data_fato_gerador, valor, valor_cesta_final, pedido_associado_ifood",
      )
      .in("unit_id", unitIds)
      .eq("ref_year", year)
      .eq("ref_month", month)
      .eq("fato_gerador", "Venda")
      .eq("descricao_lancamento", "Entrada Financeira")
    if (dateRange) {
      q = q
        .gte("data_fato_gerador", dateRange.start)
        .lte("data_fato_gerador", `${dateRange.end}T23:59:59`)
    }
    return q.order("id").range(from, to)
  })

  // Set de pedidos por (unit,dia) pra contar únicos
  const pedidoSet = new Map<string, Set<string>>()
  for (const r of vendas) {
    if (!r.data_fato_gerador) continue
    const day = dateStrDay(String(r.data_fato_gerador))
    if (!day) continue
    add(
      b.faturamento,
      r.unit_id,
      day,
      Number(r.valor_cesta_final ?? r.valor) || 0,
    )
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
  const cancels = await fetchAllPages<CancelRow>((from, to) => {
    let q = admin
      .from("ifood_financeiro_lancamentos")
      .select("unit_id, data_fato_gerador, pedido_associado_ifood")
      .in("unit_id", unitIds)
      .eq("ref_year", year)
      .eq("ref_month", month)
      .in("fato_gerador", ["Cancelamento Total", "Cancelamento Parcial"])
    if (dateRange) {
      q = q
        .gte("data_fato_gerador", dateRange.start)
        .lte("data_fato_gerador", `${dateRange.end}T23:59:59`)
    }
    return q.order("id").range(from, to)
  })

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
  dateRange?: { start: string; end: string },
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
  const data = await fetchAllPages<LojaRow>((from, to) => {
    let q = admin
      .from("ninefood_daily_loja")
      .select("unit_id, data, bruto, pedidos, cancelamentos_qtd")
      .in("unit_id", unitIds)
      .eq("ref_year", year)
      .eq("ref_month", month)
    if (dateRange) {
      q = q.gte("data", dateRange.start).lte("data", dateRange.end)
    }
    return q.order("id").range(from, to)
  })

  const comXlsx = new Set<string>()
  for (const r of data) {
    const day = dateStrDay(String(r.data))
    if (!day) continue
    comXlsx.add(r.unit_id)
    add(b.faturamento, r.unit_id, day, Number(r.bruto) || 0)
    add(b.pedidos, r.unit_id, day, r.pedidos || 0)
    add(b.cancelamentos, r.unit_id, day, r.cancelamentos_qtd || 0)
  }

  // Fallback: loja SEM o XLSX diário mas COM o financeiro da API da 99. Sem
  // isto a tela mostrava zero de 99Food nessas lojas, enquanto o dashboard, o
  // DRE e o Nino mostravam a receita real — na Santana, R$ 16 mil escondidos
  // em julho/26. O XLSX, quando existe, continua com prioridade (é mais rico).
  const semXlsx = unitIds.filter((id) => !comXlsx.has(id))
  if (semXlsx.length > 0) {
    const viaApi = await getNinefoodApiBillDiarioByUnits(
      semXlsx,
      year,
      month,
      dateRange,
    )
    for (const [unitId, porDia] of viaApi) {
      for (const [dia, v] of porDia) {
        add(b.faturamento, unitId, dia, v.bruto)
        add(b.pedidos, unitId, dia, v.pedidos)
      }
    }
  }
  return b
}

/** Keeta: agrega da Loja diária já consolidada (keeta_daily_loja). */
async function loadKeeta(
  unitIds: string[],
  year: number,
  month: number,
  dateRange?: { start: string; end: string },
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
  const data = await fetchAllPages<LojaRow>((from, to) => {
    let q = admin
      .from("keeta_daily_loja")
      .select("unit_id, data, vendas_itens, total_pedidos, pedidos_cancelados")
      .in("unit_id", unitIds)
      .eq("ref_year", year)
      .eq("ref_month", month)
    if (dateRange) {
      q = q.gte("data", dateRange.start).lte("data", dateRange.end)
    }
    return q.order("id").range(from, to)
  })

  for (const r of data) {
    const day = dateStrDay(String(r.data))
    if (!day) continue
    add(b.faturamento, r.unit_id, day, Number(r.vendas_itens) || 0)
    add(b.pedidos, r.unit_id, day, r.total_pedidos || 0)
    add(b.cancelamentos, r.unit_id, day, r.pedidos_cancelados || 0)
  }
  return b
}

/**
 * Cardápio Web: agrega os pedidos crus (não há tabela diária consolidada).
 *
 * Duas diferenças em relação aos outros loaders, ambas deliberadas:
 *
 * 1. FUSO. `criado_em` é o instante real da venda, não a meia-noite-UTC que o
 *    iFood usa pra representar um dia-calendário. Um pedido das 22h em
 *    Brasília é T01:00Z do dia SEGUINTE — usar `dateStrDay` aqui jogaria todo
 *    o pico da noite pro dia errado. Por isso converte pra America/Sao_Paulo.
 *
 * 2. CANAL. Só venda direta. O Cardápio Web também recebe pedido de
 *    marketplace (sales_channel = "ifood"), e esse pedido já é contado pela
 *    integração do próprio marketplace.
 */
async function loadCardapioWeb(
  unitIds: string[],
  year: number,
  month: number,
  dateRange?: { start: string; end: string },
): Promise<Buckets> {
  const b = emptyBuckets()
  if (unitIds.length === 0) return b
  const admin = createAdminClient()

  // Só produção — sandbox não entra em número consolidado.
  const installs = await installIdsDeProducao()
  if (installs.length === 0) return b

  type PedRow = {
    unit_id: string | null
    criado_em: string | null
    status: string | null
    total: number | string | null
  }
  const data = await fetchAllPages<PedRow>((from, to) => {
    let q = admin
      .from("cardapioweb_pedidos")
      .select("unit_id, criado_em, status, total")
      .in("unit_id", unitIds)
      .in("sales_channel", CANAIS_PROPRIOS)
      .in("install_id", installs)
      .eq("ref_year", year)
      .eq("ref_month", month)
    if (dateRange) {
      q = q
        .gte("criado_em", `${dateRange.start}T00:00:00-03:00`)
        .lte("criado_em", `${dateRange.end}T23:59:59.999-03:00`)
    }
    return q.order("id").range(from, to)
  })

  for (const r of data) {
    if (!r.unit_id || !r.criado_em) continue
    const day = diaEmBrasilia(r.criado_em)
    if (!day) continue
    const cancelado = (r.status ?? "").toLowerCase().startsWith("cancel")
    add(b.faturamento, r.unit_id, day, Number(r.total) || 0)
    add(b.pedidos, r.unit_id, day, 1)
    if (cancelado) add(b.cancelamentos, r.unit_id, day, 1)
  }
  return b
}

/** Dia do mês em America/Sao_Paulo a partir de um timestamp com fuso. */
function diaEmBrasilia(ts: string): number | null {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return null
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
  }).format(d)
  const n = parseInt(partes, 10)
  return Number.isNaN(n) ? null : n
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
async function getDailyReportMatrixUncached(
  year: number,
  month: number,
  platform: ReportPlatform,
  units: Array<{ id: string; code: string; name: string }>,
  dateRange?: { start: string; end: string },
): Promise<DailyReportMatrix> {
  const daysInMonth = new Date(year, month, 0).getDate()
  // dateRange MONO-MÊS: lista de dias só do range. Cross-month ignorado
  // por aqui (a matriz usa dia-do-mês 1..31 como chave, conflitaria) —
  // o caller deve passar mono-mês ou clampar.
  const days =
    dateRange &&
    dateRange.start.slice(0, 7) === dateRange.end.slice(0, 7) &&
    Number(dateRange.start.slice(0, 4)) === year &&
    Number(dateRange.start.slice(5, 7)) === month
      ? Array.from(
          {
            length:
              Number(dateRange.end.slice(8, 10)) -
              Number(dateRange.start.slice(8, 10)) +
              1,
          },
          (_, i) => i + Number(dateRange.start.slice(8, 10)),
        )
      : Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const unitIds = units.map((u) => u.id)

  let buckets: Buckets
  if (platform === "ifood") {
    buckets = await loadIfood(unitIds, year, month, dateRange)
  } else if (platform === "99food") {
    buckets = await loadNinefood(unitIds, year, month, dateRange)
  } else if (platform === "keeta") {
    buckets = await loadKeeta(unitIds, year, month, dateRange)
  } else if (platform === "cardapioweb") {
    buckets = await loadCardapioWeb(unitIds, year, month, dateRange)
  } else {
    // "todas" — o ramo final é EXPLÍCITO de propósito. Quando era só `else`,
    // uma plataforma nova caía aqui em silêncio e recebia a soma de todas as
    // outras: foi assim que o Ranking passou a mostrar o dobro do faturamento.
    const [a, b, c, d] = await Promise.all([
      loadIfood(unitIds, year, month, dateRange),
      loadNinefood(unitIds, year, month, dateRange),
      loadKeeta(unitIds, year, month, dateRange),
      loadCardapioWeb(unitIds, year, month, dateRange),
    ])
    buckets = mergeBuckets(a, b, c, d)
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

/**
 * Versão cacheada (TTL 60s + tag "reports"). O retorno é serializável, então
 * o cache do Next preserva a matriz inteira. Invalida na hora no import.
 */
export const getDailyReportMatrix = unstable_cache(
  getDailyReportMatrixUncached,
  // v3: o bruto do iFood passou a deduplicar por pedido (migration 0112) e o
  // 99Food ganhou o fallback da API. Subir a versão descarta o cache antigo,
  // senão a tela serviria os números velhos por até 60s depois do deploy.
  ["daily-report-matrix-v4"],
  { revalidate: 60, tags: ["reports"] },
)
