import {
  AlertTriangle,
  CalendarDays,
  DollarSign,
  Filter,
  MessageCircle,
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
import { UnitsTable } from "@/components/dashboard/units-table"
import { PlatformLogo } from "@/components/platform-logo"
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
} from "@/lib/data/ifood-imported"
import { getNinefoodResumoByUnits } from "@/lib/data/ninefood-imported"
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
    networkAvaliacoes,
    finByUnit,
    ninefoodByUnit,
  ] = await Promise.all([
    getNetworkFunnelForMonth(year, month, filterUnitIds),
    getNetworkCancelamentosPorMotivo(year, month, 5, filterUnitIds),
    getNetworkAvaliacoesForMonth(year, month, filterUnitIds),
    getFinanceiroResumoByUnits(activeUnitIds, year, month),
    getNinefoodResumoByUnits(activeUnitIds, year, month),
  ])

  // Substitui unit.monthly pelos valores importados quando há dados — assim
  // a UnitsTable mostra dados reais sem precisar de prop nova.
  const unitsMerged = units.map((u) =>
    mergeUnitMonthlyForDashboard(u, finByUnit.get(u.id), ninefoodByUnit.get(u.id)),
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
    plataformaFilter,
  )
  const platforms = platformTotalsMerged(unitsToShow, finByUnit, ninefoodByUnit)
  const unitsWithImported = Array.from(finByUnit.values()).filter(
    (f) => f.hasData,
  ).length
  const unitsWith99 = Array.from(ninefoodByUnit.values()).filter(
    (f) => f.hasData,
  ).length
  const hasAnyImported = unitsWithImported > 0 || unitsWith99 > 0
  const hasFunnelData = networkFunnel.totals.visitas > 0
  const hasCancelData = networkCancels.length > 0
  const hasAvaliacoesData = networkAvaliacoes.hasData
  const isFiltered =
    !!unidadesFilter || !!plataformaFilter || onlyComFaturamento

  const kpis: Kpi[] = [
    {
      label: "Pedidos Totais",
      value: fmtNum(network.pedidos),
      trend: "+100,0% vs mês ant.",
      tone: "positive",
      icon: CalendarDays,
    },
    {
      label: "Média Pedidos/Dia",
      value: fmtNum(network.mediaDia),
      trend: "+100,0% vs mês ant.",
      tone: "positive",
      icon: CalendarDays,
    },
    {
      label: "Ticket Médio",
      value: fmtBRL(network.mediaTicket || 0),
      trend: "+5,2% vs mês ant.",
      tone: "positive",
      icon: Receipt,
    },
    {
      label: "Total Bruto",
      value: fmtBRLShort(network.faturamentoBruto),
      trend: "+100,0% vs mês ant.",
      tone: "positive",
      icon: DollarSign,
    },
    {
      label: "Total Líquido",
      value: fmtBRLShort(network.faturamentoLiquido),
      trend: "+100,0% vs mês ant.",
      tone: "positive",
      icon: DollarSign,
    },
    {
      label: "Taxa de Repasse",
      value: fmtPct(network.taxaRepasse),
      trend: "Acima da média do setor (~62%)",
      tone: "positive",
      icon: Percent,
    },
  ]

  if (hasAvaliacoesData) {
    const negativasPct =
      ((networkAvaliacoes.distribucao[1] + networkAvaliacoes.distribucao[2]) /
        networkAvaliacoes.total) *
      100
    kpis.push({
      label: "Nota Média (iFood)",
      value: `${networkAvaliacoes.notaMedia.toFixed(2)} ★`,
      trend: `${networkAvaliacoes.total} avaliações · ${negativasPct.toFixed(1)}% negativas`,
      tone: networkAvaliacoes.notaMedia >= 4.5 ? "positive" : "neutral",
      icon: Star,
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

      <div
        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-xs ${
          status.ok
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400"
            : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400"
        }`}
      >
        <span
          className={`size-2 rounded-full ${
            status.ok ? "bg-emerald-500" : "bg-rose-500"
          }`}
        />
        <span className="font-medium">
          {status.ok
            ? `Supabase conectado · ${unitsToShow.length} de ${allUnits.filter((u) => u.active).length} unidades · ${formatPeriodLabel({ year, month })}${
                isFiltered ? " · filtros ativos" : ""
              }`
            : status.message}
        </span>
      </div>

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
              </div>
            )}
          </div>
          <div
            className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${
              kpis.length === 7 ? "xl:grid-cols-7" : "xl:grid-cols-6"
            }`}
          >
            {kpis.map((kpi) => (
              <KpiCard key={kpi.label} kpi={kpi} />
            ))}
          </div>

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

          {(hasFunnelData || hasCancelData) && (
            <>
              <SectionDivider
                number={3}
                label={`Cardápio & Cancelamentos (${scopeLabel} iFood)`}
              />
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Funil da rede */}
                <div className="rounded-xl border bg-card p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      Funil de conversão · {scopeLabel}
                    </h3>
                    <PlatformLogo platform="ifood" size="sm" />
                  </div>
                  {hasFunnelData ? (
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
                          Conversão {unidadesFilter ? "filtrada" : "da rede"}
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
                            {networkFunnel.topUnits.slice(0, 5).map((u) => (
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
                      Sem Cardápio importado neste mês
                    </p>
                  )}
                </div>

                {/* Cancelamentos */}
                <div className="rounded-xl border bg-card p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="size-4 text-amber-600" />
                      <h3 className="text-sm font-semibold">
                        Top cancelamentos · {scopeLabel}
                      </h3>
                    </div>
                    <PlatformLogo platform="ifood" size="sm" />
                  </div>
                  {hasCancelData ? (
                    <div className="space-y-2">
                      {networkCancels.map((c) => (
                        <div
                          key={c.motivo}
                          className="flex items-center justify-between rounded-md border bg-card px-3 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-1 text-xs font-medium">
                              {c.motivo}
                            </p>
                            <p className="text-[10px] text-rose-700 tabular-nums dark:text-rose-400">
                              perda {fmtBRL(c.perdaFinanceira)}
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
                  ) : (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                      Sem Financeiro importado neste mês
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          {hasAvaliacoesData && (
            <>
              <SectionDivider
                number={4}
                label={`Satisfação dos clientes (${scopeLabel} iFood)`}
              />
              <div className="grid gap-4 lg:grid-cols-3">
                {/* Distribuição das notas */}
                <div className="rounded-xl border bg-card p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      Distribuição das notas
                    </h3>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {networkAvaliacoes.total} no mês
                    </span>
                  </div>
                  <div className="space-y-2">
                    {([5, 4, 3, 2, 1] as const).map((n) => {
                      const count = networkAvaliacoes.distribucao[n]
                      const pct =
                        networkAvaliacoes.total > 0
                          ? (count / networkAvaliacoes.total) * 100
                          : 0
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
                            <span className="font-semibold">
                              {fmtNum(count)}
                            </span>
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              ({pct.toFixed(0)}%)
                            </span>
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Top elogios */}
                <div className="rounded-xl border bg-card p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <ThumbsUp className="size-4 text-emerald-600" />
                    <h3 className="text-sm font-semibold">O que elogiam</h3>
                  </div>
                  {networkAvaliacoes.topTagsPositivas.length === 0 ? (
                    <p className="py-6 text-center text-xs text-muted-foreground">
                      Sem tags positivas registradas
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {networkAvaliacoes.topTagsPositivas.map((t) => {
                        const pct =
                          networkAvaliacoes.total > 0
                            ? (t.count / networkAvaliacoes.total) * 100
                            : 0
                        return (
                          <div
                            key={t.tag}
                            className="flex items-center gap-2"
                          >
                            <span className="flex-1 truncate text-xs">
                              {t.tag}
                            </span>
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full bg-emerald-500"
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
                  )}
                </div>

                {/* Top reclamações */}
                <div className="rounded-xl border bg-card p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <ThumbsDown className="size-4 text-rose-600" />
                    <h3 className="text-sm font-semibold">O que reclamam</h3>
                  </div>
                  {networkAvaliacoes.topTagsNegativas.length === 0 ? (
                    <p className="py-6 text-center text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      🎉 Nenhuma reclamação no mês
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {networkAvaliacoes.topTagsNegativas.map((t) => {
                        const pct =
                          networkAvaliacoes.total > 0
                            ? (t.count / networkAvaliacoes.total) * 100
                            : 0
                        return (
                          <div
                            key={t.tag}
                            className="flex items-center gap-2"
                          >
                            <span className="flex-1 truncate text-xs">
                              {t.tag}
                            </span>
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full bg-rose-500"
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
                  )}
                </div>
              </div>

              {/* Últimos comentários */}
              {networkAvaliacoes.ultimosComentarios.length > 0 && (
                <div className="rounded-xl border bg-card overflow-hidden">
                  <div className="flex items-center gap-2 border-b px-5 py-3">
                    <MessageCircle className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">
                      Últimos comentários
                    </h3>
                  </div>
                  <div className="divide-y">
                    {networkAvaliacoes.ultimosComentarios.map((c) => (
                      <div key={c.id} className="px-5 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
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
              )}
            </>
          )}

          <SectionDivider
            number={hasAvaliacoesData ? 5 : 4}
            label="Detalhamento por Unidade"
          />
          <UnitsTable units={unitsToShow} />
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

function networkTotalsMerged(
  units: Awaited<ReturnType<typeof getUnits>>,
  finByUnit: Map<string, FinResumo>,
  ninefoodByUnit: Map<string, NinefoodResumoT>,
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
      // Keeta (ainda só mock)
      const p = u.monthly.platforms.find((p) => p.id === platformFilter)
      if (p) {
        bruto += p.bruto
        liquido += p.liquido
      }
      continue
    }
    // Sem filtro de plataforma → soma iFood + 99 Food + (Keeta manual)
    const ifoodImp = finByUnit.get(u.id)
    const nineImp = ninefoodByUnit.get(u.id)

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
    // Fallback pro monthly manual SE nenhuma plataforma trouxe dados
    if (!ifoodImp?.hasData && !nineImp?.hasData) {
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
): Awaited<ReturnType<typeof getUnits>>[number] {
  const hasIfood = fin?.hasData ?? false
  const has99 = nine?.hasData ?? false
  if (!hasIfood && !has99) return u

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
  // Keeta sempre do manual
  const pKeeta = u.monthly.platforms.find((p) => p.id === "keeta")
  if (pKeeta) {
    totalBruto += pKeeta.bruto
    totalLiquido += pKeeta.liquido
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
      // Keeta: só manual
      const p = u.monthly.platforms.find((p) => p.id === id)
      bruto += p?.bruto ?? 0
      liquido += p?.liquido ?? 0
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
