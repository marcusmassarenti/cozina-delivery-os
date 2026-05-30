import {
  AlertTriangle,
  Bike,
  CalendarDays,
  DollarSign,
  Filter,
  MessageCircle,
  Package,
  Percent,
  Receipt,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  XCircle,
} from "lucide-react"

import { DashboardFilters } from "@/components/dashboard/dashboard-filters"
import { DashboardSection } from "@/components/dashboard/dashboard-section"
import { ImportCoverageBanner } from "@/components/dashboard/import-coverage-banner"
import { PlatformTabbedCard } from "@/components/dashboard/platform-tabbed-card"
import { UnitsTable } from "@/components/dashboard/units-table"
import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { KpiCard, type Kpi } from "@/components/shared/kpi-card"
import { SectionDivider } from "@/components/shared/section-divider"
import {
  getUnits,
  networkTotalsFromUnits,
  platformTotalsFromUnits,
} from "@/lib/data/units"
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
  getKeetaResumoByUnits,
  getNetworkKeetaAvaliacoesForMonth,
  getNetworkKeetaCancelamentosForMonth,
  getNetworkKeetaTopItemsForMonth,
} from "@/lib/data/keeta-imported"
import { fmtBRL, fmtBRLShort, fmtNum, fmtPct } from "@/lib/format"
import { parsePeriodParam, formatPeriodLabel } from "@/lib/period"
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
    unidades?: string // códigos separados por vírgula: "01,02,03"
    plataforma?: string // "ifood" | "99food" | "keeta" | undefined (=todas)
    ativo?: string // "1" pra mostrar só com faturamento
  }>
}) {
  const sp = await searchParams
  const { year, month } = parsePeriodParam(sp.periodo)
  const unidadesFilter = sp.unidades
    ? new Set(sp.unidades.split(",").filter(Boolean))
    : null
  const plataformaFilter = ["ifood", "99food", "keeta"].includes(
    sp.plataforma ?? "",
  )
    ? (sp.plataforma as "ifood" | "99food" | "keeta")
    : null
  const onlyComFaturamento = sp.ativo === "1"

  // Fase 1: precisa de allUnits pra resolver unidadesFilter ANTES de chamar
  // as queries de rede (que agora respeitam o filtro de unidades)
  const [status, allUnits, availablePeriods] = await Promise.all([
    checkSupabase(),
    getUnits(),
    getAvailablePeriods(),
  ])
  const units = unidadesFilter
    ? allUnits.filter((u) => unidadesFilter.has(u.code))
    : allUnits
  const activeUnitIds = units.filter((u) => u.active).map((u) => u.id)
  // Texto curto que descreve o escopo dos cards (rede vs lojas filtradas)
  const activeCount = activeUnitIds.length
  const scopeLabel = unidadesFilter
    ? `${activeCount} loja${activeCount !== 1 ? "s" : ""}`
    : "rede"
  // Quando filtro NÃO está ativo, passa undefined pras network functions
  // (= rede inteira). Quando está, passa os IDs selecionados.
  const filterUnitIds = unidadesFilter ? activeUnitIds : undefined

  // Fase 2: queries de rede + financeiro em paralelo, respeitando filtro
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
    finByUnit,
    ninefoodByUnit,
    keetaByUnit,
    importCoverage,
    deliveryFee,
  ] = await Promise.all([
    getNetworkFunnelForMonth(year, month, filterUnitIds),
    getNetworkCancelamentosPorMotivo(year, month, 5, filterUnitIds),
    getNetworkTopItemsForMonth(year, month, 5, filterUnitIds),
    getNetworkAvaliacoesForMonth(year, month, filterUnitIds),
    getNetworkNinefoodCancelamentosForMonth(year, month, 5, filterUnitIds),
    getNetworkNinefoodTopItemsForMonth(year, month, 5, filterUnitIds),
    getNetworkNinefoodAvaliacoesForMonth(year, month, filterUnitIds),
    getNetworkKeetaCancelamentosForMonth(year, month, 5, filterUnitIds),
    getNetworkKeetaTopItemsForMonth(year, month, 5, filterUnitIds),
    getNetworkKeetaAvaliacoesForMonth(year, month, filterUnitIds),
    getFinanceiroResumoByUnits(activeUnitIds, year, month),
    getNinefoodResumoByUnits(activeUnitIds, year, month),
    getKeetaResumoByUnits(activeUnitIds, year, month),
    getImportCoverageForMonth(year, month, filterUnitIds),
    getNetworkDeliveryFee(activeUnitIds, year, month),
  ])

  // Substitui unit.monthly pelos valores importados quando há dados — assim
  // a UnitsTable mostra dados reais sem precisar de prop nova.
  const unitsMerged = units.map((u) =>
    mergeUnitMonthlyForDashboard(
      u,
      finByUnit.get(u.id),
      ninefoodByUnit.get(u.id),
      keetaByUnit.get(u.id),
    ),
  )

  // Aplica filtro "com faturamento" (precisa de dados de unitsMerged já calculado)
  const unitsToShow = onlyComFaturamento
    ? unitsMerged.filter((u) => u.monthly.pedidos > 0)
    : unitsMerged

  // Network = totais da rede MESCLADOS (do array filtrado)
  const network = networkTotalsMerged(
    unitsToShow,
    finByUnit,
    ninefoodByUnit,
    keetaByUnit,
    plataformaFilter,
  )
  const platforms = platformTotalsMerged(
    unitsToShow,
    finByUnit,
    ninefoodByUnit,
    keetaByUnit,
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

  const kpis: Kpi[] = [
    {
      label: "Pedidos Totais",
      value: fmtNum(network.pedidos),
      trend: "+100,0% vs mês ant.",
      tone: "positive",
      icon: CalendarDays,
      platforms: finPlatforms,
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
    },
    {
      label: "Média Pedidos/Dia",
      value: fmtNum(network.mediaDia),
      trend: "+100,0% vs mês ant.",
      tone: "positive",
      icon: CalendarDays,
      platforms: finPlatforms,
    },
    {
      label: "Ticket Médio",
      value: fmtBRL(network.mediaTicket || 0),
      trend: "+5,2% vs mês ant.",
      tone: "positive",
      icon: Receipt,
      platforms: finPlatforms,
    },
    {
      label: "Total Bruto",
      value: fmtBRLShort(network.faturamentoBruto),
      trend: "+100,0% vs mês ant.",
      tone: "positive",
      icon: DollarSign,
      platforms: finPlatforms,
    },
    {
      label: "Total Líquido",
      value: fmtBRLShort(network.faturamentoLiquido),
      trend: "+100,0% vs mês ant.",
      tone: "positive",
      icon: DollarSign,
      platforms: finPlatforms,
    },
    {
      label: "Taxa de Repasse",
      value: fmtPct(network.taxaRepasse),
      trend: "Acima da média do setor (~62%)",
      tone: "positive",
      icon: Percent,
      platforms: finPlatforms,
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
    })
  }


  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {unidadesFilter
              ? `${activeCount} loja${activeCount !== 1 ? "s" : ""} selecionada${activeCount !== 1 ? "s" : ""}`
              : "Visão da rede"}{" "}
            · {formatPeriodLabel({ year, month })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSelector
            current={{ year, month }}
            options={availablePeriods}
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

      {status.ok ? (
        <ImportCoverageBanner
          coverage={importCoverage}
          month={month}
          periodLabel={formatPeriodLabel({ year, month })}
        />
      ) : (
        <div className="flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          <span className="size-2 rounded-full bg-rose-500" />
          <span className="font-medium">{status.message}</span>
        </div>
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
          <DashboardSection id="kpis">
          <div className="flex items-center justify-between gap-3">
            <SectionDivider number={1} label="Performance da Operação" />
            {hasAnyImported && (
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <Sparkles className="size-3" />
                  {unitsWithImported}/{allUnits.filter((u) => u.active).length}{" "}
                  iFood
                </span>
                {unitsWith99 > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
                    <Sparkles className="size-3" />
                    {unitsWith99}/{allUnits.filter((u) => u.active).length} 99
                    Food
                  </span>
                )}
                {unitsWithKeeta > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-lime-100 px-2.5 py-1 text-[10px] font-semibold text-lime-800 dark:bg-lime-950/40 dark:text-lime-400">
                    <Sparkles className="size-3" />
                    {unitsWithKeeta}/{allUnits.filter((u) => u.active).length}{" "}
                    Keeta
                  </span>
                )}
              </div>
            )}
          </div>
          <div
            className={`grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 ${
              kpis.length >= 8
                ? "xl:grid-cols-4"
                : kpis.length === 7
                  ? "xl:grid-cols-7"
                  : "xl:grid-cols-6"
            }`}
          >
            {kpis.map((kpi) => (
              <KpiCard key={kpi.label} kpi={kpi} />
            ))}
          </div>
          </DashboardSection>

          <DashboardSection id="plataformas">
          <SectionDivider
            number={2}
            label={`Visão Geral por Plataforma (${scopeLabel})`}
          />
          <div className="grid gap-3 md:grid-cols-3">
            {platforms.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
              >
                <PlatformLogo platform={p.id} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">{p.name}</span>
                    <span className="text-sm font-bold tabular-nums">
                      {fmtBRLShort(p.bruto)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${p.pctLoja}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {fmtPct(p.pctLoja)} líquido pra loja
                  </p>
                </div>
              </div>
            ))}
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
                          <div className="mt-3 flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2 dark:bg-emerald-950/30">
                            <span className="text-xs font-medium text-emerald-900 dark:text-emerald-300">
                              Conversão{" "}
                              {unidadesFilter ? "filtrada" : "da rede"}
                            </span>
                            <span className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                              {fmtPct(networkFunnel.totals.conversaoPct)}
                            </span>
                          </div>
                          {networkFunnel.topUnits.length > 1 && (
                            <div className="mt-3 border-t pt-3">
                              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                Por unidade (concluídos)
                              </p>
                              <div className="space-y-1">
                                {networkFunnel.topUnits
                                  .slice(0, 5)
                                  .map((u) => (
                                    <div
                                      key={u.unitId}
                                      className="flex items-center justify-between text-xs"
                                    >
                                      <span className="truncate">
                                        #{u.code} {u.name}
                                      </span>
                                      <div className="flex items-center gap-2 tabular-nums">
                                        <span className="font-semibold">
                                          {fmtNum(u.concluidos)}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground">
                                          ({fmtPct(u.conversaoPct)})
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="py-6 text-center text-xs text-muted-foreground">
                          Sem Cardápio iFood neste mês
                        </p>
                      ),
                    },
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
                {/* Distribuição das notas */}
                {/* Distribuição das notas */}
                <PlatformTabbedCard
                  title="Distribuição das notas"
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
                  .slice(0, 8)
                if (merged.length === 0) return null
                return (
                  <div className="rounded-xl border bg-card overflow-hidden">
                    <div className="flex items-center gap-2 border-b px-5 py-3">
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
                        <div key={c.id} className="px-5 py-3">
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
                          <p className="mt-1 text-sm italic text-foreground/90 line-clamp-2">
                            &ldquo;{c.comentario}&rdquo;
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </DashboardSection>
          )}

          <DashboardSection id="unidades">
            <SectionDivider
              number={hasAvaliacoesData ? 5 : 4}
              label="Detalhamento por Unidade"
            />
            <UnitsTable units={unitsToShow} />
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
  units: Awaited<ReturnType<typeof getUnits>>,
  finByUnit: Map<string, FinResumo>,
  ninefoodByUnit: Map<string, NinefoodResumoT>,
  keetaByUnit: Map<string, KeetaResumoT>,
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
  const mediaDia = Math.round(pedidos / 30)
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
  u: Awaited<ReturnType<typeof getUnits>>[number],
  fin: FinResumo | undefined,
  nine: NinefoodResumoT | undefined,
  keeta: KeetaResumoT | undefined,
): Awaited<ReturnType<typeof getUnits>>[number] {
  const hasIfood = fin?.hasData ?? false
  const has99 = nine?.hasData ?? false
  const hasKeeta = keeta?.hasData ?? false
  if (!hasIfood && !has99 && !hasKeeta) return u

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
  units: Awaited<ReturnType<typeof getUnits>>,
  finByUnit: Map<string, FinResumo>,
  ninefoodByUnit: Map<string, NinefoodResumoT>,
  keetaByUnit: Map<string, KeetaResumoT>,
) {
  const ids = ["ifood", "99food", "keeta"] as const
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
  return (
    <div className="space-y-2">
      {items.map((c) => (
        <div
          key={c.motivo}
          className="flex items-center justify-between rounded-md border bg-card px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 text-xs font-medium">{c.motivo}</p>
            <p className="text-[10px] text-rose-700 tabular-nums dark:text-rose-400">
              perda {fmtBRL(c.perda)}
            </p>
          </div>
          <div className="ml-3 flex items-center gap-1.5">
            <XCircle className="size-3.5 text-rose-600" />
            <span className="text-sm font-bold tabular-nums">
              {fmtNum(c.pedidos)}
            </span>
          </div>
        </div>
      ))}
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

/** Lista compartilhada de top produtos (iFood ou 99 Food). */
function TopItemsList({
  items,
}: {
  items: Array<{ nomeItem: string; qtdVendida: number; valorTotal: number }>
}) {
  return (
    <div className="space-y-2">
      {items.map((it, idx) => (
        <div
          key={it.nomeItem}
          className="flex items-center justify-between rounded-md border bg-card px-3 py-2"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold tabular-nums text-muted-foreground">
              {idx + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-xs font-medium">{it.nomeItem}</p>
              <p className="text-[10px] tabular-nums text-muted-foreground">
                {fmtNum(it.qtdVendida)} vendidos
              </p>
            </div>
          </div>
          <div className="ml-3 text-right">
            <p className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {fmtBRLShort(it.valorTotal)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
