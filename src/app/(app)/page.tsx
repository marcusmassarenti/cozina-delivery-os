import { Suspense } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  Bike,
  CalendarDays,
  ChevronRight,
  DollarSign,
  MessageCircle,
  Package,
  Percent,
  Receipt,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from "lucide-react"

import { DashboardFilters } from "@/components/dashboard/dashboard-filters"
import { DashboardSection } from "@/components/dashboard/dashboard-section"
import { ImportCoverageBanner } from "@/components/dashboard/import-coverage-banner"
import { PlatformTabbedCard } from "@/components/dashboard/platform-tabbed-card"
import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { type Kpi } from "@/components/shared/kpi-card"
import { SectionDivider } from "@/components/shared/section-divider"
import {
  EvolucaoFaturamento,
  EvolucaoFaturamentoSkeleton,
} from "@/components/dashboard/graficos/evolucao-faturamento"
import {
  RankingDetalhado,
  DetalheLoja,
} from "@/components/dashboard/graficos/ranking-detalhado"
import { ComposicaoBruto } from "@/components/dashboard/graficos/composicao-bruto-chart"
import { HeroFaixa, type HeroMetric } from "@/components/dashboard/hero-faixa"
import { getRealMonthlyForUnits } from "@/lib/data/lancamentos"
import {
  getVisibleUnits,
  getTenantPlatforms,
  isApiSyncEnabled,
} from "@/lib/data/units"
import { getAccessibleUnitIds } from "@/lib/auth/roles"
import { getOnboardingProgress } from "@/lib/data/onboarding"
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist"
import { DashboardTour } from "@/components/dashboard/dashboard-tour"
import {
  getAvailablePeriods,
  getFinanceiroResumoByUnits,
  getNetworkAvaliacoesForMonth,
  getNetworkCancelamentosPorMotivo,
  getNetworkFunnelForMonth,
  getNetworkTopItemsForMonth,
} from "@/lib/data/ifood-imported"
import {
  getNetworkNinefoodAvaliacoesForMonth,
  getNetworkNinefoodCancelamentosForMonth,
  getNetworkNinefoodTopItemsForMonth,
  getNinefoodResumoByUnits,
} from "@/lib/data/ninefood-imported"
import { getImportCoverageForMonth } from "@/lib/data/relatorio-diario"
import { getNetworkDeliveryFee } from "@/lib/data/taxa-entrega"
import {
  getFinanceiroResumoByUnitsForRange,
  getKeetaResumoByUnitsForRange,
  getNetworkDeliveryFeeForRange,
  getNinefoodResumoByUnitsForRange,
} from "@/lib/data/range-aggregation"
import {
  getKeetaResumoByUnits,
  getNetworkKeetaAvaliacoesForMonth,
  getNetworkKeetaCancelamentosForMonth,
  getNetworkKeetaTopItemsForMonth,
} from "@/lib/data/keeta-imported"
import { fmtBRL, fmtBRLShort, fmtNum, fmtPct } from "@/lib/format"
import {
  parsePeriodParam,
  parseRangeFromSp,
  formatPeriodLabel,
  formatRangeLabel,
  rangeIsFullMonth,
  daysElapsedInMonth,
} from "@/lib/period"
import { getCurrentUserContext } from "@/lib/auth/context"
import {
  AttentionSection,
  AttentionSkeleton,
} from "@/components/dashboard/attention-section"
import { PeriodSelector } from "@/components/shared/period-selector"
import { createClient } from "@/lib/supabase/server"

