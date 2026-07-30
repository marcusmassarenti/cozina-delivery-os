/**
 * Queries em cima dos dados importados do iFood (tabelas 0007).
 *
 * Convenção:
 * - "Month" = (ref_year, ref_month) — usado pelo Financeiro
 * - Pra Cardápio (que é diário), agregamos por date BETWEEN
 *   o 1º e o último dia do mês.
 */

import "server-only"

import { unstable_cache } from "next/cache"

import { TAG_FINANCEIRO_IFOOD } from "@/lib/cache-tags"

import { cache as reactCache } from "react"

import { createAdminClient } from "@/lib/supabase/admin"
import { currentPeriod } from "@/lib/period"
import { fetchAllRows } from "@/lib/data/paginate"
import { monthOperationWindow } from "@/lib/data/operation-window"
import { getAccessibleUnitIds } from "@/lib/auth/permissions"

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
  /** Valor que entra no repasse iFood (impacto_no_repasse=true). */
  liquido: number
  /**
   * Valores que entram direto no caixa da loja em pedidos do iFood —
   * dinheiro, PIX, VR/VA presencial, maquininha própria
   * (Entrada Financeira com impacto_no_repasse=false).
   * Bate ao centavo com "Valores recebidos direto pela loja" do Portal iFood.
   * faturamento total iFood = liquido + recebidoDireto.
   */
  recebidoDireto: number
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
  // Relatórios de período (1 por mês) — status binário (tem/não tem).
  qualidade: { status: CoverageStatus }
  promocoes: { status: CoverageStatus }
  super: { status: CoverageStatus }
  negociacoes: { status: CoverageStatus }
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

  // Isolamento multi-tenant: só as lojas da empresa do usuário (null =
  // super-admin de plataforma sem vínculo → vê tudo). Empresa sem lojas → set
  // vazio → matriz vazia.
  const allowed = await getAccessibleUnitIds()
  const allowSet = allowed ? new Set(allowed) : null

  // Busca todas as unidades (ativas e inativas)
  const { data: unitsRows } = await admin
    .from("units")
    .select("id, code, name, active, data_inauguracao, data_encerramento")
    .order("code")
  const units = (unitsRows ?? []).filter((u) => !allowSet || allowSet.has(u.id))
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

  // 6) Relatórios de período novos (Qualidade, Promoções, Super, Negociações):
  // 1 linha por (unit, período). Presença por mês do period_end (status binário).
  const buildPresence = async (
    table:
      | "ifood_operacao_periodo"
      | "ifood_promocoes_periodo"
      | "ifood_super_avaliacao"
      | "ifood_negociacoes_periodo",
  ): Promise<Map<string, Set<string>>> => {
    const map = new Map<string, Set<string>>()
    if (unitIds.length === 0) return map
    const rows = await fetchAllRows<{ unit_id: string; period_end: string }>(
      (from, to) =>
        admin
          .from(table)
          .select("unit_id, period_end")
          .in("unit_id", unitIds)
          .gte("period_end", rangeStart)
          .lte("period_end", rangeEnd)
          .order("id")
          .range(from, to),
      `${table} cobertura`,
    )
    for (const r of rows) {
      const set = map.get(r.unit_id) ?? new Set<string>()
      set.add(dateToKey(r.period_end))
      map.set(r.unit_id, set)
    }
    return map
  }
  const qualidadeMap = await buildPresence("ifood_operacao_periodo")
  const promocoesMap = await buildPresence("ifood_promocoes_periodo")
  const superMap = await buildPresence("ifood_super_avaliacao")
  const negociacoesMap = await buildPresence("ifood_negociacoes_periodo")

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
          qualidade: {
            status: (qualidadeMap.get(u.id)?.has(month.key)
              ? "complete"
              : "empty") as CoverageStatus,
          },
          promocoes: {
            status: (promocoesMap.get(u.id)?.has(month.key)
              ? "complete"
              : "empty") as CoverageStatus,
          },
          super: {
            status: (superMap.get(u.id)?.has(month.key)
              ? "complete"
              : "empty") as CoverageStatus,
          },
          negociacoes: {
            status: (negociacoesMap.get(u.id)?.has(month.key)
              ? "complete"
              : "empty") as CoverageStatus,
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

/** Mês corrente em São Paulo — o único que ainda pode mudar sozinho. */
function mesCorrenteBR(): { ano: number; mes: number } {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(new Date())
  const [ano, mes] = p.split("-").map(Number)
  return { ano, mes }
}

type ResumoRpcRow = Record<string, unknown>

async function chamarResumo(
  unitIds: string[],
  year: number,
  month: number,
  dateRange?: { start: string; end: string },
): Promise<{ data: ResumoRpcRow[] | null; error: string | null }> {
  const { data, error } = await createAdminClient().rpc(
    "ifood_financeiro_resumo_by_units",
    {
      p_unit_ids: unitIds,
      p_year: year,
      p_month: month,
      ...(dateRange
        ? { p_start_date: dateRange.start, p_end_date: dateRange.end }
        : {}),
    },
  )
  return { data: (data ?? null) as ResumoRpcRow[] | null, error: error?.message ?? null }
}

/**
 * Mês FECHADO responde do cache; mês corrente sempre vai ao banco.
 *
 * Esta RPC é o gargalo do dashboard: medida em produção com 26.810 chamadas a
 * ~900 ms, quase 7 horas de tempo de banco acumulado. O gráfico de evolução
 * pede janeiro a julho a cada abertura da tela — e recalcular janeiro, que não
 * muda mais, é desperdício puro.
 *
 * ⚠️ Mês fechado MUDA quando é reimportado (aconteceu em 29/07: junho e julho
 * foram recarregados e o bruto da rede mudou R$ 161 mil). Por isso o cache é
 * marcado com a tag `ifood-financeiro`, e a gravação da conciliação derruba a
 * tag ao terminar. Cache que serve número velho depois de uma correção seria
 * pior do que a lentidão que ele resolve.
 */
async function resumoRpc(
  unitIds: string[],
  year: number,
  month: number,
  dateRange?: { start: string; end: string },
): Promise<{ data: ResumoRpcRow[] | null; error: string | null }> {
  const corrente = mesCorrenteBR()
  const fechado =
    !dateRange && (year < corrente.ano || (year === corrente.ano && month < corrente.mes))
  if (!fechado) return chamarResumo(unitIds, year, month, dateRange)

  // A chave precisa das lojas: o mesmo mês pedido pra recortes diferentes de
  // unidade é resultado diferente. Ordenada, senão a ordem do filtro cria
  // entradas duplicadas pro mesmo conjunto.
  const chave = `${year}-${month}-${[...unitIds].sort().join(",")}`
  return unstable_cache(
    () => chamarResumo(unitIds, year, month),
    ["ifood-financeiro-resumo", chave],
    { tags: [TAG_FINANCEIRO_IFOOD], revalidate: 86_400 },
  )()
}

export async function getFinanceiroResumoByUnits(
  unitIds: string[],
  year: number,
  month: number,
  dateRange?: { start: string; end: string },
): Promise<Map<string, FinanceiroResumo>> {
  const out = new Map<string, FinanceiroResumo>()
  if (unitIds.length === 0) return out

  const { data, error } = await resumoRpc(unitIds, year, month, dateRange)
  if (error) {
    console.error("getFinanceiroResumoByUnits RPC error:", error)
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
    recebido_direto: number | string
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
      recebidoDireto: Number(row.recebido_direto),
      hasData: row.pedidos_unicos > 0 || Number(row.bruto) > 0,
    })
  }
  return out
}

