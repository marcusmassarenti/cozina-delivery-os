/**
 * Queries em cima dos dados importados do iFood (tabelas 0007).
 *
 * Convenção:
 * - "Month" = (ref_year, ref_month) — usado pelo Financeiro
 * - Pra Cardápio (que é diário), agregamos por date BETWEEN
 *   o 1º e o último dia do mês.
 */

import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { currentPeriod } from "@/lib/period"
import { fetchAllRows } from "@/lib/data/paginate"
import { monthOperationWindow } from "@/lib/data/operation-window"

// ─── Tipos ───────────────────────────────────────────────────────────

export type FunnelTotals = {
  visitas: number
  visualizacoes: number
  sacola: number
  revisao: number
  concluidos: number
  conversaoPct: number
  /** Quantos dias têm dado importado (denominador honesto) */
  diasComDado: number
}

export type FunnelDailyPoint = {
  date: string // YYYY-MM-DD
  visitas: number
  visualizacoes: number
  sacola: number
  concluidos: number
  conversaoPct: number
}

export type ItemRanking = {
  nomeItem: string
  categoria: string | null
  qtdVendida: number
  pedidos: number
  visitas: number
  valorTotal: number
  conversaoPctMedia: number
  qtdComPromocao: number
}

export type ComplementoRanking = {
  nomeComplemento: string
  classificacao: string | null
  pedidos: number
  qtdVendida: number
  valorTotal: number
}

export type FinanceiroResumo = {
  pedidosUnicos: number
  bruto: number
  comissaoIfood: number
  taxaEntrega: number
  taxaTransacao: number
  taxaServicoCliente: number
  promocaoLoja: number
  promocaoIfood: number
  pacoteAnuncios: number
  ressarcimentos: number
  cancelamentoTotalQtd: number
  cancelamentoParcialQtd: number
  perdaCancelamento: number
  liquido: number
  /** True se há lançamentos importados pra esse período */
  hasData: boolean
}

export type CancelamentoMotivo = {
  motivo: string
  pedidos: number
  perdaFinanceira: number
}

export type PedidoResumo = {
  pedidoIfood: string
  pedidoCurto: string | null
  dataCriacao: string | null
  valorTransacao: number | null
  bruto: number
  liquido: number
  comissao: number
  taxaEntrega: number
  promocaoLoja: number
  cancelado: boolean
  motivoCancelamento: string | null
}

export type NetworkFunnel = {
  totals: FunnelTotals
  topUnits: Array<{
    unitId: string
    code: string
    name: string
    visitas: number
    concluidos: number
    conversaoPct: number
  }>
}

// ─── Helpers ─────────────────────────────────────────────────────────

