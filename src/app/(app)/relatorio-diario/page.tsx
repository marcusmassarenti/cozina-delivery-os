import Link from "next/link"
import { CalendarRange, Target } from "lucide-react"

import {
  PLATAFORMAS,
  type PlatformId,
} from "@/components/platform-logo"
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
import { getVisibleUnits } from "@/lib/data/units"
import { assertCanView } from "@/lib/auth/permissions"
import { fmtBRLShort, fmtNum, fmtPct } from "@/lib/format"
import {
  formatPeriodLabel,
  formatRangeLabel,
  parseRangeFromSp,
  rangeIsFullMonth,
  rangeSingleMonth,
} from "@/lib/period"
import { AlertTriangle } from "lucide-react"

import { LojaFilter } from "@/components/shared/loja-filter"

import { DailyTrendChart } from "@/app/(app)/financeiro/_components/daily-trend-chart"

import { RelatorioFilters } from "./_components/relatorio-filters"
import { RelatorioKpis } from "./_components/relatorio-kpis"
import { UnitsRanking, type RankingUnit } from "./_components/units-ranking"
import { WeeklyMatrix } from "./_components/weekly-matrix"
import { ExportPdfButton } from "./_components/export-pdf-button"

const PLATFORM_LABEL: Record<ReportPlatform, string> = {
  todas: "Todas as plataformas",
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
  cardapioweb: "Cardápio Web",
}

const VALID_METRICS: DailyMetric[] = ["faturamento", "pedidos", "cancelamentos"]
const VALID_PLATFORMS: ReportPlatform[] = [
  "todas",
  ...PLATAFORMAS,
]