async function checkSupabase() {
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.getUser()
    if (error && error.message !== "Auth session missing!") {
      return { ok: false, message: error.message }
    }
    return { ok: true, message: "Supabase conectado · dados reais do mês corrente" }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro desconhecido",
    }
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    periodo?: string
    inicio?: string // YYYY-MM-DD (range custom)
    fim?: string // YYYY-MM-DD (range custom)
    unidades?: string // códigos separados por vírgula: "01,02,03"
    plataforma?: string // "ifood" | "99food" | "keeta" | undefined (=todas)
    ativo?: string // "1" pra mostrar só com faturamento
  }>
}) {
  const sp = await searchParams
  // Range de período custom (ou mês inteiro como default). Por enquanto as
  // queries continuam por (year, month) do início — quando range é o mês
  // inteiro, comportamento idêntico ao seletor antigo. Quando é custom, o
  // banner avisa que os dados ainda são do mês todo (próxima iteração:
  // filtrar pelas datas exatas).
  const periodRange = parseRangeFromSp(sp)
  const isFullMonth = rangeIsFullMonth(periodRange)
  const { year, month } = parsePeriodParam(
    `${periodRange.start.slice(0, 4)}-${periodRange.start.slice(5, 7)}`,
  )
  const unidadesFilter = sp.unidades
    ? new Set(sp.unidades.split(",").filter(Boolean))
    : null
  const plataformaFilter = ["ifood", "99food", "keeta"].includes(
    sp.plataforma ?? "",
  )
    ? (sp.plataforma as "ifood" | "99food" | "keeta")
    : null
  const onlyComFaturamento = sp.ativo === "1"
  const userCtx = await getCurrentUserContext()
  const brandLogoUrl = userCtx.logoUrl
  const primeiroNome = userCtx.fullName.split(" ")[0]
  const horaBR = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  )
  const saudacao =
    horaBR < 12 ? "Bom dia" : horaBR < 18 ? "Boa tarde" : "Boa noite"

  // Fase 1: precisa de allUnits pra resolver unidadesFilter ANTES de chamar
  // as queries de rede (que agora respeitam o filtro de unidades)
  const [status, allUnits, availablePeriods, accessibleIds] =
    await Promise.all([
      checkSupabase(),
      getVisibleUnits(),
      getAvailablePeriods(),
      getAccessibleUnitIds(),
    ])
  // accessibleIds === null → admin/gerente (vê a rede toda).
  // accessibleIds !== null → franqueado (só as lojas dele; allUnits já vem
  // pré-filtrado por getVisibleUnits).
  const isScoped = accessibleIds !== null
  const units = unidadesFilter
    ? allUnits.filter((u) => unidadesFilter.has(u.code))
    : allUnits
  const activeUnitIds = units.filter((u) => u.active).map((u) => u.id)
  // Plataformas habilitadas do tenant (só essas na cobertura) + se o sync via
  // API está ligado (SaaS: só importação manual → sem botões de Sincronizar).
  const [tenantPlatforms, apiSync] = await Promise.all([
    getTenantPlatforms(activeUnitIds),
    isApiSyncEnabled(),
  ])
  // Texto curto que descreve o escopo dos cards. Franqueado vê "sua/suas
  // loja(s)" (não "rede" — ele só enxerga as dele); admin vê "rede" ou o
  // nº de lojas filtradas.
  const activeCount = activeUnitIds.length
  const scopeLabel = unidadesFilter
    ? `${activeCount} loja${activeCount !== 1 ? "s" : ""}`
    : isScoped
      ? activeCount === 1
        ? "sua loja"
        : "suas lojas"
      : "rede"
  // Substantivo pro estado vazio do painel de atenção ("… no azul").
  const lojasNoun = isScoped
    ? activeCount === 1
      ? "sua loja"
      : "suas lojas"
    : "todas as lojas"

  // ── Escopo pros títulos (rede / 1 loja / várias) ──────────────────
  // 1 loja: SaaS de loja única OU franqueado com 1 unidade. Rede: admin sem
  // filtro. Várias: admin filtrando N ou franqueado com N lojas.
  const umaLoja = activeCount === 1
  const escopoRede = !isScoped && !unidadesFilter
  // Genitivo pro título da evolução: "da rede" / "da loja" / "das lojas".
  const daEscopo = escopoRede
    ? "da rede"
    : umaLoja
      ? "da loja"
      : "das lojas"
  // Título do painel de atenção. Rede (admin sem filtro) = genérico; senão
  // possessivo (loja única do SaaS/franqueado, ou seleção do próprio escopo).
  const tituloAtencao = escopoRede
    ? "Lojas que precisam de atenção"
    : umaLoja
      ? "Sua loja precisa de atenção"
      : "Suas lojas precisam de atenção"
  // Título do detalhamento — some o "por unidade" quando é loja única.
  const tituloDetalhe = umaLoja
    ? "Detalhamento da loja"
    : "Detalhamento por Unidade"
  // Sentinela: as network functions tratam [] como "rede inteira". Pro
  // franqueado SEM lojas visíveis, isso vazaria a rede — então mando um ID
  // impossível pra forçar resultado vazio (fail-closed).
  const NO_UNITS = ["00000000-0000-0000-0000-000000000000"]
  // - admin/gerente: filtro só quando ?unidades ativo; senão undefined (=rede).
  // - franqueado: SEMPRE restringe às lojas dele (com sentinela se vazio).
  const filterUnitIds = isScoped
    ? activeUnitIds.length > 0
      ? activeUnitIds
      : NO_UNITS
    : unidadesFilter
      ? activeUnitIds
      : undefined

  // Helper das queries de rede (funil, cancelamentos, top itens, avaliações das
  // 3 plataformas) — escopo por parâmetro, pra dar pra disparar cedo.
  const runNetwork = (scopeIds: string[] | undefined) =>
    Promise.all([
      getNetworkFunnelForMonth(year, month, scopeIds),
      getNetworkCancelamentosPorMotivo(year, month, 5, scopeIds),
      // Lista completa (limit alto) pra calcular o % que os 5 tops representam
      // do total vendido; o TopItemsList corta pros 5 na hora de exibir.
      getNetworkTopItemsForMonth(year, month, 500, scopeIds),
      getNetworkAvaliacoesForMonth(year, month, scopeIds),
      getNetworkNinefoodCancelamentosForMonth(year, month, 5, scopeIds),
      getNetworkNinefoodTopItemsForMonth(year, month, 500, scopeIds),
      getNetworkNinefoodAvaliacoesForMonth(year, month, scopeIds),
      getNetworkKeetaCancelamentosForMonth(year, month, 5, scopeIds),
      getNetworkKeetaTopItemsForMonth(year, month, 500, scopeIds),
      getNetworkKeetaAvaliacoesForMonth(year, month, scopeIds),
    ])

  // Fase 2a: resumos por unidade + cobertura + entrega.
  // Mês inteiro → caminho legado (1 chamada por plataforma).
  // Range custom → wrappers ForRange que decompõem cross-month e agregam.
  // Nota: "Precisa de atenção" virou Suspense próprio (AttentionSection).
  const fase2aP = Promise.all([
    isFullMonth
      ? getFinanceiroResumoByUnits(activeUnitIds, year, month)
      : getFinanceiroResumoByUnitsForRange(activeUnitIds, periodRange),
    isFullMonth
      ? getNinefoodResumoByUnits(activeUnitIds, year, month)
      : getNinefoodResumoByUnitsForRange(activeUnitIds, periodRange),
    isFullMonth
      ? getKeetaResumoByUnits(activeUnitIds, year, month)
      : getKeetaResumoByUnitsForRange(activeUnitIds, periodRange),
    getImportCoverageForMonth(year, month, filterUnitIds),
    isFullMonth
      ? getNetworkDeliveryFee(activeUnitIds, year, month)
      : getNetworkDeliveryFeeForRange(activeUnitIds, periodRange),
  ])

  // No caso comum (sem filtro "Com faturamento") o escopo da rede já é conhecido
  // (= filterUnitIds) → a rede roda EM PARALELO com a Fase 2a. Só o filtro "Com
  // faturamento" precisa dos resumos antes (pra saber qual loja tem pedido).
  const earlyNetworkP = onlyComFaturamento ? null : runNetwork(filterUnitIds)

  const [finByUnit, ninefoodByUnit, keetaByUnit, importCoverage, deliveryFee] =
    await fase2aP

  // Substitui unit.monthly pelos valores importados quando há dados — assim
  // a UnitsTable mostra dados reais sem precisar de prop nova.
  const unitsMerged = units.map((u) =>
    mergeUnitMonthlyForDashboard(
      u,
      finByUnit.get(u.id),
      ninefoodByUnit.get(u.id),
      keetaByUnit.get(u.id),
      plataformaFilter,
    ),
  )

  // Aplica filtro "com faturamento" (precisa de dados de unitsMerged já calculado)
  const unitsToShow = onlyComFaturamento
    ? unitsMerged.filter((u) => u.monthly.pedidos > 0)
    : unitsMerged

  // Escopo das queries de rede (funil, cancelamentos, top itens, avaliações).
  // Com "Com faturamento" ligado, restringe às lojas com pedido — senão essas
  // seções somariam TODAS as lojas do escopo e divergiriam dos KPIs/tabela.
  const networkScopeIds = onlyComFaturamento
    ? unitsToShow.length > 0
      ? unitsToShow.map((u) => u.id)
      : NO_UNITS
    : filterUnitIds

  // Fase 2b: usa o batch já disparado em paralelo (caso comum) ou dispara agora
  // com o escopo "Com faturamento" recém-calculado.
  const [
    networkFunnel,
    networkCancels,
    networkTopItems,
    networkAvaliacoes,
    networkCancels99,
    networkTopItems99,
    networkAvaliacoes99,
    networkCancelsKeeta,
    networkTopItemsKeeta,
    networkAvaliacoesKeeta,
  ] = await (earlyNetworkP ?? runNetwork(networkScopeIds))

  // Network = totais da rede MESCLADOS (do array filtrado)
  const network = networkTotalsMerged(
    unitsToShow,
    finByUnit,
    ninefoodByUnit,
    keetaByUnit,
    year,
    month,
    plataformaFilter,
  )
  const platforms = platformTotalsMerged(
    unitsToShow,
    finByUnit,
    ninefoodByUnit,
    keetaByUnit,
    plataformaFilter,
  )
  const unitsWithImported = Array.from(finByUnit.values()).filter(
    (f) => f.hasData,
  ).length
  const unitsWith99 = Array.from(ninefoodByUnit.values()).filter(
    (f) => f.hasData,
  ).length
  const unitsWithKeeta = Array.from(keetaByUnit.values()).filter(
    (f) => f.hasData,
  ).length
  const hasAnyImported =
    unitsWithImported > 0 || unitsWith99 > 0 || unitsWithKeeta > 0

  const hasFunnelData = networkFunnel.totals.visitas > 0
  const hasCancelData = networkCancels.length > 0
  const hasTopItemsData = networkTopItems.length > 0
  const hasAvaliacoesData = networkAvaliacoes.hasData
  const hasCancel99Data = networkCancels99.length > 0
  const hasTopItems99Data = networkTopItems99.length > 0
  const hasAvaliacoes99Data = networkAvaliacoes99.hasData
  const hasCancelKeetaData = networkCancelsKeeta.length > 0
  const hasTopItemsKeetaData = networkTopItemsKeeta.length > 0
  const hasAvaliacoesKeetaData = networkAvaliacoesKeeta.hasData

  // Plataformas que efetivamente alimentam os KPIs financeiros do topo.
  // Se filtro por plataforma estiver ativo, mostra só aquela.
  const finPlatforms: PlatformId[] = []
  if (plataformaFilter) {
    finPlatforms.push(plataformaFilter)
  } else {
    if (unitsWithImported > 0) finPlatforms.push("ifood")
    if (unitsWith99 > 0) finPlatforms.push("99food")
    if (unitsWithKeeta > 0) finPlatforms.push("keeta")
  }

  // Custo de entrega — total ou só da plataforma filtrada
  const taxaEntregaValor = plataformaFilter
    ? plataformaFilter === "ifood"
      ? deliveryFee.ifood
      : plataformaFilter === "99food"
        ? deliveryFee.ninefood
        : deliveryFee.keeta
    : deliveryFee.total
  const taxaEntregaPctBruto =
    network.faturamentoBruto > 0
      ? (taxaEntregaValor / network.faturamentoBruto) * 100
      : 0

  const periodQ = sp.periodo ? `?periodo=${sp.periodo}` : ""
  const cancelQ = sp.periodo
    ? `?metrica=cancelamentos&periodo=${sp.periodo}`
    : "?metrica=cancelamentos"
  const kpis: Kpi[] = [
    {
      label: "Pedidos",
      value: fmtNum(network.pedidos),
      tone: "positive",
      icon: CalendarDays,
      platforms: finPlatforms,
      href: `/pedidos${periodQ}`,
    },
    {
      label: "Pedidos Cancelados",
      value: fmtNum(network.cancelados),
      trend:
        network.pedidos > 0
          ? `${((network.cancelados / network.pedidos) * 100).toFixed(1)}% dos pedidos`
          : "sem pedidos no mês",
      tone: "neutral",
      icon: XCircle,
      platforms: finPlatforms,
      href: `/relatorio-diario${cancelQ}`,
    },
    {
      label: "Média Pedidos/Dia",
      value: fmtNum(network.mediaDia),
      tone: "positive",
      icon: CalendarDays,
      platforms: finPlatforms,
      href: `/relatorio-diario${periodQ}`,
    },
    {
      label: "Ticket Médio",
      value: fmtBRL(network.mediaTicket || 0),
      tone: "positive",
      icon: Receipt,
      platforms: finPlatforms,
      href: `/financeiro${periodQ}`,
    },
    {
      label: "Faturamento Bruto",
      value: fmtBRLShort(network.faturamentoBruto),
      tone: "positive",
      icon: DollarSign,
      platforms: finPlatforms,
      href: `/financeiro${periodQ}`,
    },
    {
      label: "Líquido pra Você",
      value: fmtBRLShort(network.faturamentoLiquido),
      tone: "positive",
      icon: DollarSign,
      platforms: finPlatforms,
      href: `/financeiro${periodQ}`,
    },
    {
      label: "Taxa de Repasse",
      value: fmtPct(network.taxaRepasse),
      trend: "Acima da média do setor (~62%)",
      tone: "positive",
      icon: Percent,
      platforms: finPlatforms,
      href: `/financeiro${periodQ}`,
    },
    {
      label: "Custo de Entrega",
      value: fmtBRLShort(taxaEntregaValor),
      trend:
        taxaEntregaValor > 0
          ? `${fmtPct(taxaEntregaPctBruto)} do faturamento bruto`
          : "sem dado de entrega no mês",
      tone: "neutral",
      icon: Bike,
      platforms: finPlatforms,
      href: `/financeiro${periodQ}`,
    },
  ]

  // Nota Média da rede = média ponderada (por nº de avaliações) das 3
  // plataformas com dado. Antes era só iFood, escondendo 99 e Keeta.
  let avalTotal = 0
  let avalSomaNotas = 0
  let avalNegativas = 0
  const avalPlatforms: PlatformId[] = []
  for (const [plat, a, has] of [
    ["ifood", networkAvaliacoes, hasAvaliacoesData],
    ["99food", networkAvaliacoes99, hasAvaliacoes99Data],
    ["keeta", networkAvaliacoesKeeta, hasAvaliacoesKeetaData],
  ] as const) {
    if (!has || a.total <= 0) continue
    avalTotal += a.total
    avalSomaNotas += a.notaMedia * a.total
    avalNegativas += a.distribucao[1] + a.distribucao[2]
    avalPlatforms.push(plat)
  }
  if (avalTotal > 0) {
    const avalNotaMedia = avalSomaNotas / avalTotal
    const negativasPct = (avalNegativas / avalTotal) * 100
    kpis.push({
      label: "Nota Média",
      value: `${avalNotaMedia.toFixed(2)} ★`,
      trend: `${avalTotal} avaliações · ${negativasPct.toFixed(1)}% negativas`,
      tone: avalNotaMedia >= 4.5 ? "positive" : "neutral",
      icon: Star,
      platforms: avalPlatforms,
      href: `/avaliacoes${periodQ}`,
    })
  }

  // Primeiros passos (onboarding guiado) — some quando os 3 passos estão feitos.
  const onboarding = await getOnboardingProgress()

  // Setas do herói: variação vs o MESMO período do mês passado (mês corrente até
  // hoje × mês passado nos mesmos dias). Só quando o filtro é um mês inteiro.
  let heroDeltas: {
    bruto: number | null
    liquido: number | null
    pedidos: number | null
    ticket: number | null
    repasse: number | null
    mediaDia: number | null
  } = {
    bruto: null,
    liquido: null,
    pedidos: null,
    ticket: null,
    repasse: null,
    mediaDia: null,
  }
  if (isFullMonth && activeUnitIds.length > 0) {
    const hojeBR = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date())
    const [hY, hM, hD] = hojeBR.split("-").map(Number)
    const ehMesCorrente = hY === year && hM === month
    const corte = ehMesCorrente ? hD : new Date(year, month, 0).getDate()
    const prevM = month === 1 ? 12 : month - 1
    const prevY = month === 1 ? year - 1 : year
    const cortePrev = Math.min(corte, new Date(prevY, prevM, 0).getDate())
    const p2 = (n: number) => String(n).padStart(2, "0")
    const [curMap, prevMap] = await Promise.all([
      getRealMonthlyForUnits(activeUnitIds, year, month, {
        start: `${year}-${p2(month)}-01`,
        end: `${year}-${p2(month)}-${p2(corte)}`,
      }),
      getRealMonthlyForUnits(activeUnitIds, prevY, prevM, {
        start: `${prevY}-${p2(prevM)}-01`,
        end: `${prevY}-${p2(prevM)}-${p2(cortePrev)}`,
      }),
    ])
    const agg = (map: Map<string, { faturamentoBruto: number; faturamentoLiquido: number; pedidos: number }>) => {
      let b = 0
      let l = 0
      let p = 0
      for (const m of map.values()) {
        b += m.faturamentoBruto
        l += m.faturamentoLiquido
        p += m.pedidos
      }
      return { b, l, p }
    }
    const c = agg(curMap)
    const pr = agg(prevMap)
    const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null)
    // Derivados do mesmo dado (sem query nova): ticket = bruto/pedidos,
    // repasse = líquido/bruto, média/dia = pedidos/dias corridos.
    const ratio = (num: number, den: number) => (den > 0 ? num / den : 0)
    heroDeltas = {
      bruto: pct(c.b, pr.b),
      liquido: pct(c.l, pr.l),
      pedidos: pct(c.p, pr.p),
      ticket: pct(ratio(c.b, c.p), ratio(pr.b, pr.p)),
      repasse: pct(ratio(c.l, c.b), ratio(pr.l, pr.b)),
      mediaDia: pct(ratio(c.p, corte), ratio(pr.p, cortePrev)),
    }
  }

  // Cobertura por plataforma nos cards: mostra as 3, apagando a que não tem
  // dado no período — dá pra ver num relance se todas entraram.
  // Só as plataformas HABILITADAS no tenant entram nos logos dos KPIs (loja
  // só-iFood não mostra 99/Keeta nem apagados).
  const finCobertura: { id: PlatformId; on: boolean }[] = plataformaFilter
    ? [{ id: plataformaFilter, on: true }]
    : (
        [
          { id: "ifood", on: unitsWithImported > 0 },
          { id: "99food", on: unitsWith99 > 0 },
          { id: "keeta", on: unitsWithKeeta > 0 },
        ] as { id: PlatformId; on: boolean }[]
      ).filter((p) => tenantPlatforms.includes(p.id))
  const avalCobertura: { id: PlatformId; on: boolean }[] = plataformaFilter
    ? [{ id: plataformaFilter, on: true }]
    : (
        [
          { id: "ifood", on: hasAvaliacoesData },
          { id: "99food", on: hasAvaliacoes99Data },
          { id: "keeta", on: hasAvaliacoesKeetaData },
        ] as { id: PlatformId; on: boolean }[]
      ).filter((p) => tenantPlatforms.includes(p.id))
  for (const k of kpis) {
    k.platformCoverage =
      k.label === "Nota Média" ? avalCobertura : finCobertura
  }

  // Primeira linha única (manchete clean): dinheiro primeiro, operação depois.
  const ORDEM_KPI = [
    "Faturamento Bruto",
    "Líquido pra Você",
    "Pedidos",
    "Nota Média",
    "Pedidos Cancelados",
    "Média Pedidos/Dia",
    "Ticket Médio",
    "Taxa de Repasse",
    "Custo de Entrega",
  ]
  const kpisOrdenados = ORDEM_KPI.map((l) =>
    kpis.find((k) => k.label === l),
  ).filter((k): k is Kpi => Boolean(k))

  // Métricas no formato limpo (HeroFaixa): cada card leva a seta ↗↘ vs mês
  // passado quando dá pra comparar; a legenda descritiva (trend) vai no sub.
  const DELTA_MANCHETE: Record<string, number | null | undefined> = {
    "Faturamento Bruto": heroDeltas.bruto,
    "Líquido pra Você": heroDeltas.liquido,
    Pedidos: heroDeltas.pedidos,
    "Ticket Médio": heroDeltas.ticket,
    "Taxa de Repasse": heroDeltas.repasse,
    "Média Pedidos/Dia": heroDeltas.mediaDia,
  }
  const SUB_MANCHETE: Record<string, string> = {
    "Líquido pra Você": "o que de fato entra",
  }
  const manchete: HeroMetric[] = kpisOrdenados.map((k) => ({
    label: k.label,
    value: k.value,
    delta: DELTA_MANCHETE[k.label],
    sub: SUB_MANCHETE[k.label] ?? k.trend,
    platformCoverage: k.platformCoverage,
  }))

  // "Pra onde vai o bruto" POR PLATAFORMA: o líquido que fica + a taxa de cada
  // plataforma, com o logo de cada uma.
  const CORES_PLAT: Record<string, string> = {
    ifood: "#EA1D2C",
    "99food": "#E0A400",
    keeta: "#0E9E96",
  }
  const liquidoRede = platforms.reduce((s, p) => s + p.liquido, 0)
  const composicaoSegmentos = [
    { nome: "Líquido pra você", valor: liquidoRede, cor: "#16A34A" },
    ...platforms
      .filter((p) => p.bruto - p.liquido > 0)
      .map((p) => ({
        nome: `Taxas ${p.name}`,
        valor: p.bruto - p.liquido,
        cor: CORES_PLAT[p.id] ?? "#94A3B8",
        plat: p.id,
      })),
  ]
  const brutoComposicao =
    liquidoRede +
    platforms.reduce((s, p) => s + Math.max(0, p.bruto - p.liquido), 0)

  return (
    <div data-dashboard-root className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {saudacao}, {primeiroNome} 👋
          </p>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <DashboardTour />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {unidadesFilter
              ? `${activeCount} loja${activeCount !== 1 ? "s" : ""} selecionada${activeCount !== 1 ? "s" : ""}`
              : isScoped
                ? activeCount === 1
                  ? "Sua loja"
                  : "Suas lojas"
                : "Visão da rede"}{" "}
            · {formatRangeLabel(periodRange)}
          </p>
        </div>
        <div data-tour="db-filtros" className="flex flex-wrap items-center gap-2">
          <PeriodSelector
            current={periodRange}
            options={availablePeriods}
            enableRange
          />
          <DashboardFilters
            unitOptions={allUnits
              .filter((u) => u.active)
              .map((u) => ({ code: u.code, name: u.name }))}
            ativo={onlyComFaturamento}
            unidadesSelected={
              unidadesFilter ? Array.from(unidadesFilter) : []
            }
            plataformaSelected={plataformaFilter}
          />
        </div>
      </div>

      {onboarding && onboarding.done < onboarding.total && (
        <OnboardingChecklist progress={onboarding} />
      )}

      {!isFullMonth && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          <span>
            Período personalizado <strong>{formatRangeLabel(periodRange)}</strong> — KPIs (bruto, líquido, pedidos, ticket médio, taxa de repasse, custo de entrega) já <strong>filtram por dia</strong>. <span className="opacity-70">Funil, top itens, avaliações, &quot;Precisa de atenção&quot; e CMV continuam do mês inteiro ({formatPeriodLabel({ year, month })}).</span>
          </span>
        </div>
      )}

      {status.ok ? (
        <ImportCoverageBanner
          coverage={importCoverage}
          year={year}
          month={month}
          periodLabel={formatPeriodLabel({ year, month })}
          platformsEnabled={tenantPlatforms}
          apiSync={apiSync}
        />
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          <span className="size-2 rounded-full bg-rose-500" />
          <span className="font-medium">{status.message}</span>
        </div>
      )}

      {/* LINHA 1: os 9 números juntos (manchete + operação), cada card com os
          logos das 3 plataformas (apagadas as sem dado). */}
      {status.ok && allUnits.length > 0 && (
        <DashboardSection id="kpis">
          <div className="flex items-center justify-between gap-3">
            <SectionDivider number={1} label="Performance da Operação" />
            {hasAnyImported && (
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <Sparkles className="size-3" />
                  {unitsWithImported}/{activeCount} iFood
                </span>
                {unitsWith99 > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                    <Sparkles className="size-3" />
                    {unitsWith99}/{activeCount} 99 Food
                  </span>
                )}
                {unitsWithKeeta > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-lime-100 px-2.5 py-1 text-[10px] font-semibold text-lime-800 dark:bg-lime-950/40 dark:text-lime-400">
                    <Sparkles className="size-3" />
                    {unitsWithKeeta}/{activeCount} Keeta
                  </span>
                )}
              </div>
            )}
          </div>
          <div data-tour="db-kpis" className="flex flex-col gap-3">
            {/* Linha 1: os 4 do topo (dinheiro), maiores. */}
            <HeroFaixa metrics={manchete.slice(0, 4)} cols={4} big />
            {/* Linha 2: os 5 de operação. */}
            <HeroFaixa metrics={manchete.slice(4)} cols={5} />
          </div>
        </DashboardSection>
      )}

      {/* LINHA 2: evolução da rede + pra onde vai o bruto, lado a lado. */}
      {status.ok && allUnits.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <Suspense fallback={<EvolucaoFaturamentoSkeleton />}>
            <EvolucaoFaturamento
              unitIds={activeUnitIds}
              year={year}
              month={month}
              metricas={["faturamento", "ticket", "pedidos"]}
              escopo={daEscopo}
            />
          </Suspense>
          <ComposicaoBruto
            bruto={brutoComposicao}
            segmentos={composicaoSegmentos}
          />
        </div>
      )}

      {status.ok && units.length > 0 && (
        <DashboardSection id="atencao">
          <Suspense fallback={<AttentionSkeleton />}>
            <AttentionSection
              units={units}
              year={year}
              month={month}
              lojasLabel={lojasNoun}
              title={tituloAtencao}
            />
          </Suspense>
        </DashboardSection>
      )}

      {allUnits.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">Nenhuma unidade cadastrada ainda</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Vai em Unidades no menu lateral e clica em &quot;+ Nova Unidade&quot;
            pra cadastrar suas lojas.
          </p>
        </div>
      ) : (
        <>
          <DashboardSection id="plataformas">
          <SectionDivider
            number={2}
            label={`Visão Geral por Plataforma (${scopeLabel})`}
          />
          <div data-tour="db-plataformas" className="grid gap-3 md:grid-cols-3">
            {platforms
              .filter((p) => tenantPlatforms.includes(p.id))
              .map((p) => {
              const taxa = Math.max(0, p.bruto - p.liquido)
              const pctTaxa = Math.max(0, 100 - p.pctLoja)
              return (
                <div
                  key={p.id}
                  className="rounded-lg border bg-card px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <PlatformLogo platform={p.id} size="md" />
                      <span className="text-sm font-semibold">{p.name}</span>
                    </div>
                    <div className="text-right leading-none">
                      <span className="text-sm font-bold tabular-nums">
                        {fmtBRLShort(p.bruto)}
                      </span>
                      <span className="mt-0.5 block text-[10px] uppercase tracking-wider text-muted-foreground">
                        bruto
                      </span>
                    </div>
                  </div>
                  {p.bruto > 0 ? (
                    <>
                      <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="bg-emerald-500"
                          style={{ width: `${p.pctLoja}%` }}
                          title={`Líquido pra loja: ${fmtPct(p.pctLoja)} · ${fmtBRLShort(p.liquido)}`}
                        />
                        <div
                          className="bg-slate-500 dark:bg-slate-600"
                          style={{ width: `${pctTaxa}%` }}
                          title={`Taxa ${p.name}: ${fmtPct(pctTaxa)} · ${fmtBRLShort(taxa)}`}
                        />
                      </div>
                      <div className="mt-1.5 flex items-baseline justify-between text-[11px] tabular-nums leading-tight">
                        <span className="text-emerald-700 dark:text-emerald-400">
                          <span className="font-bold">{fmtPct(p.pctLoja)}</span>{" "}
                          líquido{" "}
                          <span className="text-muted-foreground">
                            {fmtBRLShort(p.liquido)}
                          </span>
                        </span>
                        <span className="text-slate-700 dark:text-slate-400">
                          taxa{" "}
                          <span className="font-bold">{fmtBRLShort(taxa)}</span>
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Sem movimento no mês
                    </p>
                  )}
                </div>
              )
            })}
          </div>
          </DashboardSection>

          {(hasFunnelData ||
            hasCancelData ||
            hasTopItemsData ||
            hasCancel99Data ||
            hasTopItems99Data ||
            hasCancelKeetaData ||
            hasTopItemsKeetaData) && (
            <DashboardSection id="cardapio">
              <SectionDivider
                number={3}
                label={`Cardápio & Cancelamentos (${scopeLabel})`}
              />
              <div className="grid gap-4 lg:grid-cols-3">
                {/* Funil — iFood-only */}
                <PlatformTabbedCard
                  title={`Funil de conversão · ${scopeLabel}`}
                  slots={[
                    {
                      platform: "ifood",
                      empty: !hasFunnelData,
                      content: hasFunnelData ? (
                        <>
                          {/* Hero no topo, alinhado com "Perda no mês" e
                              "Os 5 mais vendidos" dos cards vizinhos. */}
                          <div className="mb-3 rounded-md bg-emerald-50 px-3 py-2 dark:bg-emerald-950/30">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700/70 dark:text-emerald-400/70">
                              Conversão {unidadesFilter ? "filtrada" : daEscopo}
                            </p>
                            <div className="flex items-baseline gap-2">
                              <span className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                                {fmtPct(networkFunnel.totals.conversaoPct)}
                              </span>
                              <span className="text-[11px] tabular-nums text-muted-foreground">
                                · {fmtNum(networkFunnel.totals.concluidos)}{" "}
                                pedidos
                              </span>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <FunnelBar
                              label="Visitas"
                              value={networkFunnel.totals.visitas}
                              base={networkFunnel.totals.visitas}
                              color="bg-blue-500"
                            />
                            <FunnelBar
                              label="Visualizações"
                              value={networkFunnel.totals.visualizacoes}
                              base={networkFunnel.totals.visitas}
                              color="bg-indigo-500"
                            />
                            <FunnelBar
                              label="Sacola"
                              value={networkFunnel.totals.sacola}
                              base={networkFunnel.totals.visitas}
                              color="bg-violet-500"
                            />
                            <FunnelBar
                              label="Concluídos"
                              value={networkFunnel.totals.concluidos}
                              base={networkFunnel.totals.visitas}
                              color="bg-emerald-500"
                              emphasis
                            />
                          </div>
                        </>
                      ) : (
                        <p className="py-6 text-center text-xs text-muted-foreground">
                          Sem Cardápio iFood neste mês
                        </p>
                      ),
                    },
                    // 99 e Keeta entram como abas pra manter o padrão visual
                    // dos cards vizinhos (pedido do Marcus) — mas o funil de
                    // visitas→pedido só existe no relatório do iFood; as
                    // outras plataformas não expõem esse dado.
                    ...(unitsWith99 > 0
                      ? [
                          {
                            platform: "99food" as const,
                            empty: true,
                            content: (
                              <p className="py-6 text-center text-xs text-muted-foreground">
                                O 99 Food não expõe o funil de conversão
                                (visitas → pedido) nos relatórios da loja.
                              </p>
                            ),
                          },
                        ]
                      : []),
                    ...(unitsWithKeeta > 0
                      ? [
                          {
                            platform: "keeta" as const,
                            empty: true,
                            content: (
                              <p className="py-6 text-center text-xs text-muted-foreground">
                                A Keeta não expõe o funil de conversão
                                (visitas → pedido) nos relatórios da loja.
                              </p>
                            ),
                          },
                        ]
                      : []),
                  ]}
                />

                {/* Top cancelamentos — iFood + 99 com switcher */}
                <PlatformTabbedCard
                  title={`Top cancelamentos · ${scopeLabel}`}
                  icon={
                    <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                  }
                  slots={[
                    {
                      platform: "ifood",
                      empty: !hasCancelData,
                      content: hasCancelData ? (
                        <CancelList
                          items={networkCancels.map((c) => ({
                            motivo: c.motivo,
                            pedidos: c.pedidos,
                            perda: c.perdaFinanceira,
                          }))}
                        />
                      ) : (
                        <EmptyMsg text="Sem Financeiro iFood neste mês" />
                      ),
                    },
                    ...(unitsWith99 > 0
                      ? [
                          {
                            platform: "99food" as const,
                            empty: !hasCancel99Data,
                            content: hasCancel99Data ? (
                              <CancelList
                                items={networkCancels99.map((c) => ({
                                  motivo: c.motivo,
                                  pedidos: c.pedidos,
                                  perda: c.perdaFinanceira,
                                }))}
                              />
                            ) : (
                              <EmptyMsg text="Sem cancelamentos 99 Food neste mês" />
                            ),
                          },
                        ]
                      : []),
                    ...(unitsWithKeeta > 0
                      ? [
                          {
                            platform: "keeta" as const,
                            empty: !hasCancelKeetaData,
                            content: hasCancelKeetaData ? (
                              <CancelList
                                items={networkCancelsKeeta.map((c) => ({
                                  motivo: c.motivo,
                                  pedidos: c.pedidos,
                                  perda: c.perdaFinanceira,
                                }))}
                              />
                            ) : (
                              <EmptyMsg text="Sem cancelamentos Keeta neste mês" />
                            ),
                          },
                        ]
                      : []),
                  ]}
                />

                {/* Top produtos — iFood + 99 com switcher */}
                <PlatformTabbedCard
                  title={`Top produtos · ${scopeLabel}`}
                  icon={
                    <Package className="size-4 shrink-0 text-emerald-600" />
                  }
                  slots={[
                    {
                      platform: "ifood",
                      empty: !hasTopItemsData,
                      content: hasTopItemsData ? (
                        <TopItemsList
                          items={networkTopItems.map((it) => ({
                            nomeItem: it.nomeItem,
                            qtdVendida: it.qtdVendida,
                            valorTotal: it.valorTotal,
                          }))}
                        />
                      ) : (
                        <EmptyMsg text="Sem Cardápio iFood neste mês" />
                      ),
                    },
                    ...(unitsWith99 > 0
                      ? [
                          {
                            platform: "99food" as const,
                            empty: !hasTopItems99Data,
                            content: hasTopItems99Data ? (
                              <TopItemsList items={networkTopItems99} />
                            ) : (
                              <EmptyMsg text="Sem Cardápio 99 Food neste mês" />
                            ),
                          },
                        ]
                      : []),
                    ...(unitsWithKeeta > 0
                      ? [
                          {
                            platform: "keeta" as const,
                            empty: !hasTopItemsKeetaData,
                            content: hasTopItemsKeetaData ? (
                              <TopItemsList items={networkTopItemsKeeta} />
                            ) : (
                              <EmptyMsg text="Sem Cardápio Keeta neste mês" />
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              </div>
            </DashboardSection>
          )}

          {(hasAvaliacoesData ||
            hasAvaliacoes99Data ||
            hasAvaliacoesKeetaData) && (
            <DashboardSection id="satisfacao">
              <SectionDivider
                number={4}
                label={`Satisfação dos clientes (${scopeLabel})`}
              />
              <div className="grid gap-4 lg:grid-cols-3">
                {/* Avaliações — distribuição das notas 1-5 */}
                <PlatformTabbedCard
                  title="Avaliações"
                  slots={[
                    {
                      platform: "ifood",
                      empty: !hasAvaliacoesData,
                      content: hasAvaliacoesData ? (
                        <NotasDistribuicao
                          total={networkAvaliacoes.total}
                          distribucao={networkAvaliacoes.distribucao}
                        />
                      ) : (
                        <EmptyMsg text="Sem avaliações iFood neste mês" />
                      ),
                    },
                    ...(unitsWith99 > 0
                      ? [
                          {
                            platform: "99food" as const,
                            empty: !hasAvaliacoes99Data,
                            content: hasAvaliacoes99Data ? (
                              <NotasDistribuicao
                                total={networkAvaliacoes99.total}
                                distribucao={networkAvaliacoes99.distribucao}
                              />
                            ) : (
                              <EmptyMsg text="Sem avaliações 99 Food neste mês" />
                            ),
                          },
                        ]
                      : []),
                    ...(unitsWithKeeta > 0
                      ? [
                          {
                            platform: "keeta" as const,
                            empty: !hasAvaliacoesKeetaData,
                            content: hasAvaliacoesKeetaData ? (
                              <NotasDistribuicao
                                total={networkAvaliacoesKeeta.total}
                                distribucao={networkAvaliacoesKeeta.distribucao}
                              />
                            ) : (
                              <EmptyMsg text="Sem avaliações Keeta neste mês" />
                            ),
                          },
                        ]
                      : []),
                  ]}
                />

                {/* O que elogiam */}
                <PlatformTabbedCard
                  title="O que elogiam"
                  icon={
                    <ThumbsUp className="size-4 shrink-0 text-emerald-600" />
                  }
                  slots={[
                    {
                      platform: "ifood",
                      empty: !hasAvaliacoesData,
                      content: hasAvaliacoesData ? (
                        <TagsList
                          tags={networkAvaliacoes.topTagsPositivas}
                          total={networkAvaliacoes.total}
                          color="emerald"
                          emptyText="Sem tags positivas registradas"
                        />
                      ) : (
                        <EmptyMsg text="Sem avaliações iFood neste mês" />
                      ),
                    },
                    ...(unitsWith99 > 0
                      ? [
                          {
                            platform: "99food" as const,
                            empty: !hasAvaliacoes99Data,
                            content: hasAvaliacoes99Data ? (
                              <TagsList
                                tags={networkAvaliacoes99.topTagsPositivas}
                                total={networkAvaliacoes99.total}
                                color="emerald"
                                emptyText="Sem tags positivas registradas"
                              />
                            ) : (
                              <EmptyMsg text="Sem avaliações 99 Food neste mês" />
                            ),
                          },
                        ]
                      : []),
                    ...(unitsWithKeeta > 0
                      ? [
                          {
                            platform: "keeta" as const,
                            empty: !hasAvaliacoesKeetaData,
                            content: hasAvaliacoesKeetaData ? (
                              <EmptyMsg text="O Keeta não classifica avaliações por tags — veja as notas e os comentários." />
                            ) : (
                              <EmptyMsg text="Sem avaliações Keeta neste mês" />
                            ),
                          },
                        ]
                      : []),
                  ]}
                />

                {/* O que reclamam */}
                <PlatformTabbedCard
                  title="O que reclamam"
                  icon={
                    <ThumbsDown className="size-4 shrink-0 text-rose-600" />
                  }
                  slots={[
                    {
                      platform: "ifood",
                      empty: !hasAvaliacoesData,
                      content: hasAvaliacoesData ? (
                        <TagsList
                          tags={networkAvaliacoes.topTagsNegativas}
                          total={networkAvaliacoes.total}
                          color="rose"
                          emptyText="🎉 Nenhuma reclamação no mês"
                        />
                      ) : (
                        <EmptyMsg text="Sem avaliações iFood neste mês" />
                      ),
                    },
                    ...(unitsWith99 > 0
                      ? [
                          {
                            platform: "99food" as const,
                            empty: !hasAvaliacoes99Data,
                            content: hasAvaliacoes99Data ? (
                              <TagsList
                                tags={networkAvaliacoes99.topTagsNegativas}
                                total={networkAvaliacoes99.total}
                                color="rose"
                                emptyText="🎉 Nenhuma reclamação no mês"
                              />
                            ) : (
                              <EmptyMsg text="Sem avaliações 99 Food neste mês" />
                            ),
                          },
                        ]
                      : []),
                    ...(unitsWithKeeta > 0
                      ? [
                          {
                            platform: "keeta" as const,
                            empty: !hasAvaliacoesKeetaData,
                            content: hasAvaliacoesKeetaData ? (
                              <EmptyMsg text="O Keeta não classifica avaliações por tags — veja as notas e os comentários." />
                            ) : (
                              <EmptyMsg text="Sem avaliações Keeta neste mês" />
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              </div>

              {/* Últimos comentários — merged iFood + 99 ordenado por data */}
              {(() => {
                type ComentarioMerged = {
                  id: string
                  platform: PlatformId
                  unitCode: string
                  unitName: string
                  nota: number
                  comentario: string
                  data: string
                  pedidoIdCurto: string | null
                }
                const merged: ComentarioMerged[] = [
                  ...networkAvaliacoes.ultimosComentarios.map((c) => ({
                    id: "ifood-" + c.id,
                    platform: "ifood" as const,
                    unitCode: c.unitCode,
                    unitName: c.unitName,
                    nota: c.nota,
                    comentario: c.comentario,
                    data: c.data,
                    pedidoIdCurto: c.pedidoIdCurto,
                  })),
                  ...networkAvaliacoes99.ultimosComentarios.map((c) => ({
                    id: "99food-" + c.id,
                    platform: "99food" as const,
                    unitCode: c.unitCode,
                    unitName: c.unitName,
                    nota: c.nota,
                    comentario: c.comentario,
                    data: c.data,
                    pedidoIdCurto: c.pedidoIdCurto,
                  })),
                  ...networkAvaliacoesKeeta.ultimosComentarios.map((c) => ({
                    id: c.id,
                    platform: "keeta" as const,
                    unitCode: c.unitCode,
                    unitName: c.unitName,
                    nota: c.nota,
                    comentario: c.comentario,
                    data: c.data,
                    pedidoIdCurto: c.pedidoIdCurto,
                  })),
                ]
                  .sort((a, b) => (a.data > b.data ? -1 : 1))
                  .slice(0, 5)
                if (merged.length === 0) return null
                return (
                  <div className="rounded-xl border bg-card overflow-hidden">
                    <div className="flex items-center gap-2 border-b px-4 py-2">
                      <MessageCircle className="size-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">
                        Últimos comentários
                      </h3>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        iFood + 99 Food + Keeta · ordenado por data
                      </span>
                    </div>
                    <div className="divide-y">
                      {merged.map((c) => (
                        <div key={c.id} className="px-4 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <PlatformLogo
                                platform={c.platform}
                                size="sm"
                              />
                              <div className="flex items-center gap-0.5">
                                {[1, 2, 3, 4, 5].map((i) => (
                                  <Star
                                    key={i}
                                    className={`size-3 ${
                                      i <= c.nota
                                        ? "fill-amber-400 stroke-amber-400"
                                        : "stroke-muted-foreground/40"
                                    }`}
                                  />
                                ))}
                              </div>
                              <span className="text-[11px] font-medium text-muted-foreground">
                                #{c.unitCode} {c.unitName}
                              </span>
                              {c.pedidoIdCurto && (
                                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                  #{c.pedidoIdCurto}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {new Date(
                                c.data + "T00:00:00",
                              ).toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "short",
                              })}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[13px] italic text-foreground/90 line-clamp-1">
                            &ldquo;{c.comentario}&rdquo;
                          </p>
                        </div>
                      ))}
                    </div>
                    <Link
                      href={`/avaliacoes${periodQ}`}
                      className="flex items-center justify-center gap-1 border-t px-4 py-2.5 text-xs font-medium text-primary transition-colors hover:bg-muted/50"
                    >
                      Ver mais avaliações
                      <ChevronRight className="size-3.5" />
                    </Link>
                  </div>
                )
              })()}
            </DashboardSection>
          )}

          <DashboardSection id="unidades">
            <SectionDivider
              number={hasAvaliacoesData ? 5 : 4}
              label={tituloDetalhe}
            />
            {/* 1 loja: ranking não faz sentido → mostra o detalhe direto. Várias:
                ranking clicável que já carrega o detalhe da loja selecionada. */}
            <div data-tour="db-lojas">
              {umaLoja && unitsToShow[0] ? (
                <DetalheLoja
                  unit={unitsToShow[0]}
                  brandLogoUrl={brandLogoUrl}
                />
              ) : (
                <RankingDetalhado
                  units={unitsToShow}
                  brandLogoUrl={brandLogoUrl}
                />
              )}
            </div>
          </DashboardSection>
        </>
      )}
    </div>
  )
}

// ─── Network merging (manual + importado) ───────────────────────────

type FinResumo = ReturnType<
  typeof getFinanceiroResumoByUnits
> extends Promise<Map<string, infer T>>
  ? T
  : never

type NinefoodResumoT = ReturnType<
  typeof getNinefoodResumoByUnits
> extends Promise<Map<string, infer T>>
  ? T
  : never

type KeetaResumoT = ReturnType<
  typeof getKeetaResumoByUnits
> extends Promise<Map<string, infer T>>
  ? T
  : never

function networkTotalsMerged(
  units: Awaited<ReturnType<typeof getVisibleUnits>>,
  finByUnit: Map<string, FinResumo>,
  ninefoodByUnit: Map<string, NinefoodResumoT>,
  keetaByUnit: Map<string, KeetaResumoT>,
  year: number,
  month: number,
  platformFilter?: "ifood" | "99food" | "keeta" | null,
) {
  const active = units.filter((u) => u.active)
  let pedidos = 0
  let bruto = 0
  let liquido = 0
  let cancelados = 0
  for (const u of active) {
    if (platformFilter) {
      // iFood: prefere importado se houver
      if (platformFilter === "ifood") {
        const imp = finByUnit.get(u.id)
        if (imp?.hasData) {
          pedidos += imp.pedidosUnicos
          bruto += imp.bruto
          liquido += imp.liquido
          cancelados += imp.cancelamentoTotalQtd + imp.cancelamentoParcialQtd
        } else {
          const p = u.monthly.platforms.find((p) => p.id === "ifood")
          if (p) {
            bruto += p.bruto
            liquido += p.liquido
          }
        }
        continue
      }
      // 99 Food: prefere importado se houver
      if (platformFilter === "99food") {
        const imp = ninefoodByUnit.get(u.id)
        if (imp?.hasData) {
          pedidos += imp.pedidos
          bruto += imp.bruto
          liquido += imp.liquido
          cancelados += imp.cancelamentosQtd
        } else {
          const p = u.monthly.platforms.find((p) => p.id === "99food")
          if (p) {
            bruto += p.bruto
            liquido += p.liquido
          }
        }
        continue
      }
      // Keeta: prefere importado se houver
      if (platformFilter === "keeta") {
        const imp = keetaByUnit.get(u.id)
        if (imp?.hasData) {
          pedidos += imp.pedidos
          bruto += imp.bruto
          liquido += imp.liquido
          cancelados += imp.cancelamentosQtd
        } else {
          const p = u.monthly.platforms.find((p) => p.id === "keeta")
          if (p) {
            bruto += p.bruto
            liquido += p.liquido
          }
        }
      }
      continue
    }
    // Sem filtro de plataforma → soma iFood + 99 Food + Keeta
    const ifoodImp = finByUnit.get(u.id)
    const nineImp = ninefoodByUnit.get(u.id)
    const keetaImp = keetaByUnit.get(u.id)

    if (ifoodImp?.hasData) {
      pedidos += ifoodImp.pedidosUnicos
      bruto += ifoodImp.bruto
      liquido += ifoodImp.liquido
      cancelados += ifoodImp.cancelamentoTotalQtd + ifoodImp.cancelamentoParcialQtd
    }
    if (nineImp?.hasData) {
      pedidos += nineImp.pedidos
      bruto += nineImp.bruto
      liquido += nineImp.liquido
      cancelados += nineImp.cancelamentosQtd
    }
    if (keetaImp?.hasData) {
      pedidos += keetaImp.pedidos
      bruto += keetaImp.bruto
      liquido += keetaImp.liquido
      cancelados += keetaImp.cancelamentosQtd
    }
    // Fallback pro monthly manual SE nenhuma plataforma trouxe dados
    if (!ifoodImp?.hasData && !nineImp?.hasData && !keetaImp?.hasData) {
      pedidos += u.monthly.pedidos
      bruto += u.monthly.faturamentoBruto
      liquido += u.monthly.faturamentoLiquido
      cancelados += u.monthly.pedidosCancelados ?? 0
    }
  }
  const mediaTicket = pedidos > 0 ? bruto / pedidos : 0
  // Denominador = dias do mês selecionado (mês corrente = dias decorridos),
  // não 30 fixo — senão fev e o mês corrente parcial saem errados.
  const mediaDia = Math.round(pedidos / daysElapsedInMonth({ year, month }))
  const taxaRepasse = bruto > 0 ? (liquido / bruto) * 100 : 0
  return {
    pedidos,
    mediaDia,
    faturamentoBruto: bruto,
    faturamentoLiquido: liquido,
    totalLiquido: liquido,
    mediaTicket,
    taxaRepasse,
    cancelados,
  }
}

/**
 * Quando há dados importados (iFood ou 99 Food) pra essa unidade,
 * sobrescreve unit.monthly com os valores reais — assim UnitsTable
 * mostra o certo sem trocar a API.
 */
function mergeUnitMonthlyForDashboard(
  u: Awaited<ReturnType<typeof getVisibleUnits>>[number],
  fin: FinResumo | undefined,
  nine: NinefoodResumoT | undefined,
  keeta: KeetaResumoT | undefined,
  platformFilter?: "ifood" | "99food" | "keeta" | null,
): Awaited<ReturnType<typeof getVisibleUnits>>[number] {
  const hasIfood = fin?.hasData ?? false
  const has99 = nine?.hasData ?? false
  const hasKeeta = keeta?.hasData ?? false
  // Com filtro de plataforma, os TOTAIS da unidade (tabela) somam só a
  // plataforma escolhida — pra bater com os KPIs do topo. A barra de
  // plataformas (platforms[]) continua mostrando todas com valores reais.
  const want = (id: "ifood" | "99food" | "keeta") =>
    !platformFilter || platformFilter === id
  if (!hasIfood && !has99 && !hasKeeta && !platformFilter) return u

  // Constrói novos valores por plataforma
  const platforms = u.monthly.platforms.map((p) => {
    if (p.id === "ifood" && hasIfood) {
      const ifoodPctLoja = fin!.bruto > 0 ? (fin!.liquido / fin!.bruto) * 100 : 0
      return {
        ...p,
        bruto: fin!.bruto,
        liquido: fin!.liquido,
        pctLoja: ifoodPctLoja,
      }
    }
    if (p.id === "99food" && has99) {
      return {
        ...p,
        bruto: nine!.bruto,
        liquido: nine!.liquido,
        pctLoja: nine!.pctLoja,
      }
    }
    if (p.id === "keeta" && hasKeeta) {
      return {
        ...p,
        bruto: keeta!.bruto,
        liquido: keeta!.liquido,
        pctLoja: keeta!.pctLoja,
      }
    }
    return p
  })

  // Totais da unidade = soma das plataformas com dados reais + manuais das demais
  let totalPedidos = 0
  let totalBruto = 0
  let totalLiquido = 0
  let totalCancelados = 0
  if (want("ifood")) {
    if (hasIfood) {
      totalPedidos += fin!.pedidosUnicos
      totalBruto += fin!.bruto
      totalLiquido += fin!.liquido
      totalCancelados += fin!.cancelamentoTotalQtd + fin!.cancelamentoParcialQtd
    } else {
      const p = u.monthly.platforms.find((p) => p.id === "ifood")
      if (p) {
        totalBruto += p.bruto
        totalLiquido += p.liquido
      }
    }
  }
  if (want("99food")) {
    if (has99) {
      totalPedidos += nine!.pedidos
      totalBruto += nine!.bruto
      totalLiquido += nine!.liquido
      totalCancelados += nine!.cancelamentosQtd
    } else {
      const p = u.monthly.platforms.find((p) => p.id === "99food")
      if (p) {
        totalBruto += p.bruto
        totalLiquido += p.liquido
      }
    }
  }
  if (want("keeta")) {
    if (hasKeeta) {
      totalPedidos += keeta!.pedidos
      totalBruto += keeta!.bruto
      totalLiquido += keeta!.liquido
      totalCancelados += keeta!.cancelamentosQtd
    } else {
      const pKeeta = u.monthly.platforms.find((p) => p.id === "keeta")
      if (pKeeta) {
        totalBruto += pKeeta.bruto
        totalLiquido += pKeeta.liquido
      }
    }
  }

  const ticket = totalPedidos > 0 ? totalBruto / totalPedidos : 0
  return {
    ...u,
    monthly: {
      ...u.monthly,
      pedidos: totalPedidos,
      pedidosCancelados: totalCancelados,
      ticketMedio: ticket,
      faturamentoBruto: totalBruto,
      faturamentoLiquido: totalLiquido,
      totalLiquido: totalLiquido,
      platforms,
    },
  }
}

function platformTotalsMerged(
  units: Awaited<ReturnType<typeof getVisibleUnits>>,
  finByUnit: Map<string, FinResumo>,
  ninefoodByUnit: Map<string, NinefoodResumoT>,
  keetaByUnit: Map<string, KeetaResumoT>,
  platformFilter?: "ifood" | "99food" | "keeta" | null,
) {
  const all = ["ifood", "99food", "keeta"] as const
  // Com filtro de plataforma, a seção 2 mostra só a plataforma escolhida —
  // coerente com os KPIs do topo.
  const ids = platformFilter ? all.filter((x) => x === platformFilter) : all
  return ids.map((id) => {
    const name = id === "ifood" ? "iFood" : id === "99food" ? "99 Food" : "Keeta"
    let bruto = 0
    let liquido = 0
    for (const u of units.filter((x) => x.active)) {
      if (id === "ifood") {
        const imp = finByUnit.get(u.id)
        if (imp?.hasData) {
          bruto += imp.bruto
          liquido += imp.liquido
        } else {
          const p = u.monthly.platforms.find((p) => p.id === id)
          bruto += p?.bruto ?? 0
          liquido += p?.liquido ?? 0
        }
        continue
      }
      if (id === "99food") {
        const imp = ninefoodByUnit.get(u.id)
        if (imp?.hasData) {
          bruto += imp.bruto
          liquido += imp.liquido
        } else {
          const p = u.monthly.platforms.find((p) => p.id === id)
          bruto += p?.bruto ?? 0
          liquido += p?.liquido ?? 0
        }
        continue
      }
      // Keeta: prefere importado se houver
      const imp = keetaByUnit.get(u.id)
      if (imp?.hasData) {
        bruto += imp.bruto
        liquido += imp.liquido
      } else {
        const p = u.monthly.platforms.find((p) => p.id === id)
        bruto += p?.bruto ?? 0
        liquido += p?.liquido ?? 0
      }
    }
    const pctLoja = bruto > 0 ? (liquido / bruto) * 100 : 0
    return { id, name, bruto, liquido, pctLoja }
  })
}

function FunnelBar({
  label,
  value,
  base,
  color,
  emphasis,
}: {
  label: string
  value: number
  base: number
  color: string
  emphasis?: boolean
}) {
  const pct = base > 0 ? (value / base) * 100 : 0
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between">
        <span
          className={`text-xs ${emphasis ? "font-semibold" : "text-muted-foreground"}`}
        >
          {label}
        </span>
        <div className="flex items-baseline gap-2 tabular-nums">
          <span className="text-sm font-bold">{fmtNum(value)}</span>
          <span className="text-[10px] text-muted-foreground">
            {pct.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${color}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  )
}

/** Mensagem de empty state padronizada (centralizada + pequena) */
function EmptyMsg({ text }: { text: string }) {
  return (
    <p className="py-6 text-center text-xs text-muted-foreground">{text}</p>
  )
}

/** Lista compartilhada de cancelamentos (iFood ou 99 Food).
 *  Mesmo formato pra uniformidade visual entre as plataformas. */
function CancelList({
  items,
}: {
  items: Array<{ motivo: string; pedidos: number; perda: number }>
}) {
  // Hero da perda (número acionável) + lista de motivos por perda R$. A perda
  // vem negativa do dado → usa o módulo.
  const ordenado = [...items].sort(
    (a, b) => Math.abs(b.perda) - Math.abs(a.perda),
  )
  const totalPerda = ordenado.reduce((s, c) => s + Math.abs(c.perda), 0)
  const totalCancel = ordenado.reduce((s, c) => s + c.pedidos, 0)
  return (
    <div>
      <div className="mb-3 rounded-md bg-rose-50 px-3 py-2 dark:bg-rose-950/30">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-700/70 dark:text-rose-400/70">
          Perda no mês
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold tabular-nums text-rose-700 dark:text-rose-400">
            −{fmtBRL(totalPerda)}
          </span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            · {fmtNum(totalCancel)} cancel.
          </span>
        </div>
      </div>
      <div className="space-y-2">
        {ordenado.map((c, idx) => (
          <div key={c.motivo} className="flex items-center gap-2">
            <span className="w-3.5 shrink-0 text-right text-[10px] font-bold tabular-nums text-muted-foreground">
              {idx + 1}
            </span>
            <p className="min-w-0 flex-1 line-clamp-1 text-xs font-medium">
              {c.motivo}
            </p>
            <span className="shrink-0 text-[11px] font-bold tabular-nums text-rose-700 dark:text-rose-400">
              −{fmtBRL(Math.abs(c.perda))}
            </span>
            <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
              {fmtNum(c.pedidos)}×
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Distribuição das notas 1-5 com barras coloridas */
function NotasDistribuicao({
  total,
  distribucao,
}: {
  total: number
  distribucao: Record<1 | 2 | 3 | 4 | 5, number>
}) {
  return (
    <div className="space-y-2">
      {([5, 4, 3, 2, 1] as const).map((n) => {
        const count = distribucao[n]
        const pct = total > 0 ? (count / total) * 100 : 0
        const color =
          n >= 4
            ? "bg-emerald-500"
            : n === 3
              ? "bg-amber-500"
              : "bg-rose-500"
        return (
          <div key={n} className="flex items-center gap-2">
            <div className="flex w-10 items-center gap-0.5 text-xs font-semibold tabular-nums">
              {n}
              <Star className="size-3 fill-amber-400 stroke-amber-400" />
            </div>
            <div className="flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-2 ${color}`}
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
            <span className="w-16 text-right text-xs tabular-nums">
              <span className="font-semibold">{fmtNum(count)}</span>
              <span className="ml-1 text-[10px] text-muted-foreground">
                ({pct.toFixed(0)}%)
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Lista de tags (positivas ou negativas) com barrinha */
function TagsList({
  tags,
  total,
  color,
  emptyText,
}: {
  tags: Array<{ tag: string; count: number }>
  total: number
  color: "emerald" | "rose"
  emptyText: React.ReactNode
}) {
  if (tags.length === 0) {
    return (
      <p
        className={`py-6 text-center text-xs ${
          color === "rose"
            ? "font-medium text-emerald-700 dark:text-emerald-400"
            : "text-muted-foreground"
        }`}
      >
        {emptyText}
      </p>
    )
  }
  const barColor = color === "emerald" ? "bg-emerald-500" : "bg-rose-500"
  return (
    <div className="space-y-1.5">
      {tags.map((t) => {
        const pct = total > 0 ? (t.count / total) * 100 : 0
        return (
          <div key={t.tag} className="flex items-center gap-2">
            <span className="flex-1 truncate text-xs">{t.tag}</span>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-6 text-right text-xs font-semibold tabular-nums">
              {t.count}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Lista compartilhada de top produtos (iFood/99/Keeta). Recebe a lista
 *  COMPLETA (pra calcular % do total) e exibe só o pódio dos 5. */
function TopItemsList({
  items,
}: {
  items: Array<{ nomeItem: string; qtdVendida: number; valorTotal: number }>
}) {
  const totalGeral = items.reduce((s, i) => s + i.valorTotal, 0)
  const top5 = [...items]
    .sort((a, b) => b.valorTotal - a.valorTotal)
    .slice(0, 5)
  const somaTop5 = top5.reduce((s, i) => s + i.valorTotal, 0)
  const pctTop5 = totalGeral > 0 ? Math.round((somaTop5 / totalGeral) * 100) : 0
  const pct = (v: number) =>
    totalGeral > 0 ? Math.round((v / totalGeral) * 100) : 0

  return (
    <div>
      {/* Peso dos 5 mais vendidos no total de produtos */}
      <div className="mb-3 rounded-md bg-emerald-50 px-3 py-2 dark:bg-emerald-950/30">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700/70 dark:text-emerald-400/70">
          Os 5 mais vendidos
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {pctTop5}%
          </span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            do total vendido
          </span>
        </div>
      </div>

      {/* Pódio numerado: top 3 com badge dourado; % de cada no total à direita. */}
      <div className="space-y-2">
        {top5.map((it, idx) => (
          <div key={it.nomeItem} className="flex items-center gap-2">
            <span
              className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums ${
                idx < 3
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {idx + 1}
            </span>
            <p className="min-w-0 flex-1 line-clamp-1 text-xs font-medium">
              {it.nomeItem}
            </p>
            <div className="shrink-0 text-right leading-tight">
              <span className="flex items-baseline justify-end gap-1">
                <span className="text-[11px] font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {fmtBRLShort(it.valorTotal)}
                </span>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {pct(it.valorTotal)}%
                </span>
              </span>
              <span className="block text-[10px] tabular-nums text-muted-foreground">
                {fmtNum(it.qtdVendida)} un
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