function monthRange(year: number, month: number) {
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0) // último dia
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`
  return { start: fmt(startDate), end: fmt(endDate) }
}

// ─── Cobertura: o que cada loja tem importado em cada mês ────────────

export type CoverageStatus = "complete" | "partial" | "empty"

export type CoverageCell = {
  cardapio: {
    status: CoverageStatus
    dailyDays: number // dias com Cardápio diário
    hasPeriodo: boolean // tem snapshot do período cobrindo o mês?
  }
  financeiro: {
    status: CoverageStatus
    diasComVenda: number // dias distintos com lançamento de Venda
    firstData: string | null // primeira data com Venda (YYYY-MM-DD)
    lastData: string | null // última data com Venda
    diasNoMes: number // qtd total de dias no mês (28-31)
  }
  avaliacoes: {
    status: CoverageStatus
    count: number
  }
  pedidos: {
    // "Relatório de pedidos" do iFood (forma de pagamento / VR por bandeira)
    status: CoverageStatus
    imported: boolean
  }
  /** A loja operou nesse mês? false = N/A (antes de inaugurar / após fechar). */
  applicable: boolean
}

export type CoverageMatrix = {
  months: Array<{ year: number; month: number; key: string; label: string }>
  units: Array<{
    id: string
    code: string
    name: string
    active: boolean
    cells: Record<string, CoverageCell> // key = "YYYY-MM"
  }>
}

/** Threshold mínimo pra considerar Financeiro/Cardápio COMPLETO no mês.
 *  iFood costuma fechar últimos 7-14 dias só no relatório seguinte.
 *  Pra mês corrente, qualquer dado é considerado completo (não há como
 *  saber se está parcial — depende de quando você baixou). */
const COMPLETE_MIN_DAYS_RATIO = 0.6 // 60% dos dias do mês

/**
 * Pra cada loja ativa × mês entre [start, end], diz quais relatórios
 * estão importados. Usado pra ver lacunas e saber o que falta puxar.
 */
export async function getCoverageMatrix(
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number,
): Promise<CoverageMatrix> {
  const admin = createAdminClient()

  // Gera lista de meses no range
  const months: CoverageMatrix["months"] = []
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

  // Início do range pra queries com data
  const rangeStart = `${startYear}-${String(startMonth).padStart(2, "0")}-01`
  // Fim: último dia do endMonth
  const endLastDay = new Date(endYear, endMonth, 0).getDate()
  const rangeEnd = `${endYear}-${String(endMonth).padStart(2, "0")}-${String(endLastDay).padStart(2, "0")}`

  // Busca todas as unidades (ativas e inativas)
  const { data: unitsRows } = await admin
    .from("units")
    .select("id, code, name, active, data_inauguracao, data_encerramento")
    .order("code")
  const units = unitsRows ?? []
  const unitIds = units.map((u) => u.id)

  // Lojas vinculadas ao iFood + inauguração/encerramento por plataforma.
  // Quem não está vinculado vira N/A nessa aba. A data da plataforma manda;
  // se null, cai na data da unidade (0023).
  const { data: platRows } = await admin
    .from("unit_platforms")
    .select("unit_id, data_inauguracao, data_encerramento")
    .eq("platform", "ifood")
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

  // Helpers
  const yKey = (year: number, month: number) =>
    `${year}-${String(month).padStart(2, "0")}`
  const dateToKey = (d: string) => {
    // d = 'YYYY-MM-DD'
    return d.slice(0, 7)
  }

  // 1) Cardápio DIÁRIO — agrupa por (unit, year-month)
  const dailyByUnitMonth = new Map<string, Map<string, number>>()
  if (unitIds.length > 0) {
    const dailyRows = await fetchAllRows<{ unit_id: string; date: string }>(
      (from, to) =>
        admin
          .from("ifood_daily_funnel")
          .select("unit_id, date")
          .in("unit_id", unitIds)
          .gte("date", rangeStart)
          .lte("date", rangeEnd)
          .order("date")
          .order("unit_id")
          .range(from, to),
      "ifood_daily_funnel cobertura",
    )
    for (const r of dailyRows) {
      const inner = dailyByUnitMonth.get(r.unit_id) ?? new Map<string, number>()
      const k = dateToKey(r.date)
      inner.set(k, (inner.get(k) ?? 0) + 1)
      dailyByUnitMonth.set(r.unit_id, inner)
    }
  }

  // 2) Cardápio PERÍODO — pega snapshots cujo período_end cai em algum mês do range
  const periodoByUnitMonth = new Map<string, Set<string>>()
  if (unitIds.length > 0) {
    const periodoRows = await fetchAllRows<{
      unit_id: string
      period_end: string
    }>(
      (from, to) =>
        admin
          .from("ifood_cardapio_periodo")
          .select("unit_id, period_end")
          .in("unit_id", unitIds)
          .gte("period_end", rangeStart)
          .lte("period_end", rangeEnd)
          .order("id")
          .range(from, to),
      "ifood_cardapio_periodo cobertura",
    )
    for (const r of periodoRows) {
      const inner = periodoByUnitMonth.get(r.unit_id) ?? new Set<string>()
      inner.add(dateToKey(r.period_end))
      periodoByUnitMonth.set(r.unit_id, inner)
    }
  }

  // 3) Financeiro — usa RPC pra obter dias-com-Venda + primeira/última data
  type FinCobRow = {
    unit_id: string
    ref_year: number
    ref_month: number
    dias_com_venda: number
    first_data: string | null
    last_data: string | null
    total_lancamentos: number
  }
  const financeiroByUnitMonth = new Map<string, Map<string, FinCobRow>>()
  if (unitIds.length > 0) {
    const { data: finRows, error: finErr } = await admin.rpc(
      "ifood_financeiro_cobertura",
      {
        p_start_year: startYear,
        p_start_month: startMonth,
        p_end_year: endYear,
        p_end_month: endMonth,
      },
    )
    if (finErr) console.error("Cobertura RPC error:", finErr.message)
    for (const r of (finRows ?? []) as FinCobRow[]) {
      const k = yKey(r.ref_year, r.ref_month)
      const inner =
        financeiroByUnitMonth.get(r.unit_id) ?? new Map<string, FinCobRow>()
      inner.set(k, r)
      financeiroByUnitMonth.set(r.unit_id, inner)
    }
  }

  // 4) Avaliações — count por (unit, year-month da data_avaliacao)
  const avaliacoesByUnitMonth = new Map<string, Map<string, number>>()
  if (unitIds.length > 0) {
    const avalRows = await fetchAllRows<{
      unit_id: string
      data_avaliacao: string
    }>(
      (from, to) =>
        admin
          .from("ifood_avaliacoes")
          .select("unit_id, data_avaliacao")
          .in("unit_id", unitIds)
          .gte("data_avaliacao", rangeStart)
          .lte("data_avaliacao", rangeEnd)
          .order("id")
          .range(from, to),
      "ifood_avaliacoes cobertura",
    )
    for (const r of avalRows) {
      const inner =
        avaliacoesByUnitMonth.get(r.unit_id) ?? new Map<string, number>()
      const k = dateToKey(r.data_avaliacao)
      inner.set(k, (inner.get(k) ?? 0) + 1)
      avaliacoesByUnitMonth.set(r.unit_id, inner)
    }
  }

  // 5) Pedidos (VR/forma de pagamento) — presença por (unit, mês) a partir
  // do log de importação (platform_imports), que é leve e já traz ref_year/
  // ref_month. O relatório é mensal: presença = importado.
  const pedidosByUnitMonth = new Map<string, Set<string>>()
  if (unitIds.length > 0) {
    const pedRows = await fetchAllRows<{
      unit_id: string
      ref_year: number | null
      ref_month: number | null
    }>(
      (from, to) =>
        admin
          .from("platform_imports")
          .select("unit_id, ref_year, ref_month")
          .eq("platform", "ifood")
          .eq("report_type", "pedidos")
          .eq("status", "success")
          .in("unit_id", unitIds)
          .not("ref_year", "is", null)
          .order("id")
          .range(from, to),
      "platform_imports pedidos cobertura",
    )
    for (const r of pedRows) {
      if (r.ref_year == null || r.ref_month == null) continue
      const k = yKey(r.ref_year, r.ref_month)
      const set = pedidosByUnitMonth.get(r.unit_id) ?? new Set<string>()
      set.add(k)
      pedidosByUnitMonth.set(r.unit_id, set)
    }
  }

  // Mês corrente — pra ele, qualquer dado já é "completo" (não dá pra
  // exigir mais até o mês acabar)
  const todayLocal = new Date()
  const currentYear = todayLocal.getFullYear()
  const currentMonth = todayLocal.getMonth() + 1

  // Monta a matriz com status calculado por célula
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
      const cells: Record<string, CoverageCell> = {}
      for (const month of months) {
        const win = monthOperationWindow(month.year, month.month, op)
        // "Dias esperados" = dias em que a loja operou na janela (não 30/31).
        const diasNoMes = win.operatingDays
        const isCurrentMonth =
          month.year === currentYear && month.month === currentMonth
        // Pra mês corrente: qualquer dado conta como completo (1 dia basta).
        // Pra meses passados: precisa de 60%+ dos dias de operação.
        const minComplete = isCurrentMonth
          ? 1
          : Math.max(1, Math.ceil(diasNoMes * COMPLETE_MIN_DAYS_RATIO))

        // Cardápio
        const dailyDays = dailyByUnitMonth.get(u.id)?.get(month.key) ?? 0
        const hasPeriodo =
          periodoByUnitMonth.get(u.id)?.has(month.key) ?? false
        const cardapioStatus: CoverageStatus = hasPeriodo
          ? "complete"
          : dailyDays >= minComplete
            ? "complete"
            : dailyDays > 0
              ? "partial"
              : "empty"

        // Financeiro
        const finRow = financeiroByUnitMonth.get(u.id)?.get(month.key)
        const diasComVenda = finRow?.dias_com_venda ?? 0
        const financeiroStatus: CoverageStatus =
          diasComVenda >= minComplete
            ? "complete"
            : diasComVenda > 0
              ? "partial"
              : "empty"

        // Avaliações
        const avalCount =
          avaliacoesByUnitMonth.get(u.id)?.get(month.key) ?? 0
        // Pra Avaliações não dá pra inferir "completo" só por contagem —
        // só sabemos se tem algo ou não. Usamos complete se houver.
        const avaliacoesStatus: CoverageStatus =
          avalCount > 0 ? "complete" : "empty"

        cells[month.key] = {
          cardapio: {
            status: cardapioStatus,
            dailyDays,
            hasPeriodo,
          },
          financeiro: {
            status: financeiroStatus,
            diasComVenda,
            firstData: finRow?.first_data ?? null,
            lastData: finRow?.last_data ?? null,
            diasNoMes,
          },
          avaliacoes: {
            status: avaliacoesStatus,
            count: avalCount,
          },
          pedidos: {
            status: (pedidosByUnitMonth.get(u.id)?.has(month.key)
              ? "complete"
              : "empty") as CoverageStatus,
            imported: pedidosByUnitMonth.get(u.id)?.has(month.key) ?? false,
          },
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

// ─── Meses disponíveis pro seletor de período ────────────────────────

export type AvailablePeriod = {
  year: number
  month: number
  hasFinanceiro: boolean
  hasCardapio: boolean
  hasAvaliacoes: boolean
}

/**
 * Lista os meses que têm pelo menos 1 importação no banco. Usado pra
 * popular o dropdown de seletor de período. Sempre inclui o mês corrente
 * (mesmo sem dados) pra UX consistente.
 */
export async function getAvailablePeriods(): Promise<AvailablePeriod[]> {
  const admin = createAdminClient()
  const data = await fetchAllRows<{
    report_type: string
    ref_year: number | null
    ref_month: number | null
    ref_date: string | null
  }>(
    (from, to) =>
      admin
        .from("platform_imports")
        .select("report_type, ref_year, ref_month, ref_date")
        .order("id")
        .range(from, to),
    "platform_imports periodos",
  )

  const map = new Map<string, AvailablePeriod>()
  // Sempre inclui o mês corrente (mesmo sem dados). Fuso de Brasília (não o UTC
  // do servidor Vercel) pra casar com o PeriodSelector e não liberar/ocultar o
  // mês errado na virada (~21h BRT em diante).
  const { year: curYear, month: curMonth } = currentPeriod()
  const curKey = `${curYear}-${curMonth}`
  map.set(curKey, {
    year: curYear,
    month: curMonth,
    hasFinanceiro: false,
    hasCardapio: false,
    hasAvaliacoes: false,
  })

  for (const row of data) {
    let year: number
    let month: number
    if (row.ref_year && row.ref_month) {
      year = row.ref_year
      month = row.ref_month
    } else if (row.ref_date) {
      const d = new Date(row.ref_date)
      year = d.getFullYear()
      month = d.getMonth() + 1
    } else {
      continue
    }
    // Ignora período no futuro (não existe venda futura): blinda contra ref
    // bogus no log — ex.: data outlier que jogou o ref pra dezembro.
    if (year > curYear || (year === curYear && month > curMonth)) continue
    const key = `${year}-${month}`
    const cur = map.get(key) ?? {
      year,
      month,
      hasFinanceiro: false,
      hasCardapio: false,
      hasAvaliacoes: false,
    }
    if (row.report_type === "financeiro") cur.hasFinanceiro = true
    if (row.report_type === "cardapio") cur.hasCardapio = true
    if (row.report_type === "avaliacoes") cur.hasAvaliacoes = true
    map.set(key, cur)
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year
    return b.month - a.month
  })
}

// ─── Funil (Cardápio) ────────────────────────────────────────────────

export async function getFunnelForMonth(
  unitId: string,
  year: number,
  month: number,
): Promise<FunnelTotals> {
  const admin = createAdminClient()
  const { start, end } = monthRange(year, month)
  const { data } = await admin
    .from("ifood_daily_funnel")
    .select(
      "date, visitas, visualizacoes, sacola, revisao, concluidos",
    )
    .eq("unit_id", unitId)
    .gte("date", start)
    .lte("date", end)

  return aggregateFunnel(data ?? [])
}

export async function getFunnelDailyForMonth(
  unitId: string,
  year: number,
  month: number,
): Promise<FunnelDailyPoint[]> {
  const admin = createAdminClient()
  const { start, end } = monthRange(year, month)
  const { data } = await admin
    .from("ifood_daily_funnel")
    .select(
      "date, visitas, visualizacoes, sacola, concluidos, conversao_pct",
    )
    .eq("unit_id", unitId)
    .gte("date", start)
    .lte("date", end)
    .order("date")

  return (data ?? []).map((d) => ({
    date: d.date,
    visitas: d.visitas,
    visualizacoes: d.visualizacoes,
    sacola: d.sacola,
    concluidos: d.concluidos,
    conversaoPct: Number(d.conversao_pct ?? 0),
  }))
}

function aggregateFunnel(
  rows: Array<{
    date?: string
    visitas: number
    visualizacoes: number
    sacola: number
    revisao: number
    concluidos: number
  }>,
): FunnelTotals {
  const totals = rows.reduce(
    (a, r) => ({
      visitas: a.visitas + (r.visitas || 0),
      visualizacoes: a.visualizacoes + (r.visualizacoes || 0),
      sacola: a.sacola + (r.sacola || 0),
      revisao: a.revisao + (r.revisao || 0),
      concluidos: a.concluidos + (r.concluidos || 0),
    }),
    { visitas: 0, visualizacoes: 0, sacola: 0, revisao: 0, concluidos: 0 },
  )
  const conversaoPct =
    totals.visitas > 0 ? (totals.concluidos / totals.visitas) * 100 : 0
  return {
    ...totals,
    conversaoPct,
    diasComDado: rows.length,
  }
}

// ─── Snapshot Cardápio de período ────────────────────────────────────

export type CardapioPeriodoSnapshot = {
  periodLabel: string
  periodStart: string
  periodEnd: string
  visitas: number
  visualizacoes: number
  sacola: number
  revisao: number
  concluidos: number
  conversaoPct: number
  // Comparativo (período anterior do iFood)
  visitasAnterior: number | null
  concluidosAnterior: number | null
  conversaoPctAnterior: number | null
}

/**
 * Retorna o snapshot de Cardápio mais recente cuja janela termina dentro
 * do mês selecionado. Se o usuário escolheu Maio/2026, busca o
 * snapshot com period_end em maio (ex.: 28/04 → 27/05).
 */
export async function getCardapioPeriodoForMonth(
  unitId: string,
  year: number,
  month: number,
): Promise<CardapioPeriodoSnapshot | null> {
  const admin = createAdminClient()
  const { start, end } = monthRange(year, month)
  const { data } = await admin
    .from("ifood_cardapio_periodo")
    .select(
      "period_label, period_start, period_end, visitas, visualizacoes, sacola, revisao, concluidos, conversao_pct, visitas_anterior, concluidos_anterior, conversao_pct_anterior",
    )
    .eq("unit_id", unitId)
    .gte("period_end", start)
    .lte("period_end", end)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  return {
    periodLabel: data.period_label,
    periodStart: data.period_start,
    periodEnd: data.period_end,
    visitas: data.visitas,
    visualizacoes: data.visualizacoes,
    sacola: data.sacola,
    revisao: data.revisao,
    concluidos: data.concluidos,
    conversaoPct: Number(data.conversao_pct ?? 0),
    visitasAnterior: data.visitas_anterior,
    concluidosAnterior: data.concluidos_anterior,
    conversaoPctAnterior: data.conversao_pct_anterior
      ? Number(data.conversao_pct_anterior)
      : null,
  }
}

// ─── Top itens ───────────────────────────────────────────────────────

export async function getItemsRankingForMonth(
  unitId: string,
  year: number,
  month: number,
  limit = 10,
): Promise<ItemRanking[]> {
  const admin = createAdminClient()
  const { start, end } = monthRange(year, month)

  // 1ª tentativa: ITEMS do PERÍODO (XLSX agregado, mais confiável quando existe)
  const periodoItems = await fetchAllRows<{
    nome_item: string
    categoria: string | null
    visitas: number | null
    pedidos: number | null
    conversao_pct: number | string | null
    qtd_vendida: number | null
    qtd_com_promocao: number | null
    valor_total: number | string | null
  }>(
    (from, to) =>
      admin
        .from("ifood_cardapio_periodo_items")
        .select(
          "nome_item, categoria, visitas, pedidos, conversao_pct, qtd_vendida, qtd_com_promocao, valor_total",
        )
        .eq("unit_id", unitId)
        .gte("period_end", start)
        .lte("period_end", end)
        .order("id")
        .range(from, to),
    "ifood_cardapio_periodo_items unidade",
  )

  if (periodoItems && periodoItems.length > 0) {
    return periodoItems
      .map((r) => ({
        nomeItem: r.nome_item,
        categoria: r.categoria,
        qtdVendida: r.qtd_vendida || 0,
        pedidos: r.pedidos || 0,
        visitas: r.visitas || 0,
        valorTotal: Number(r.valor_total) || 0,
        conversaoPctMedia: Number(r.conversao_pct ?? 0),
        qtdComPromocao: r.qtd_com_promocao || 0,
      }))
      .sort((a, b) => b.valorTotal - a.valorTotal)
      .slice(0, limit)
  }

  // Fallback: agrega do DIÁRIO
  const data = await fetchAllRows<{
    nome_item: string
    categoria: string | null
    visitas: number | null
    pedidos: number | null
    conversao_pct: number | string | null
    qtd_vendida: number | null
    qtd_com_promocao: number | null
    valor_total: number | string | null
  }>(
    (from, to) =>
      admin
        .from("ifood_daily_items")
        .select(
          "nome_item, categoria, visitas, pedidos, conversao_pct, qtd_vendida, qtd_com_promocao, valor_total",
        )
        .eq("unit_id", unitId)
        .gte("date", start)
        .lte("date", end)
        .order("date")
        .order("unit_id")
        .range(from, to),
    "ifood_daily_items unidade",
  )

  // Agrega por nome_item
  const acc = new Map<string, ItemRanking & { _convSum: number; _convN: number }>()
  for (const r of data) {
    const cur = acc.get(r.nome_item) ?? {
      nomeItem: r.nome_item,
      categoria: r.categoria,
      qtdVendida: 0,
      pedidos: 0,
      visitas: 0,
      valorTotal: 0,
      conversaoPctMedia: 0,
      qtdComPromocao: 0,
      _convSum: 0,
      _convN: 0,
    }
    cur.qtdVendida += r.qtd_vendida || 0
    cur.pedidos += r.pedidos || 0
    cur.visitas += r.visitas || 0
    cur.valorTotal += Number(r.valor_total) || 0
    cur.qtdComPromocao += r.qtd_com_promocao || 0
    if (r.conversao_pct != null) {
      cur._convSum += Number(r.conversao_pct)
      cur._convN += 1
    }
    acc.set(r.nome_item, cur)
  }
  return Array.from(acc.values())
    .map(({ _convSum, _convN, ...rest }) => ({
      ...rest,
      conversaoPctMedia: _convN > 0 ? _convSum / _convN : 0,
    }))
    .sort((a, b) => b.valorTotal - a.valorTotal)
    .slice(0, limit)
}

// ─── Complementos ────────────────────────────────────────────────────

export async function getComplementosRankingForMonth(
  unitId: string,
  year: number,
  month: number,
  limit = 10,
): Promise<ComplementoRanking[]> {
  const admin = createAdminClient()
  const { start, end } = monthRange(year, month)

  // 1ª tentativa: COMPLEMENTOS do PERÍODO
  const periodoComps = await fetchAllRows<{
    nome_complemento: string
    classificacao: string | null
    pedidos: number | null
    qtd_vendida: number | null
    valor_total: number | string | null
  }>(
    (from, to) =>
      admin
        .from("ifood_cardapio_periodo_complementos")
        .select(
          "nome_complemento, classificacao, pedidos, qtd_vendida, valor_total",
        )
        .eq("unit_id", unitId)
        .gte("period_end", start)
        .lte("period_end", end)
        .order("id")
        .range(from, to),
    "ifood_cardapio_periodo_complementos unidade",
  )

  if (periodoComps && periodoComps.length > 0) {
    return periodoComps
      .map((r) => ({
        nomeComplemento: r.nome_complemento,
        classificacao: r.classificacao,
        pedidos: r.pedidos || 0,
        qtdVendida: r.qtd_vendida || 0,
        valorTotal: Number(r.valor_total) || 0,
      }))
      .sort((a, b) => b.pedidos - a.pedidos)
      .slice(0, limit)
  }

  // Fallback: DIÁRIO
  const data = await fetchAllRows<{
    nome_complemento: string
    classificacao: string | null
    pedidos: number | null
    qtd_vendida: number | null
    valor_total: number | string | null
  }>(
    (from, to) =>
      admin
        .from("ifood_daily_complementos")
        .select(
          "nome_complemento, classificacao, pedidos, qtd_vendida, valor_total",
        )
        .eq("unit_id", unitId)
        .gte("date", start)
        .lte("date", end)
        .order("id")
        .range(from, to),
    "ifood_daily_complementos unidade",
  )

  const acc = new Map<string, ComplementoRanking>()
  for (const r of data) {
    const cur = acc.get(r.nome_complemento) ?? {
      nomeComplemento: r.nome_complemento,
      classificacao: r.classificacao,
      pedidos: 0,
      qtdVendida: 0,
      valorTotal: 0,
    }
    cur.pedidos += r.pedidos || 0
    cur.qtdVendida += r.qtd_vendida || 0
    cur.valorTotal += Number(r.valor_total) || 0
    acc.set(r.nome_complemento, cur)
  }
  return Array.from(acc.values())
    .sort((a, b) => b.pedidos - a.pedidos)
    .slice(0, limit)
}

// ─── Top itens (rede) ────────────────────────────────────────────────

/**
 * Agrega os top itens vendidos somando todas as unidades (ou só as
 * filtradas). Prioriza dados do PERIODO (XLSX agregado) e cai pra agregado
 * do diário quando não tem.
 *
 * Retorna ranking por valor total vendido (faturamento bruto do produto).
 */
export async function getNetworkTopItemsForMonth(
  year: number,
  month: number,
  limit = 10,
  filterUnitIds?: string[],
): Promise<ItemRanking[]> {
  const admin = createAdminClient()
  const { start, end } = monthRange(year, month)

  // 1ª tentativa: ITEMS do PERÍODO da rede inteira
  const periodoItems = await fetchAllRows<{
    unit_id: string
    nome_item: string
    categoria: string | null
    visitas: number | null
    pedidos: number | null
    conversao_pct: number | string | null
    qtd_vendida: number | null
    qtd_com_promocao: number | null
    valor_total: number | string | null
  }>((from, to) => {
    let qPer = admin
      .from("ifood_cardapio_periodo_items")
      .select(
        "unit_id, nome_item, categoria, visitas, pedidos, conversao_pct, qtd_vendida, qtd_com_promocao, valor_total",
      )
      .gte("period_end", start)
      .lte("period_end", end)
      .order("id")
      .range(from, to)
    if (filterUnitIds)
      qPer = qPer.in("unit_id", filterUnitIds)
    return qPer
  }, "ifood_cardapio_periodo_items rede")

  if (periodoItems && periodoItems.length > 0) {
    const acc = new Map<
      string,
      ItemRanking & { _convSum: number; _convN: number }
    >()
    for (const r of periodoItems) {
      const cur = acc.get(r.nome_item) ?? {
        nomeItem: r.nome_item,
        categoria: r.categoria,
        qtdVendida: 0,
        pedidos: 0,
        visitas: 0,
        valorTotal: 0,
        conversaoPctMedia: 0,
        qtdComPromocao: 0,
        _convSum: 0,
        _convN: 0,
      }
      cur.qtdVendida += r.qtd_vendida || 0
      cur.pedidos += r.pedidos || 0
      cur.visitas += r.visitas || 0
      cur.valorTotal += Number(r.valor_total) || 0
      cur.qtdComPromocao += r.qtd_com_promocao || 0
      if (r.conversao_pct != null) {
        cur._convSum += Number(r.conversao_pct)
        cur._convN += 1
      }
      acc.set(r.nome_item, cur)
    }
    return Array.from(acc.values())
      .map(({ _convSum, _convN, ...rest }) => ({
        ...rest,
        conversaoPctMedia: _convN > 0 ? _convSum / _convN : 0,
      }))
      .sort((a, b) => b.valorTotal - a.valorTotal)
      .slice(0, limit)
  }

  // Fallback: agrega do DIÁRIO da rede inteira
  const data = await fetchAllRows<{
    nome_item: string
    categoria: string | null
    visitas: number | null
    pedidos: number | null
    conversao_pct: number | string | null
    qtd_vendida: number | null
    qtd_com_promocao: number | null
    valor_total: number | string | null
  }>((from, to) => {
    let qDay = admin
      .from("ifood_daily_items")
      .select(
        "nome_item, categoria, visitas, pedidos, conversao_pct, qtd_vendida, qtd_com_promocao, valor_total",
      )
      .gte("date", start)
      .lte("date", end)
      .order("date")
      .order("unit_id")
      .range(from, to)
    if (filterUnitIds)
      qDay = qDay.in("unit_id", filterUnitIds)
    return qDay
  }, "ifood_daily_items rede")

  const acc = new Map<
    string,
    ItemRanking & { _convSum: number; _convN: number }
  >()
  for (const r of data) {
    const cur = acc.get(r.nome_item) ?? {
      nomeItem: r.nome_item,
      categoria: r.categoria,
      qtdVendida: 0,
      pedidos: 0,
      visitas: 0,
      valorTotal: 0,
      conversaoPctMedia: 0,
      qtdComPromocao: 0,
      _convSum: 0,
      _convN: 0,
    }
    cur.qtdVendida += r.qtd_vendida || 0
    cur.pedidos += r.pedidos || 0
    cur.visitas += r.visitas || 0
    cur.valorTotal += Number(r.valor_total) || 0
    cur.qtdComPromocao += r.qtd_com_promocao || 0
    if (r.conversao_pct != null) {
      cur._convSum += Number(r.conversao_pct)
      cur._convN += 1
    }
    acc.set(r.nome_item, cur)
  }
  return Array.from(acc.values())
    .map(({ _convSum, _convN, ...rest }) => ({
      ...rest,
      conversaoPctMedia: _convN > 0 ? _convSum / _convN : 0,
    }))
    .sort((a, b) => b.valorTotal - a.valorTotal)
    .slice(0, limit)
}

// ─── Financeiro ──────────────────────────────────────────────────────

/**
 * Versão batch de getFinanceiroResumoForMonth — uma query única pra
 * várias unidades. Pro Dashboard, que precisa agregar a rede inteira.
 * Retorna Map<unitId, FinanceiroResumo>.
 */
export async function getFinanceiroResumoByUnits(
  unitIds: string[],
  year: number,
  month: number,
): Promise<Map<string, FinanceiroResumo>> {
  const out = new Map<string, FinanceiroResumo>()
  if (unitIds.length === 0) return out
  const admin = createAdminClient()

  // Chama a RPC que agrega tudo no Postgres (1 query vs 100+ paginadas)
  const { data, error } = await admin.rpc(
    "ifood_financeiro_resumo_by_units",
    {
      p_unit_ids: unitIds,
      p_year: year,
      p_month: month,
    },
  )
  if (error) {
    console.error("getFinanceiroResumoByUnits RPC error:", error.message)
    return out
  }

  for (const row of (data ?? []) as Array<{
    unit_id: string
    pedidos_unicos: number
    bruto: number | string
    comissao_ifood: number | string
    taxa_entrega: number | string
    taxa_transacao: number | string
    taxa_servico_cliente: number | string
    promocao_loja: number | string
    promocao_ifood: number | string
    pacote_anuncios: number | string
    ressarcimentos: number | string
    cancelamento_total_qtd: number
    cancelamento_parcial_qtd: number
    perda_cancelamento: number | string
    liquido: number | string
  }>) {
    out.set(row.unit_id, {
      pedidosUnicos: row.pedidos_unicos,
      bruto: Number(row.bruto),
      comissaoIfood: Number(row.comissao_ifood),
      taxaEntrega: Number(row.taxa_entrega),
      taxaTransacao: Number(row.taxa_transacao),
      taxaServicoCliente: Number(row.taxa_servico_cliente),
      promocaoLoja: Number(row.promocao_loja),
      promocaoIfood: Number(row.promocao_ifood),
      pacoteAnuncios: Number(row.pacote_anuncios),
      ressarcimentos: Number(row.ressarcimentos),
      cancelamentoTotalQtd: row.cancelamento_total_qtd,
      cancelamentoParcialQtd: row.cancelamento_parcial_qtd,
      perdaCancelamento: Number(row.perda_cancelamento),
      liquido: Number(row.liquido),
      hasData: row.pedidos_unicos > 0 || Number(row.bruto) > 0,
    })
  }
  return out
}

export async function getFinanceiroResumoForMonth(
  unitId: string,
  year: number,
  month: number,
): Promise<FinanceiroResumo> {
  // Usa a RPC batch passando 1 unit_id só (rápido, sem paginação)
  const batch = await getFinanceiroResumoByUnits([unitId], year, month)
  return (
    batch.get(unitId) ?? {
      pedidosUnicos: 0,
      bruto: 0,
      comissaoIfood: 0,
      taxaEntrega: 0,
      taxaTransacao: 0,
      taxaServicoCliente: 0,
      promocaoLoja: 0,
      promocaoIfood: 0,
      pacoteAnuncios: 0,
      ressarcimentos: 0,
      cancelamentoTotalQtd: 0,
      cancelamentoParcialQtd: 0,
      perdaCancelamento: 0,
      liquido: 0,
      hasData: false,
    }
  )
}

// ─── Cancelamentos por motivo ────────────────────────────────────────

export async function getCancelamentosPorMotivo(
  unitId: string,
  year: number,
  month: number,
): Promise<CancelamentoMotivo[]> {
  const admin = createAdminClient()
  const data = await fetchAllRows<{
    motivo_cancelamento: string | null
    valor: number | string | null
    pedido_associado_ifood: string | null
    fato_gerador: string | null
    impacto_no_repasse: boolean | null
  }>(
    (from, to) =>
      admin
        .from("ifood_financeiro_lancamentos")
        .select(
          "motivo_cancelamento, valor, pedido_associado_ifood, fato_gerador, impacto_no_repasse",
        )
        .eq("unit_id", unitId)
        .eq("ref_year", year)
        .eq("ref_month", month)
        .in("fato_gerador", ["Cancelamento Total", "Cancelamento Parcial"])
        .order("id")
        .range(from, to),
    "ifood_financeiro_lancamentos cancelamentos unidade",
  )

  const acc = new Map<
    string,
    { pedidos: Set<string>; perdaFinanceira: number }
  >()
  for (const r of data) {
    const motivo = (r.motivo_cancelamento ?? "Sem motivo informado").toString()
    const cur = acc.get(motivo) ?? {
      pedidos: new Set<string>(),
      perdaFinanceira: 0,
    }
    if (r.pedido_associado_ifood) cur.pedidos.add(r.pedido_associado_ifood)
    if (r.impacto_no_repasse) cur.perdaFinanceira += Number(r.valor) || 0
    acc.set(motivo, cur)
  }
  return Array.from(acc.entries())
    .map(([motivo, v]) => ({
      motivo,
      pedidos: v.pedidos.size,
      perdaFinanceira: Math.round(v.perdaFinanceira * 100) / 100,
    }))
    .sort((a, b) => b.pedidos - a.pedidos)
}

// ─── Pedidos / Drill-down ────────────────────────────────────────────

export async function listPedidosForMonth(
  unitId: string,
  year: number,
  month: number,
  opts: { search?: string; cancelado?: boolean; limit?: number } = {},
): Promise<PedidoResumo[]> {
  const admin = createAdminClient()
  // 1 pedido = ~7 linhas; pra resumo precisa ler tudo (paginado)
  const data = await fetchAllRows<{
    pedido_associado_ifood: string | null
    pedido_associado_ifood_curto: string | null
    data_criacao_pedido: string | null
    valor_transacao: number | string | null
    valor: number | string | null
    fato_gerador: string | null
    descricao_lancamento: string | null
    motivo_cancelamento: string | null
  }>((from, to) => {
    let query = admin
      .from("ifood_financeiro_lancamentos")
      .select(
        "pedido_associado_ifood, pedido_associado_ifood_curto, data_criacao_pedido, valor_transacao, valor, fato_gerador, descricao_lancamento, motivo_cancelamento",
      )
      .eq("unit_id", unitId)
      .eq("ref_year", year)
      .eq("ref_month", month)
      .not("pedido_associado_ifood", "is", null)
      .order("id")
      .range(from, to)

    if (opts.search) {
      const s = opts.search.trim()
      if (s) {
        query = query.or(
          `pedido_associado_ifood_curto.ilike.%${s}%,pedido_associado_ifood.ilike.%${s}%`,
        )
      }
    }
    return query
  }, "ifood_financeiro_lancamentos pedidos unidade")

  const acc = new Map<string, PedidoResumo>()
  for (const r of data) {
    const id = r.pedido_associado_ifood as string
    if (!id) continue
    const cur = acc.get(id) ?? {
      pedidoIfood: id,
      pedidoCurto: r.pedido_associado_ifood_curto,
      dataCriacao: r.data_criacao_pedido,
      valorTransacao: r.valor_transacao ? Number(r.valor_transacao) : null,
      bruto: 0,
      liquido: 0,
      comissao: 0,
      taxaEntrega: 0,
      promocaoLoja: 0,
      cancelado: false,
      motivoCancelamento: null,
    }
    const desc = r.descricao_lancamento ?? ""
    const fg = r.fato_gerador ?? ""
    const val = Number(r.valor) || 0

    if (fg === "Venda" && desc === "Entrada Financeira") cur.bruto += val
    if (
      fg === "Venda" &&
      (desc === "Comissão do iFood (entrega iFood)" ||
        desc === "Comissão do iFood")
    )
      cur.comissao += val
    if (fg === "Venda" && desc === "Taxa entrega iFood") cur.taxaEntrega += val
    if (fg === "Venda" && desc?.startsWith("Promoção custeada pela loja"))
      cur.promocaoLoja += val
    if (fg === "Cancelamento Total" || fg === "Cancelamento Parcial") {
      cur.cancelado = true
      if (!cur.motivoCancelamento && r.motivo_cancelamento) {
        cur.motivoCancelamento = r.motivo_cancelamento as string
      }
    }
    cur.liquido += val // simplificação: soma tudo (ajustamos depois se precisar)
    acc.set(id, cur)
  }
  let list = Array.from(acc.values())
  if (opts.cancelado != null) {
    list = list.filter((p) => p.cancelado === opts.cancelado)
  }
  // Ordena por data DESC
  list.sort((a, b) => {
    const da = a.dataCriacao ? new Date(a.dataCriacao).getTime() : 0
    const db = b.dataCriacao ? new Date(b.dataCriacao).getTime() : 0
    return db - da
  })
  return list.slice(0, opts.limit ?? 100)
}

export async function getPedidoDetalhe(
  unitId: string,
  pedidoIfood: string,
): Promise<{
  pedidoIfood: string
  pedidoCurto: string | null
  dataCriacao: string | null
  lancamentos: Array<{
    fatoGerador: string | null
    tipoLancamento: string | null
    descricao: string | null
    valor: number
    impacta: boolean | null
    data: string | null
  }>
  totais: { bruto: number; liquido: number; comissao: number; taxas: number }
}> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("ifood_financeiro_lancamentos")
    .select(
      "data_fato_gerador, data_criacao_pedido, pedido_associado_ifood_curto, fato_gerador, tipo_lancamento, descricao_lancamento, valor, impacto_no_repasse",
    )
    .eq("unit_id", unitId)
    .eq("pedido_associado_ifood", pedidoIfood)
    .order("data_fato_gerador")

  const lancs = (data ?? []).map((r) => ({
    fatoGerador: r.fato_gerador,
    tipoLancamento: r.tipo_lancamento,
    descricao: r.descricao_lancamento,
    valor: Number(r.valor) || 0,
    impacta: r.impacto_no_repasse,
    data: r.data_fato_gerador,
  }))
  const totais = lancs.reduce(
    (a, l) => {
      const desc = l.descricao ?? ""
      const fg = l.fatoGerador ?? ""
      if (fg === "Venda" && desc === "Entrada Financeira") a.bruto += l.valor
      if (
        fg === "Venda" &&
        (desc === "Comissão do iFood (entrega iFood)" ||
          desc === "Comissão do iFood")
      )
        a.comissao += l.valor
      if (
        fg === "Venda" &&
        (desc === "Taxa entrega iFood" ||
          desc === "Taxa de transação" ||
          desc === "Taxa de transação iFood beneficios" ||
          desc === "Taxa de serviço iFood cobrada do cliente")
      )
        a.taxas += l.valor
      if (l.impacta) a.liquido += l.valor
      return a
    },
    { bruto: 0, liquido: 0, comissao: 0, taxas: 0 },
  )

  return {
    pedidoIfood,
    pedidoCurto: data?.[0]?.pedido_associado_ifood_curto ?? null,
    dataCriacao: data?.[0]?.data_criacao_pedido ?? null,
    lancamentos: lancs,
    totais: {
      bruto: Math.round(totais.bruto * 100) / 100,
      liquido: Math.round(totais.liquido * 100) / 100,
      comissao: Math.round(totais.comissao * 100) / 100,
      taxas: Math.round(totais.taxas * 100) / 100,
    },
  }
}

// ─── Rede / Dashboard ────────────────────────────────────────────────

export async function getNetworkFunnelForMonth(
  year: number,
  month: number,
  filterUnitIds?: string[],
): Promise<NetworkFunnel> {
  const admin = createAdminClient()
  const { start, end } = monthRange(year, month)
  // Fonte = snapshot de período do Cardápio (ifood_cardapio_periodo), a MESMA
  // do detalhe da loja. O relatório consolidado de Cardápio do iFood salva o
  // "Funil Loja" como snapshot de período (não como funil diário), então a
  // tabela ifood_daily_funnel fica vazia e o dashboard mostrava "sem cardápio"
  // mesmo havendo dado. Pega, por loja, o snapshot cujo period_end cai no mês.
  const snaps = await fetchAllRows<{
    unit_id: string
    period_end: string
    visitas: number
    visualizacoes: number
    sacola: number
    revisao: number
    concluidos: number
  }>((from, to) => {
    let q = admin
      .from("ifood_cardapio_periodo")
      .select(
        "unit_id, period_end, visitas, visualizacoes, sacola, revisao, concluidos",
      )
      .gte("period_end", start)
      .lte("period_end", end)
      .order("period_end", { ascending: false })
      .range(from, to)
    if (filterUnitIds) q = q.in("unit_id", filterUnitIds)
    return q
  }, "ifood_cardapio_periodo rede")

  // 1 snapshot por loja: o mais recente cujo period_end cai no mês (já vem
  // ordenado desc, então a 1ª ocorrência de cada loja é a certa).
  const byUnit = new Map<
    string,
    { visitas: number; visualizacoes: number; sacola: number; revisao: number; concluidos: number }
  >()
  for (const r of snaps) {
    if (byUnit.has(r.unit_id)) continue
    byUnit.set(r.unit_id, {
      visitas: r.visitas || 0,
      visualizacoes: r.visualizacoes || 0,
      sacola: r.sacola || 0,
      revisao: r.revisao || 0,
      concluidos: r.concluidos || 0,
    })
  }

  // Resolve nome das unidades
  const unitIds = Array.from(byUnit.keys())
  const { data: units } =
    unitIds.length > 0
      ? await admin.from("units").select("id, code, name").in("id", unitIds)
      : { data: [] }
  const nameMap = new Map(
    (units ?? []).map((u) => [u.id, { code: u.code, name: u.name }]),
  )

  const totals = aggregateFunnel(
    Array.from(byUnit.values()).map((v) => ({ ...v })),
  )

  const topUnits = Array.from(byUnit.entries())
    .map(([id, v]) => ({
      unitId: id,
      code: nameMap.get(id)?.code ?? "?",
      name: nameMap.get(id)?.name ?? "(unidade)",
      visitas: v.visitas,
      concluidos: v.concluidos,
      conversaoPct: v.visitas > 0 ? (v.concluidos / v.visitas) * 100 : 0,
    }))
    .sort((a, b) => b.concluidos - a.concluidos)

  return { totals, topUnits }
}

// ─── Avaliações ──────────────────────────────────────────────────────

export type AvaliacoesResumo = {
  total: number
  notaMedia: number
  distribucao: Record<1 | 2 | 3 | 4 | 5, number>
  comComentario: number
  topTagsPositivas: Array<{ tag: string; count: number }>
  topTagsNegativas: Array<{ tag: string; count: number }>
  hasData: boolean
}

export type AvaliacaoListItem = {
  id: string
  pedidoIdCurto: string | null
  dataAvaliacao: string
  dataPedido: string | null
  nota: number
  comentario: string | null
  tagsPositivas: string[]
  tagsNegativas: string[]
  statusAvaliacao: string | null
}

export async function getAvaliacoesResumoForMonth(
  unitId: string,
  year: number,
  month: number,
): Promise<AvaliacoesResumo> {
  const admin = createAdminClient()
  const { start, end } = monthRange(year, month)
  const rows = await fetchAllRows<{
    nota: number
    comentario: string | null
    tags_positivas: string[] | null
    tags_negativas: string[] | null
  }>(
    (from, to) =>
      admin
        .from("ifood_avaliacoes")
        .select("nota, comentario, tags_positivas, tags_negativas")
        .eq("unit_id", unitId)
        .gte("data_avaliacao", start)
        .lte("data_avaliacao", end)
        .order("id")
        .range(from, to),
    "ifood_avaliacoes resumo unidade",
  )

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
  const dist: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let soma = 0
  let comComentario = 0
  const tagPos = new Map<string, number>()
  const tagNeg = new Map<string, number>()
  for (const r of rows) {
    const k = r.nota as 1 | 2 | 3 | 4 | 5
    dist[k] += 1
    soma += r.nota
    if (r.comentario && String(r.comentario).trim().length > 0) comComentario++
    for (const t of (r.tags_positivas as string[]) ?? []) {
      tagPos.set(t, (tagPos.get(t) ?? 0) + 1)
    }
    for (const t of (r.tags_negativas as string[]) ?? []) {
      tagNeg.set(t, (tagNeg.get(t) ?? 0) + 1)
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

export async function listAvaliacoesForMonth(
  unitId: string,
  year: number,
  month: number,
  opts: { onlyWithComment?: boolean; notaMin?: number; limit?: number } = {},
): Promise<AvaliacaoListItem[]> {
  const admin = createAdminClient()
  const { start, end } = monthRange(year, month)
  let query = admin
    .from("ifood_avaliacoes")
    .select(
      "id, pedido_id_curto, data_avaliacao, data_pedido, nota, comentario, tags_positivas, tags_negativas, status_avaliacao",
    )
    .eq("unit_id", unitId)
    .gte("data_avaliacao", start)
    .lte("data_avaliacao", end)
    .order("data_avaliacao", { ascending: false })
    .limit(opts.limit ?? 200)

  if (opts.notaMin != null) {
    query = query.gte("nota", opts.notaMin)
  }
  if (opts.onlyWithComment) {
    query = query.not("comentario", "is", null).neq("comentario", "")
  }

  const { data } = await query
  return (data ?? []).map((r) => ({
    id: r.id,
    pedidoIdCurto: r.pedido_id_curto,
    dataAvaliacao: r.data_avaliacao,
    dataPedido: r.data_pedido,
    nota: r.nota,
    comentario: r.comentario,
    tagsPositivas: (r.tags_positivas as string[]) ?? [],
    tagsNegativas: (r.tags_negativas as string[]) ?? [],
    statusAvaliacao: r.status_avaliacao,
  }))
}

export type NetworkAvaliacoes = {
  total: number
  notaMedia: number
  distribucao: Record<1 | 2 | 3 | 4 | 5, number>
  comComentario: number
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

export async function getNetworkAvaliacoesForMonth(
  year: number,
  month: number,
  filterUnitIds?: string[],
): Promise<NetworkAvaliacoes> {
  const admin = createAdminClient()
  const { start, end } = monthRange(year, month)
  const rows = await fetchAllRows<{
    id: string
    unit_id: string
    nota: number
    comentario: string | null
    tags_positivas: string[] | null
    tags_negativas: string[] | null
    data_avaliacao: string
    pedido_id_curto: string | null
  }>((from, to) => {
    let q = admin
      .from("ifood_avaliacoes")
      .select(
        "id, unit_id, nota, comentario, tags_positivas, tags_negativas, data_avaliacao, pedido_id_curto",
      )
      .gte("data_avaliacao", start)
      .lte("data_avaliacao", end)
      .order("id")
      .range(from, to)
    if (filterUnitIds)
      q = q.in("unit_id", filterUnitIds)
    return q
  }, "ifood_avaliacoes rede")

  // Paginação ordena por id; pra "últimos comentários" precisamos reordenar
  // por data_avaliacao DESC em JS (a ordem do .order() na query se perde).
  rows.sort((a, b) =>
    String(b.data_avaliacao).localeCompare(String(a.data_avaliacao)),
  )

  if (rows.length === 0) {
    return {
      total: 0,
      notaMedia: 0,
      distribucao: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      comComentario: 0,
      topTagsPositivas: [],
      topTagsNegativas: [],
      ultimosComentarios: [],
      hasData: false,
    }
  }

  const dist: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let soma = 0
  let comComentario = 0
  const tagPos = new Map<string, number>()
  const tagNeg = new Map<string, number>()
  for (const r of rows) {
    const k = r.nota as 1 | 2 | 3 | 4 | 5
    dist[k] += 1
    soma += r.nota
    if (r.comentario && String(r.comentario).trim().length > 0) comComentario++
    for (const t of (r.tags_positivas as string[]) ?? [])
      tagPos.set(t, (tagPos.get(t) ?? 0) + 1)
    for (const t of (r.tags_negativas as string[]) ?? [])
      tagNeg.set(t, (tagNeg.get(t) ?? 0) + 1)
  }

  // Últimos 5 comentários (não vazios)
  const comentariosNaoVazios = rows.filter(
    (r) => r.comentario && String(r.comentario).trim().length > 0,
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
    for (const u of units ?? []) {
      unitMap.set(u.id, { code: u.code, name: u.name })
    }
  }
  const ultimosComentarios = comentariosNaoVazios.slice(0, 50).map((r) => ({
    id: r.id,
    unitId: r.unit_id,
    unitCode: unitMap.get(r.unit_id)?.code ?? "?",
    unitName: unitMap.get(r.unit_id)?.name ?? "(unidade)",
    nota: r.nota,
    comentario: r.comentario as string,
    data: r.data_avaliacao,
    pedidoIdCurto: r.pedido_id_curto,
  }))

  return {
    total: rows.length,
    notaMedia: Math.round((soma / rows.length) * 100) / 100,
    distribucao: dist,
    comComentario,
    topTagsPositivas: Array.from(tagPos.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([tag, count]) => ({ tag, count })),
    topTagsNegativas: Array.from(tagNeg.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([tag, count]) => ({ tag, count })),
    ultimosComentarios,
    hasData: true,
  }
}

export async function getNetworkCancelamentosPorMotivo(
  year: number,
  month: number,
  limit = 5,
  filterUnitIds?: string[],
): Promise<CancelamentoMotivo[]> {
  const admin = createAdminClient()
  const data = await fetchAllRows<{
    motivo_cancelamento: string | null
    valor: number | string | null
    pedido_associado_ifood: string | null
    fato_gerador: string | null
    impacto_no_repasse: boolean | null
  }>((from, to) => {
    let q = admin
      .from("ifood_financeiro_lancamentos")
      .select(
        "motivo_cancelamento, valor, pedido_associado_ifood, fato_gerador, impacto_no_repasse",
      )
      .eq("ref_year", year)
      .eq("ref_month", month)
      .in("fato_gerador", ["Cancelamento Total", "Cancelamento Parcial"])
      .order("id")
      .range(from, to)
    if (filterUnitIds)
      q = q.in("unit_id", filterUnitIds)
    return q
  }, "ifood_financeiro_lancamentos cancelamentos rede")

  const acc = new Map<
    string,
    { pedidos: Set<string>; perdaFinanceira: number }
  >()
  for (const r of data) {
    const motivo = (r.motivo_cancelamento ?? "Sem motivo informado").toString()
    const cur = acc.get(motivo) ?? {
      pedidos: new Set<string>(),
      perdaFinanceira: 0,
    }
    if (r.pedido_associado_ifood) cur.pedidos.add(r.pedido_associado_ifood)
    if (r.impacto_no_repasse) cur.perdaFinanceira += Number(r.valor) || 0
    acc.set(motivo, cur)
  }
  return Array.from(acc.entries())
    .map(([motivo, v]) => ({
      motivo,
      pedidos: v.pedidos.size,
      perdaFinanceira: Math.round(v.perdaFinanceira * 100) / 100,
    }))
    .sort((a, b) => b.pedidos - a.pedidos)
    .slice(0, limit)
}