export default async function RelatorioDiarioPage({
  searchParams,
}: {
  searchParams: Promise<{
    periodo?: string
    inicio?: string
    fim?: string
    metrica?: string
    plataforma?: string
    lojas?: string
  }>
}) {
  const sp = await searchParams
  await assertCanView("relatorios")
  const periodRange = parseRangeFromSp(sp)
  const isFullMonth = rangeIsFullMonth(periodRange)
  // Relatório Diário usa matriz dia × loja com chave "dia do mês" (1..31).
  // Cross-month conflitaria (dia 5 de maio vs dia 5 de junho na mesma chave),
  // então clampa pro mês do START e avisa via banner.
  const singleMonth = rangeSingleMonth(periodRange)
  const year = singleMonth?.year ?? Number(periodRange.start.slice(0, 4))
  const month = singleMonth?.month ?? Number(periodRange.start.slice(5, 7))
  const queryRange = isFullMonth || !singleMonth ? undefined : periodRange
  const metric: DailyMetric = VALID_METRICS.includes(sp.metrica as DailyMetric)
    ? (sp.metrica as DailyMetric)
    : "faturamento"
  const platform: ReportPlatform = VALID_PLATFORMS.includes(
    sp.plataforma as ReportPlatform,
  )
    ? (sp.plataforma as ReportPlatform)
    : "todas"

  const [allUnits, availablePeriods] = await Promise.all([
    getVisibleUnits(),
    getAvailablePeriods(),
  ])
  const activeUnits = allUnits
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, code: u.code, name: u.name }))
  const lojaCodes = (sp.lojas?.split(",") ?? []).filter(Boolean)
  const unitsForMatrix =
    lojaCodes.length > 0
      ? activeUnits.filter((u) => lojaCodes.includes(u.code))
      : activeUnits
  // Plataformas habilitadas no escopo (só essas viram opção/logo).
  const scopedUnits = allUnits.filter(
    (u) => u.active && (lojaCodes.length === 0 || lojaCodes.includes(u.code)),
  )
  const tenantPlats: PlatformId[] = PLATAFORMAS.filter((p) =>
    scopedUnits.some((u) => u.platforms.includes(p)),
  )

  // Busca as 4 séries (todas + 3 plataformas) pro mesmo escopo de lojas — o
  // `matrix` da métrica/plataforma selecionada é derivado de uma delas, e as 4
  // alimentam o gráfico diário interativo (faturamento + pedidos).
  const [dTodas, dIfood, d99, dKeeta, dCw] = await Promise.all([
    getDailyReportMatrix(year, month, "todas", unitsForMatrix, queryRange),
    getDailyReportMatrix(year, month, "ifood", unitsForMatrix, queryRange),
    getDailyReportMatrix(year, month, "99food", unitsForMatrix, queryRange),
    getDailyReportMatrix(year, month, "keeta", unitsForMatrix, queryRange),
    getDailyReportMatrix(year, month, "cardapioweb", unitsForMatrix, queryRange),
  ])
  // Mapa em vez de ternário encadeado: o ternário terminava em `: dTodas`, e
  // uma plataforma nova exibia os números de TODAS com o chip dela marcado.
  const porPlataforma = {
    todas: dTodas,
    ifood: dIfood,
    "99food": d99,
    keeta: dKeeta,
    cardapioweb: dCw,
  } satisfies Record<ReportPlatform, typeof dTodas>
  const matrix = porPlataforma[platform]

  const toSeries = (m: typeof dTodas) => ({
    days: m.days,
    faturamento: m.networkByDay.faturamento,
    pedidos: m.networkByDay.pedidos,
  })
  const dailyByPlat = {
    todas: toSeries(dTodas),
    ifood: toSeries(dIfood),
    "99food": toSeries(d99),
    keeta: toSeries(dKeeta),
    cardapioweb: toSeries(dCw),
  }
  const dailyPlatforms = (
    [
      ["ifood", dIfood],
      ["99food", d99],
      ["keeta", dKeeta],
      ["cardapioweb", dCw],
    ] as const
  )
    .filter(([, m]) => m.hasData)
    .map(([id]) => id)

  const metricLabel =
    METRIC_OPTIONS.find((m) => m.id === metric)?.label ?? "Faturamento Bruto"

  // Plataformas ativas (pros logos nos cabeçalhos). "todas" = as habilitadas.
  const activePlatforms: PlatformId[] =
    platform === "todas" ? tenantPlats : [platform]

  // ─── Helpers de valor/format conforme a métrica ──────────────────
  const fmt = (v: number) =>
    metric === "faturamento"
      ? fmtBRLShort(v)
      : metric === "pedidos"
        ? fmtNum(v)
        : fmtPct(v)

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
            {formatRangeLabel(periodRange)}
          </p>
          {/* Linha só pro PDF: como os switchers ficam escondidos, o
              documento precisa dizer o que está mostrando */}
          <p className="mt-1 hidden text-xs text-muted-foreground print:block">
            {metricLabel} · {PLATFORM_LABEL[platform]}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Link
            href="/relatorios/acompanhamento"
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
            title="Venda diária por loja com meta e falta, agrupado por marca"
          >
            <Target className="size-4 text-primary" />
            Infos Diária Venda (metas)
          </Link>
          <LojaFilter units={activeUnits} />
          <ExportPdfButton />
          <PeriodSelector
            current={periodRange}
            options={availablePeriods}
            enableRange
          />
        </div>
      </div>

      {!isFullMonth && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400 print:hidden">
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          <span>
            Período personalizado <strong>{formatRangeLabel(periodRange)}</strong> —{" "}
            {singleMonth
              ? `mostrando só os dias do range em ${formatPeriodLabel({ year, month })}.`
              : `range cruza meses; pra a matriz dia × loja, só os dias de ${formatPeriodLabel({ year, month })} são mostrados. Escolha um intervalo dentro de um único mês pra ver tudo.`}
          </span>
        </div>
      )}

      <div className="print:hidden">
        <RelatorioFilters
          metric={metric}
          platform={platform}
          platforms={tenantPlats}
        />
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
          <DailyTrendChart
            key={platform}
            data={dailyByPlat}
            platforms={dailyPlatforms}
            initial={platform === "todas" ? "todas" : platform}
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
