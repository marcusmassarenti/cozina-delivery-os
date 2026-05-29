import { CalendarRange } from "lucide-react"

import type { PlatformId } from "@/components/platform-logo"
import { PeriodSelector } from "@/components/shared/period-selector"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import {
  getDailyReportMatrix,
  type UnitDailyRow,
} from "@/lib/data/relatorio-diario"
import {
  METRIC_OPTIONS,
  type DailyMetric,
  type ReportPlatform,
} from "@/lib/data/relatorio-diario-types"
import { getUnits } from "@/lib/data/units"
import { fmtBRLShort, fmtNum, fmtPct } from "@/lib/format"
import { formatPeriodLabel, parsePeriodParam } from "@/lib/period"

import { RelatorioFilters } from "./_components/relatorio-filters"
import { RelatorioKpis } from "./_components/relatorio-kpis"
import { DailyBarChart, type Bar } from "./_components/daily-bar-chart"
import { UnitsRanking, type RankingUnit } from "./_components/units-ranking"
import { WeeklyMatrix } from "./_components/weekly-matrix"
import { ExportPdfButton } from "./_components/export-pdf-button"

const PLATFORM_LABEL: Record<ReportPlatform, string> = {
  todas: "Todas as plataformas",
  ifood: "iFood",
  "99food": "99 Food",
}

const VALID_METRICS: DailyMetric[] = ["faturamento", "pedidos", "cancelamentos"]
const VALID_PLATFORMS: ReportPlatform[] = ["todas", "ifood", "99food"]

export default async function RelatorioDiarioPage({
  searchParams,
}: {
  searchParams: Promise<{
    periodo?: string
    metrica?: string
    plataforma?: string
  }>
}) {
  const sp = await searchParams
  const { year, month } = parsePeriodParam(sp.periodo)
  const metric: DailyMetric = VALID_METRICS.includes(sp.metrica as DailyMetric)
    ? (sp.metrica as DailyMetric)
    : "faturamento"
  const platform: ReportPlatform = VALID_PLATFORMS.includes(
    sp.plataforma as ReportPlatform,
  )
    ? (sp.plataforma as ReportPlatform)
    : "todas"

  const [allUnits, availablePeriods] = await Promise.all([
    getUnits(),
    getAvailablePeriods(),
  ])
  const activeUnits = allUnits
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, code: u.code, name: u.name }))

  const matrix = await getDailyReportMatrix(year, month, platform, activeUnits)

  const metricLabel =
    METRIC_OPTIONS.find((m) => m.id === metric)?.label ?? "Faturamento Bruto"

  // Plataformas ativas (pros logos nos cabeçalhos). "todas" = iFood + 99.
  const activePlatforms: PlatformId[] =
    platform === "todas" ? ["ifood", "99food"] : [platform]

  // ─── Helpers de valor/format conforme a métrica ──────────────────
  const fmt = (v: number) =>
    metric === "faturamento"
      ? fmtBRLShort(v)
      : metric === "pedidos"
        ? fmtNum(v)
        : fmtPct(v)

  // Rótulo curto pra cima da barra (compacto). Faturamento em milhares.
  const barShort = (v: number): string => {
    if (v <= 0) return ""
    if (metric === "faturamento")
      return (v / 1000).toFixed(1).replace(".", ",")
    if (metric === "pedidos") return fmtNum(Math.round(v))
    return v.toFixed(1).replace(".", ",")
  }

  const dayValue = (d: number): number => {
    if (metric === "faturamento") return matrix.networkByDay.faturamento[d] ?? 0
    if (metric === "pedidos") return matrix.networkByDay.pedidos[d] ?? 0
    const c = matrix.networkByDay.cancelamentos[d] ?? 0
    const p = matrix.networkByDay.pedidos[d] ?? 0
    return p > 0 ? (c / p) * 100 : 0
  }
  const unitTotal = (u: UnitDailyRow): number => {
    if (metric === "faturamento") return u.totalFaturamento
    if (metric === "pedidos") return u.totalPedidos
    return u.totalPedidos > 0
      ? (u.totalCancelamentos / u.totalPedidos) * 100
      : 0
  }
  const unitDay = (u: UnitDailyRow, d: number): number => {
    if (metric === "faturamento") return u.faturamento[d] ?? 0
    if (metric === "pedidos") return u.pedidos[d] ?? 0
    const c = u.cancelamentos[d] ?? 0
    const p = u.pedidos[d] ?? 0
    return p > 0 ? (c / p) * 100 : 0
  }

  const bars: Bar[] = matrix.days.map((d) => {
    const v = dayValue(d)
    return { day: d, value: v, label: fmt(v), short: barShort(v) }
  })

  // % que cada loja representa. Faturamento/Pedidos: share do total da
  // métrica. Cancelamento (taxa não soma): share do total de cancelados.
  const totalForShare =
    metric === "faturamento"
      ? matrix.totalFaturamento
      : metric === "pedidos"
        ? matrix.totalPedidos
        : matrix.totalCancelamentos
  const shareOf = (u: UnitDailyRow): number | null => {
    if (totalForShare <= 0) return null
    const base =
      metric === "faturamento"
        ? u.totalFaturamento
        : metric === "pedidos"
          ? u.totalPedidos
          : u.totalCancelamentos
    return (base / totalForShare) * 100
  }

  const rankingUnits: RankingUnit[] = matrix.units
    .map((u) => ({
      code: u.code,
      name: u.name,
      value: unitTotal(u),
      label: fmt(unitTotal(u)),
      share: shareOf(u),
      series: matrix.days.map((d) => unitDay(u, d)),
    }))
    .sort((a, b) => b.value - a.value)

  return (
    <div
      data-print="page"
      className="flex flex-1 flex-col gap-6 bg-muted/30 p-6 print:bg-white"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Relatório Diário
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Acompanhamento dia a dia da rede ·{" "}
            {formatPeriodLabel({ year, month })}
          </p>
          {/* Linha só pro PDF: como os switchers ficam escondidos, o
              documento precisa dizer o que está mostrando */}
          <p className="mt-1 hidden text-xs text-muted-foreground print:block">
            {metricLabel} · {PLATFORM_LABEL[platform]}
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <ExportPdfButton />
          <PeriodSelector
            current={{ year, month }}
            options={availablePeriods}
          />
        </div>
      </div>

      <div className="print:hidden">
        <RelatorioFilters metric={metric} platform={platform} />
      </div>

      {!matrix.hasData ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
            <CalendarRange className="size-6 text-muted-foreground" />
          </div>
          <p className="mt-4 text-sm font-medium">
            Sem dados diários neste mês/plataforma
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Importe os relatórios em{" "}
            <a href="/importacao" className="underline">
              /importacao
            </a>{" "}
            pra alimentar o relatório. Tente outra plataforma ou período.
          </p>
        </div>
      ) : (
        <>
          <RelatorioKpis matrix={matrix} metric={metric} />
          <DailyBarChart
            bars={bars}
            metric={metric}
            metricLabel={metricLabel}
            platforms={activePlatforms}
          />
          <UnitsRanking
            units={rankingUnits}
            metric={metric}
            metricLabel={metricLabel}
            platforms={activePlatforms}
          />
          <WeeklyMatrix
            matrix={matrix}
            metric={metric}
            year={year}
            month={month}
            platforms={activePlatforms}
          />
        </>
      )}
    </div>
  )
}