export async function getFinanceiroResumoForMonth(
  unitId: string,
  year: number,
  month: number,
  dateRange?: { start: string; end: string },
): Promise<FinanceiroResumo> {
  // Usa a RPC batch passando 1 unit_id só (rápido, sem paginação)
  const batch = await getFinanceiroResumoByUnits([unitId], year, month, dateRange)
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
      recebidoDireto: 0,
      hasData: false,
    }
  )
}

// ─── Antecipação (taxa de receber adiantado) ─────────────────────────

/**
 * Taxa de antecipação do iFood por loja no mês (de ifood_antecipacoes,
 * populada pelo sync). É o juro de receber o repasse adiantado — NÃO vem na
 * Conciliação. O DRE da loja mostra como "Recebido real no caixa" = líquido −
 * esta taxa. Retorna Map<unitId, feeAmount> (R$, positivo). Loja sem dado = 0.
 */
export async function getAntecipacaoFeeByUnits(
  unitIds: string[],
  year: number,
  month: number,
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (unitIds.length === 0) return out
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("ifood_antecipacoes")
    .select("unit_id, fee_amount")
    .in("unit_id", unitIds)
    .eq("ref_year", year)
    .eq("ref_month", month)
  if (error) {
    // Tabela pode não existir ainda (migration não aplicada) — degrada pra 0.
    console.error("getAntecipacaoFeeByUnits:", error.message)
    return out
  }
  for (const r of data ?? []) {
    out.set(r.unit_id, Number(r.fee_amount) || 0)
  }
  return out
}

