import Link from "next/link"
import {
  ArrowRight,
  Bike,
  CalendarRange,
  DollarSign,
  LayoutGrid,
  Percent,
  Receipt,
  ShoppingBag,
  Star,
  Wallet,
} from "lucide-react"

import { ImportCoverageBanner } from "@/components/dashboard/import-coverage-banner"
import { ExportPdfButton } from "@/components/shared/export-pdf-button"
import { KpiCard, type Kpi } from "@/components/shared/kpi-card"
import { LojaFilter } from "@/components/shared/loja-filter"
import { PeriodSelector } from "@/components/shared/period-selector"
import { SectionDivider } from "@/components/shared/section-divider"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import { getVisibleUnits } from "@/lib/data/units"
import { assertCanView } from "@/lib/auth/permissions"
import { getAccessibleUnitIds } from "@/lib/auth/roles"
import { getNetworkReportForMonth } from "@/lib/data/relatorio-rede"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import {
  formatPeriodKey,
  formatPeriodLabel,
  formatRangeLabel,
} from "@/lib/period"
import { readPeriod } from "@/lib/period-helpers"
import { AlertTriangle } from "lucide-react"

const ALL_PLATFORMS = ["ifood", "99food", "keeta"] as const

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; inicio?: string; fim?: string; lojas?: string }>
}) {
  const sp = await searchParams
  await assertCanView("relatorios")
  const { range: periodRange, year, month, isFullMonth } = readPeriod(sp)
  const period = { year, month }
  const periodKey = formatPeriodKey(period)
  const periodLabel = formatPeriodLabel(period)

  const allUnits = (await getVisibleUnits())
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, code: u.code, name: u.name }))
  const lojaCodes = (sp.lojas?.split(",") ?? []).filter(Boolean)
  const accessibleIds = await getAccessibleUnitIds()
  const filterIds =
    lojaCodes.length > 0
      ? allUnits.filter((u) => lojaCodes.includes(u.code)).map((u) => u.id)
      : accessibleIds === null
        ? undefined // admin/gerente: rede inteira
        : allUnits.map((u) => u.id) // franqueado: só as lojas dele

  const [report, availablePeriods] = await Promise.all([
    getNetworkReportForMonth(year, month, filterIds),
    getAvailablePeriods(),
  ])
  const t = report.totals

  const custoEntregaPct =
    t.bruto > 0 ? (report.custoEntrega / t.bruto) * 100 : 0

  const kpis: Kpi[] = [
    {
      label: "Pedidos totais",
      value: fmtNum(t.pedidos),
      icon: ShoppingBag,
      platforms: [...ALL_PLATFORMS],
    },
    {
      label: "Média pedidos/dia",
      value: fmtNum(report.mediaPedidosDia),
      trend: `${report.diasConsiderados} dia${report.diasConsiderados === 1 ? "" : "s"} no período`,
      icon: CalendarRange,
    },
    {
      label: "Ticket médio",
      value: fmtBRL(report.ticketMedio),
      icon: Receipt,
    },
    {
      label: "Total bruto",
      value: fmtBRL(t.bruto),
      icon: DollarSign,
      platforms: [...ALL_PLATFORMS],
    },
    {
      label: "Total líquido",
      value: fmtBRL(t.totalLiquido),
      trend: `${fmtPct(t.repassePct)} de repasse`,
      tone: "positive",
      icon: Wallet,
    },
    {
      label: "Resultado operacional",
      value: fmtBRL(t.resultadoOperacional),
      trend: `${fmtPct(t.resultadoPct)} do bruto`,
      tone: t.resultadoOperacional >= 0 ? "positive" : "warning",
      icon: Percent,
    },
    {
      label: "Custo de entrega",
      value: fmtBRL(report.custoEntrega),
      trend: `${fmtPct(custoEntregaPct)} do bruto`,
      icon: Bike,
    },
    {
      label: "Nota média",
      value: report.notaMedia != null ? `${report.notaMedia.toFixed(2)} ★` : "—",
      trend:
        report.totalAvaliacoes > 0
          ? `${fmtNum(report.totalAvaliacoes)} avaliações`
          : "sem avaliações",
      tone: "neutral",
      icon: Star,
    },
  ]

  // Cascata do DRE (consistente: bruto − taxas = líquido; etc.).
  const dre: Array<{
    label: string
    value: number
    kind: "base" | "minus" | "plus" | "sum"
    pct?: number
    note?: string
    strong?: boolean
  }> = [
    { label: "Receita bruta", value: t.bruto, kind: "base" },
    {
      label: "Taxas das plataformas",
      value: -t.taxasPlataforma,
      kind: "minus",
      note:
        t.promocoesLoja > 0
          ? `inclui ${fmtBRL(t.promocoesLoja)} de promoções da loja`
          : undefined,
    },
    {
      label: "Líquido das plataformas",
      value: t.liquidoPlataformas,
      kind: "sum",
    },
    { label: "VR líquido", value: t.vrLiquido, kind: "plus" },
    { label: "Total líquido", value: t.totalLiquido, kind: "sum", strong: true },
    { label: "CMV", value: -t.cmvTotal, kind: "minus" },
    {
      label: "Margem líquida",
      value: t.margemLiquida,
      kind: "sum",
      pct: t.margemPct,
    },
    { label: "Custo de operação", value: -t.custoOperacao, kind: "minus" },
    {
      label: "Resultado operacional",
      value: t.resultadoOperacional,
      kind: "sum",
      pct: t.resultadoPct,
      strong: true,
    },
  ]

  const atalhos: Array<{
    href: string
    icon: typeof CalendarRange
    title: string
    desc: string
  }> = [
    {
      href: `/relatorio-diario?periodo=${periodKey}`,
      icon: CalendarRange,
      title: "Relatório Diário",
      desc: "Faturamento, pedidos e cancelados loja × dia, com gráfico e ranking.",
    },
    {
      href: `/financeiro?periodo=${periodKey}`,
      icon: Wallet,
      title: "DRE Grupo",
      desc: "Resultado da rede e por unidade — CMV, margem e resultado operacional.",
    },
    {
      href: `/avaliacoes?periodo=${periodKey}`,
      icon: Star,
      title: "Avaliações",
      desc: "Notas e comentários das 3 plataformas, por loja e por período.",
    },
    {
      href: "/pedidos",
      icon: Receipt,
      title: "Pedidos",
      desc: "Pedido a pedido por plataforma — forma de pagamento, VR e turnos.",
    },
    {
      href: "/importacao/cobertura",
      icon: LayoutGrid,
      title: "Cobertura de importação",
      desc: "O que cada loja já tem importado, mês a mês.",
    },
  ]

  return (
    <div
      data-print="page"
      className="flex flex-1 flex-col gap-6 bg-muted/30 p-6"
    >
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Relatório consolidado da rede · {periodLabel} ·{" "}
            {report.unitsComFaturamento}/{report.unitsTotal} loja
            {report.unitsTotal === 1 ? "" : "s"} com faturamento
          </p>
        </div>
        <div
          className="flex flex-wrap items-center gap-2"
          data-print="hide"
        >
          <LojaFilter units={allUnits} />
          <PeriodSelector
            current={periodRange}
            options={availablePeriods}
            enableRange
          />
          <ExportPdfButton />
        </div>
      </div>

      {!isFullMonth && (
        <div
          className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400"
          data-print="hide"
        >
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          <span>
            Relatório consolidado é mensal (DRE com custos). Mostrando dados de <strong>{formatRangeLabel(periodRange)}</strong> usando o mês <strong>{periodLabel}</strong> como referência.
          </span>
        </div>
      )}

      <ImportCoverageBanner
        coverage={report.coverage}
        year={year}
        month={month}
        periodLabel={periodLabel}
      />

      {/* 1 — Consolidado */}
      <SectionDivider number={1} label="Consolidado da rede" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      {/* DRE em cascata */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-5 py-3">
          <p className="text-sm font-semibold">Resultado da rede · {periodLabel}</p>
          <p className="text-[11px] text-muted-foreground">
            Do faturamento bruto ao resultado operacional
          </p>
        </div>
        <div className="divide-y">
          {dre.map((line) => (
            <div
              key={line.label}
              className={`flex items-center justify-between gap-3 px-5 py-2.5 ${
                line.kind === "sum" ? "bg-muted/30" : ""
              }`}
            >
              <div className="min-w-0">
                <p
                  className={`truncate text-sm ${
                    line.strong
                      ? "font-bold"
                      : line.kind === "sum"
                        ? "font-semibold"
                        : "text-muted-foreground"
                  }`}
                >
                  {line.kind === "minus" && (
                    <span className="mr-1 text-rose-500">−</span>
                  )}
                  {line.kind === "plus" && (
                    <span className="mr-1 text-emerald-500">+</span>
                  )}
                  {line.kind === "sum" && <span className="mr-1">=</span>}
                  {line.label}
                </p>
                {line.note && (
                  <p className="text-[10px] text-muted-foreground">{line.note}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2 tabular-nums">
                {line.pct !== undefined && (
                  <span
                    className={`text-[11px] font-medium ${
                      line.value >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {fmtPct(line.pct)}
                  </span>
                )}
                <span
                  className={`text-sm ${
                    line.strong ? "font-bold" : "font-medium"
                  } ${
                    line.kind === "minus"
                      ? "text-rose-600 dark:text-rose-400"
                      : ""
                  }`}
                >
                  {fmtBRL(line.value)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2 — Atalhos pros relatórios detalhados */}
      <SectionDivider number={2} label="Relatórios detalhados" />
      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        data-print="hide"
      >
        {atalhos.map((a) => {
          const Icon = a.icon
          return (
            <Link
              key={a.href}
              href={a.href}
              className="group flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-sm font-semibold">
                  {a.title}
                  <ArrowRight className="size-3.5 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{a.desc}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