// ─── Cesta dos pedidos cancelados (pro DRE bater com o portal) ───────

export type CancelamentoCesta = { qtd: number; valor: number }

/**
 * Cesta (max de valor_cesta_final, igual à RPC do bruto) POR PEDIDO cancelado.
 * `porUnidade` = Map<unitId, Set<pedido>>; retorna Map<"unit|pedido", cesta>.
 * Um pedido tem várias linhas de Venda (comissão, taxa) todas repetindo a
 * cesta — daí o max. Chunks pequenos pra não estourar o limite por resposta.
 */
async function cestaPorPedidoCancelado(
  porUnidade: Map<string, Set<string>>,
  year: number,
  month: number,
): Promise<Map<string, number>> {
  const admin = createAdminClient()
  const unitIds = [...porUnidade.keys()]
  const todosIds = [
    ...new Set([...porUnidade.values()].flatMap((s) => [...s])),
  ]
  const porPedido = new Map<string, number>()
  if (todosIds.length === 0) return porPedido
  for (let i = 0; i < todosIds.length; i += 50) {
    const chunk = todosIds.slice(i, i + 50)
    const { data, error } = await admin
      .from("ifood_financeiro_lancamentos")
      .select("unit_id, pedido_associado_ifood, valor_cesta_final")
      .in("unit_id", unitIds)
      .eq("ref_year", year)
      .eq("ref_month", month)
      .eq("fato_gerador", "Venda")
      .in("pedido_associado_ifood", chunk)
      .not("valor_cesta_final", "is", null)
      .range(0, 4999)
    if (error)
      throw new Error(`Falha ao buscar cesta dos cancelados: ${error.message}`)
    for (const r of data ?? []) {
      const pedido = r.pedido_associado_ifood as string
      if (!porUnidade.get(r.unit_id as string)?.has(pedido)) continue
      const key = `${r.unit_id}|${pedido}`
      const v = Number(r.valor_cesta_final) || 0
      porPedido.set(key, Math.max(porPedido.get(key) ?? 0, v))
    }
  }
  return porPedido
}

/**
 * Valor de venda (cesta) dos pedidos com Cancelamento Total no mês, POR
 * UNIDADE — o que o portal do iFood soma no "Valor das vendas" e o nosso
 * bruto exclui. "Vendas totais" (DRE/heros) = bruto + este valor. O
 * `perda_cancelamento` da RPC NÃO serve pra isso: é o lançamento de estorno
 * (menor que a venda cancelada). Mesma regra da RPC do bruto:
 * max(valor_cesta_final) por pedido. Unidade sem dado fica fora do Map.
 */
export async function getCancelamentoCestaByUnits(
  unitIds: string[],
  year: number,
  month: number,
  dateRange?: { start: string; end: string },
): Promise<Map<string, CancelamentoCesta>> {
  const out = new Map<string, CancelamentoCesta>()
  if (unitIds.length === 0) return out
  const admin = createAdminClient()

  const aplicaRange = <T extends { gte: any; lte: any }>(q: T): T => {
    if (!dateRange) return q
    return q
      .gte("data_criacao_pedido", dateRange.start)
      .lte("data_criacao_pedido", `${dateRange.end}T23:59:59`) as T
  }

  const canc = await fetchAllRows<{
    unit_id: string
    pedido_associado_ifood: string | null
  }>(
    (from, to) =>
      aplicaRange(
        admin
          .from("ifood_financeiro_lancamentos")
          .select("unit_id, pedido_associado_ifood")
          .in("unit_id", unitIds)
          .eq("ref_year", year)
          .eq("ref_month", month)
          .eq("fato_gerador", "Cancelamento Total")
          .not("pedido_associado_ifood", "is", null),
      )
        .order("id")
        .range(from, to),
    "ifood_financeiro_lancamentos cancelados cesta",
  )
  // chave composta unidade|pedido (o mesmo nº de pedido não repete entre
  // lojas na prática, mas custa nada blindar)
  const cancelados = new Map<string, Set<string>>()
  for (const r of canc) {
    if (!r.pedido_associado_ifood) continue
    const set = cancelados.get(r.unit_id) ?? new Set<string>()
    set.add(r.pedido_associado_ifood)
    cancelados.set(r.unit_id, set)
  }
  const porPedido = await cestaPorPedidoCancelado(cancelados, year, month)

  for (const [unitId, pedidos] of cancelados) {
    let valor = 0
    for (const p of pedidos) valor += porPedido.get(`${unitId}|${p}`) ?? 0
    out.set(unitId, {
      qtd: pedidos.size,
      valor: Math.round(valor * 100) / 100,
    })
  }
  return out
}

/** Versão 1-unidade (com React cache — página e aba Financeiro pedem o mesmo
 * dado na mesma request). */
export const getCancelamentoCestaForMonth = reactCache(
  async (
    unitId: string,
    year: number,
    month: number,
    dateRange?: { start: string; end: string },
  ): Promise<CancelamentoCesta> => {
    const map = await getCancelamentoCestaByUnits(
      [unitId],
      year,
      month,
      dateRange,
    )
    return map.get(unitId) ?? { qtd: 0, valor: 0 }
  },
)

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

  // Perda REAL: cancelamento total vale a CESTA do pedido (o que a venda
  // valia — mesma régua do DRE/heros), não o lançamento de estorno (menor).
  // Parcial continua no valor do estorno (o pedido não foi perdido inteiro).
  const acc = new Map<
    string,
    { pedidos: Set<string>; perdaFinanceira: number; totais: Set<string> }
  >()
  const totalPorUnidade = new Map<string, Set<string>>([[unitId, new Set()]])
  for (const r of data) {
    const motivo = (r.motivo_cancelamento ?? "Sem motivo informado").toString()
    const cur = acc.get(motivo) ?? {
      pedidos: new Set<string>(),
      perdaFinanceira: 0,
      totais: new Set<string>(),
    }
    if (r.pedido_associado_ifood) {
      cur.pedidos.add(r.pedido_associado_ifood)
      if (r.fato_gerador === "Cancelamento Total") {
        cur.totais.add(`${unitId}|${r.pedido_associado_ifood}`)
        totalPorUnidade.get(unitId)!.add(r.pedido_associado_ifood)
      }
    }
    if (r.fato_gerador === "Cancelamento Parcial" && r.impacto_no_repasse)
      cur.perdaFinanceira += Math.abs(Number(r.valor) || 0)
    acc.set(motivo, cur)
  }
  const cesta = await cestaPorPedidoCancelado(totalPorUnidade, year, month)
  for (const v of acc.values())
    for (const key of v.totais) v.perdaFinanceira += cesta.get(key) ?? 0
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
    valor_cesta_final: number | string | null
    fato_gerador: string | null
    descricao_lancamento: string | null
    motivo_cancelamento: string | null
  }>((from, to) => {
    let query = admin
      .from("ifood_financeiro_lancamentos")
      .select(
        "pedido_associado_ifood, pedido_associado_ifood_curto, data_criacao_pedido, valor_transacao, valor, valor_cesta_final, fato_gerador, descricao_lancamento, motivo_cancelamento",
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

    // Bruto do pedido = valor dos itens (cesta), igual à definição da tela.
    // A cesta repete em cada linha de Venda; usa SET (não soma).
    if (fg === "Venda" && r.valor_cesta_final != null)
      cur.bruto = Number(r.valor_cesta_final)
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
      "data_fato_gerador, data_criacao_pedido, pedido_associado_ifood_curto, fato_gerador, tipo_lancamento, descricao_lancamento, valor, valor_cesta_final, impacto_no_repasse",
    )
    .eq("unit_id", unitId)
    .eq("pedido_associado_ifood", pedidoIfood)
    .order("data_fato_gerador")

  // Bruto do pedido = valor dos itens (cesta) — igual à definição da tela.
  const brutoCesta = Number(
    (data ?? []).find(
      (r) => r.fato_gerador === "Venda" && r.valor_cesta_final != null,
    )?.valor_cesta_final ?? 0,
  )

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
      bruto: Math.round(brutoCesta * 100) / 100,
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
    unit_id: string
    motivo_cancelamento: string | null
    valor: number | string | null
    pedido_associado_ifood: string | null
    fato_gerador: string | null
    impacto_no_repasse: boolean | null
  }>((from, to) => {
    let q = admin
      .from("ifood_financeiro_lancamentos")
      .select(
        "unit_id, motivo_cancelamento, valor, pedido_associado_ifood, fato_gerador, impacto_no_repasse",
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

  // Perda REAL: total = cesta do pedido; parcial = estorno (ver a versão
  // por unidade acima — mesma régua do DRE/heros).
  const acc = new Map<
    string,
    { pedidos: Set<string>; perdaFinanceira: number; totais: Set<string> }
  >()
  const totalPorUnidade = new Map<string, Set<string>>()
  for (const r of data) {
    const motivo = (r.motivo_cancelamento ?? "Sem motivo informado").toString()
    const cur = acc.get(motivo) ?? {
      pedidos: new Set<string>(),
      perdaFinanceira: 0,
      totais: new Set<string>(),
    }
    if (r.pedido_associado_ifood) {
      cur.pedidos.add(r.pedido_associado_ifood)
      if (r.fato_gerador === "Cancelamento Total") {
        cur.totais.add(`${r.unit_id}|${r.pedido_associado_ifood}`)
        const set = totalPorUnidade.get(r.unit_id) ?? new Set<string>()
        set.add(r.pedido_associado_ifood)
        totalPorUnidade.set(r.unit_id, set)
      }
    }
    if (r.fato_gerador === "Cancelamento Parcial" && r.impacto_no_repasse)
      cur.perdaFinanceira += Math.abs(Number(r.valor) || 0)
    acc.set(motivo, cur)
  }
  const cesta = await cestaPorPedidoCancelado(totalPorUnidade, year, month)
  for (const v of acc.values())
    for (const key of v.totais) v.perdaFinanceira += cesta.get(key) ?? 0
  return Array.from(acc.entries())
    .map(([motivo, v]) => ({
      motivo,
      pedidos: v.pedidos.size,
      perdaFinanceira: Math.round(v.perdaFinanceira * 100) / 100,
    }))
    .sort((a, b) => b.pedidos - a.pedidos)
    .slice(0, limit)
}

// ─── Qualidade da operação (snapshot de período) ─────────────────────

export type OperacaoSnapshot = {
  periodLabel: string
  periodStart: string
  periodEnd: string
  nivelSuper: string | null
  pedidosTotais: number
  pctTempoOnline: number | null
  mediaTempoOnlineDia: number | null
  pctCancelamento: number | null
  pctNegociacoes: number | null
  pctRespostasNegociacoes: number | null
  pctAtrasados: number | null
  tempoMedioPreparoMin: number | null
  tempoMedioAtrasoMin: number | null
  mediaAvaliacoes: number | null
  qtdAvaliacoes: number
  varCancelamentos: number | null
  varChamados: number | null
  varTempoOnline: number | null
  topMotivosCancelamento: string | null
  topMotivosChamados: string | null
}

/**
 * Indicadores de operação do iFood (relatório "Qualidade da operação")
 * cujo período termina dentro do mês selecionado. 1 por (unidade, período).
 */
export async function getOperacaoForMonth(
  unitId: string,
  year: number,
  month: number,
): Promise<OperacaoSnapshot | null> {
  const admin = createAdminClient()
  const { start, end } = monthRange(year, month)
  const { data } = await admin
    .from("ifood_operacao_periodo")
    .select(
      "period_label, period_start, period_end, nivel_super, pedidos_totais, pct_tempo_online, media_tempo_online_dia, pct_cancelamento, pct_negociacoes, pct_respostas_negociacoes, pct_atrasados, tempo_medio_preparo_min, tempo_medio_atraso_min, media_avaliacoes, qtd_avaliacoes, var_cancelamentos, var_chamados, var_tempo_online, top_motivos_cancelamento, top_motivos_chamados",
    )
    .eq("unit_id", unitId)
    // Janela do relatório de Qualidade é rolante (~30d) e pode terminar no mês
    // seguinte. Casa qualquer janela que SOBREPÕE o mês (mesma regra do de
    // Promoções) — senão em muitos meses `operacao` vinha null e a Saúde caía
    // num fallback que superestima o cancelamento.
    .lte("period_start", end)
    .gte("period_end", start)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  const num = (v: number | string | null) => (v == null ? null : Number(v))
  return {
    periodLabel: data.period_label,
    periodStart: data.period_start,
    periodEnd: data.period_end,
    nivelSuper: data.nivel_super,
    pedidosTotais: data.pedidos_totais ?? 0,
    pctTempoOnline: num(data.pct_tempo_online),
    mediaTempoOnlineDia: num(data.media_tempo_online_dia),
    pctCancelamento: num(data.pct_cancelamento),
    pctNegociacoes: num(data.pct_negociacoes),
    pctRespostasNegociacoes: num(data.pct_respostas_negociacoes),
    pctAtrasados: num(data.pct_atrasados),
    tempoMedioPreparoMin: num(data.tempo_medio_preparo_min),
    tempoMedioAtrasoMin: num(data.tempo_medio_atraso_min),
    mediaAvaliacoes: num(data.media_avaliacoes),
    qtdAvaliacoes: data.qtd_avaliacoes ?? 0,
    varCancelamentos: num(data.var_cancelamentos),
    varChamados: num(data.var_chamados),
    varTempoOnline: num(data.var_tempo_online),
    topMotivosCancelamento: data.top_motivos_cancelamento,
    topMotivosChamados: data.top_motivos_chamados,
  }
}

// ─── Promoções (snapshot de período) ─────────────────────────────────

export type PromocoesSnapshot = {
  periodLabel: string
  periodStart: string
  periodEnd: string
  nCampanhas: number
  pedidos: number
  valorItens: number
  investimentoTotal: number
  investimentoLojas: number
  investimentoRede: number
  investimentoIfood: number
  investimentoIndustria: number
  roasLojas: number | null
}

/**
 * Investimento e retorno de promoções do iFood cujo período termina dentro
 * do mês selecionado. 1 por (unidade, período).
 */
export async function getPromocoesForMonth(
  unitId: string,
  year: number,
  month: number,
): Promise<PromocoesSnapshot | null> {
  const admin = createAdminClient()
  const { start, end } = monthRange(year, month)
  const { data } = await admin
    .from("ifood_promocoes_periodo")
    .select(
      "period_label, period_start, period_end, n_campanhas, pedidos, valor_itens, investimento_total, investimento_lojas, investimento_rede, investimento_ifood, investimento_industria, roas_lojas",
    )
    .eq("unit_id", unitId)
    // A janela do relatório de Promoções é rolante (~30d) e pode terminar no mês
    // seguinte. Casa qualquer janela que SOBREPÕE o mês (start ≤ fimDoMês E
    // end ≥ inícioDoMês), pegando a mais recente.
    .lte("period_start", end)
    .gte("period_end", start)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  const num = (v: number | string | null) => (v == null ? 0 : Number(v))
  return {
    periodLabel: data.period_label,
    periodStart: data.period_start,
    periodEnd: data.period_end,
    nCampanhas: data.n_campanhas ?? 0,
    pedidos: data.pedidos ?? 0,
    valorItens: num(data.valor_itens),
    investimentoTotal: num(data.investimento_total),
    investimentoLojas: num(data.investimento_lojas),
    investimentoRede: num(data.investimento_rede),
    investimentoIfood: num(data.investimento_ifood),
    investimentoIndustria: num(data.investimento_industria),
    roasLojas: data.roas_lojas == null ? null : Number(data.roas_lojas),
  }
}

// ─── Super restaurante (avaliação mais recente) ──────────────────────

export type SuperSnapshot = {
  periodLabel: string
  periodStart: string
  periodEnd: string
  status: string | null
  eSuper: boolean | null
  eElegivel: boolean | null
  totalPedidos: number
  pedidosAvaliados: number
  mediaAvaliacoes: number | null
  pctCancelamento: number | null
  pctChamados: number | null
  totalChamados: number
  chamadosAtraso: number
  chamadosPosEntrega: number
  chamadosItemErrado: number
  planoDeAcao: string | null
  tagsPos: Record<string, number>
  tagsNeg: Record<string, number>
}

/**
 * Avaliação Super mais recente cuja janela termina até o fim do mês
 * selecionado. Como o Super é uma nota trimestral rolante, mostramos o
 * "estado atual" (não filtramos por período dentro do mês).
 */
export async function getSuperForMonth(
  unitId: string,
  year: number,
  month: number,
): Promise<SuperSnapshot | null> {
  const admin = createAdminClient()
  const { end } = monthRange(year, month)
  const { data } = await admin
    .from("ifood_super_avaliacao")
    .select(
      "period_label, period_start, period_end, status, e_super, e_elegivel, total_pedidos, pedidos_avaliados, media_avaliacoes, pct_cancelamento, pct_chamados, total_chamados, chamados_atraso, chamados_pos_entrega, chamados_item_errado, plano_de_acao, tags_pos, tags_neg",
    )
    .eq("unit_id", unitId)
    .lte("period_end", end)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  const num = (v: number | string | null) => (v == null ? null : Number(v))
  const tags = (v: unknown): Record<string, number> =>
    v && typeof v === "object" ? (v as Record<string, number>) : {}
  return {
    periodLabel: data.period_label,
    periodStart: data.period_start,
    periodEnd: data.period_end,
    status: data.status,
    eSuper: data.e_super,
    eElegivel: data.e_elegivel,
    totalPedidos: data.total_pedidos ?? 0,
    pedidosAvaliados: data.pedidos_avaliados ?? 0,
    mediaAvaliacoes: num(data.media_avaliacoes),
    pctCancelamento: num(data.pct_cancelamento),
    pctChamados: num(data.pct_chamados),
    totalChamados: data.total_chamados ?? 0,
    chamadosAtraso: data.chamados_atraso ?? 0,
    chamadosPosEntrega: data.chamados_pos_entrega ?? 0,
    chamadosItemErrado: data.chamados_item_errado ?? 0,
    planoDeAcao: data.plano_de_acao,
    tagsPos: tags(data.tags_pos),
    tagsNeg: tags(data.tags_neg),
  }
}

// ─── Negociações (snapshot de período) ───────────────────────────────

export type NegociacoesSnapshot = {
  periodLabel: string
  periodStart: string
  periodEnd: string
  totalNegociacoes: number
  cancelamentosEvitados: number
  valorEvitado: number
  reembolsoTotal: number
  cupomTotal: number
  respondidas: number
  pctRespondidas: number | null
  impactouSuper: number
  topMotivos: Record<string, number>
}

/**
 * Negociações do iFood cujo período termina dentro do mês selecionado.
 */
export async function getNegociacoesForMonth(
  unitId: string,
  year: number,
  month: number,
): Promise<NegociacoesSnapshot | null> {
  const admin = createAdminClient()
  const { start, end } = monthRange(year, month)
  const { data } = await admin
    .from("ifood_negociacoes_periodo")
    .select(
      "period_label, period_start, period_end, total_negociacoes, cancelamentos_evitados, valor_evitado, reembolso_total, cupom_total, respondidas, pct_respondidas, impactou_super, top_motivos",
    )
    .eq("unit_id", unitId)
    .gte("period_end", start)
    .lte("period_end", end)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  const num = (v: number | string | null) => (v == null ? 0 : Number(v))
  const tags = (v: unknown): Record<string, number> =>
    v && typeof v === "object" ? (v as Record<string, number>) : {}
  return {
    periodLabel: data.period_label,
    periodStart: data.period_start,
    periodEnd: data.period_end,
    totalNegociacoes: data.total_negociacoes ?? 0,
    cancelamentosEvitados: data.cancelamentos_evitados ?? 0,
    valorEvitado: num(data.valor_evitado),
    reembolsoTotal: num(data.reembolso_total),
    cupomTotal: num(data.cupom_total),
    respondidas: data.respondidas ?? 0,
    pctRespondidas: data.pct_respondidas == null ? null : Number(data.pct_respondidas),
    impactouSuper: data.impactou_super ?? 0,
    topMotivos: tags(data.top_motivos),
  }
}
