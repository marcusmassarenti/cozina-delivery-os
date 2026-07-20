import Link from "next/link"
import {
  AlertTriangle,
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
import { getAvailablePeriods, getAntecipacaoFeeByUnits } from "@/lib/data/ifood-imported"
import {
  getVisibleUnits,
  getTenantPlatforms,
  isApiSyncEnabled,
} from "@/lib/data/units"
import { assertCanView } from "@/lib/auth/permissions"
import { getAccessibleUnitIds } from "@/lib/auth/roles"
import { getNetworkReportForMonth } from "@/lib/data/relatorio-rede"
import { getNetworkDrePlatforms } from "@/lib/data/resultado"
import {
  DreDetalhado,
  type VrInfo,
} from "@/app/(app)/unidades/[codigo]/_components/dre-detalhado"
import { BrutoBreakdown } from "@/app/(app)/unidades/[codigo]/_components/bruto-breakdown"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import {
  formatPeriodKey,
  formatPeriodLabel,
  formatRangeLabel,
  monthsInRange,
  nowParts,
  parsePeriodParam,
  rangeDays,
  rangeFromPeriod,
  type DateRange,
} from "@/lib/period"

const ALL_PLATFORMS = ["ifood", "99food", "keeta"] as const
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Range do consolidado. Aceita mês, range de dias OU ano inteiro (até ~366 dias —
 * o cap de 92 dias do readPeriod é só pras telas de matriz diária). Como o DRE é
 * mensal, o range é agregado por MESES INTEIROS (ver monthsInRange).
 */
function parseWideRange(sp: {
  periodo?: string
  inicio?: string
  fim?: string
}): DateRange {
  const { inicio, fim } = sp
  if (inicio && fim && ISO_DAY.test(inicio) && ISO_DAY.test(fim) && fim >= inicio) {
    if (rangeDays({ start: inicio, end: fim }) <= 366) return { start: inicio, end: fim }
  }
  return rangeFromPeriod(parsePeriodParam(sp.periodo))
}

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; inicio?: string; fim?: string; lojas?: string }>
}) {
  const sp = await searchParams
  await assertCanView("relatorios")
  const range = parseWideRange(sp)
  const months = monthsInRange(range)
  // Mês de referência = o mais recente do período, mas nunca além do mês atual
  // (senão "ano inteiro" cairia em dezembro vazio).
  const now = nowParts()
  const nowKey = now.year * 12 + now.month
  const refMonth =
    [...months].reverse().find((p) => p.year * 12 + p.month <= nowKey) ??
    months[months.length - 1]
  const periodKey = formatPeriodKey(refMonth)

  const multiMonth = months.length > 1
  // O DRE mostrado é sempre de 1 mês (o de referência = mais recente do período).
  const periodLabel = formatPeriodLabel(refMonth)
  const rangeLabel = formatRangeLabel(range)

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
  const scopedIds = filterIds ?? allUnits.map((u) => u.id)
  const [tenantPlatforms, apiSync] = await Promise.all([
    getTenantPlatforms(scopedIds),
    isApiSyncEnabled(),
  ])
  const years = [
    ...new Set((await getAvailablePeriods()).map((p) => p.year)),
  ].sort((a, b) => b - a)

  // O DRE consolidado é MENSAL (CMV/operação por mês) e a apuração por plataforma
  // do iFood é pesada (~1,5s/mês). Mostra o mês de referência (mais recente do
  // período) — rápido. A soma de vários meses depende de uma query agregada
  // dedicada (a fazer); por ora o multi-mês exibe o mês de referência com aviso.
  const [report, drePlats, availablePeriods, antecipMap] = await Promise.all([
    getNetworkReportForMonth(refMonth.year, refMonth.month, filterIds),
    getNetworkDrePlatforms(refMonth.year, refMonth.month, filterIds),
    getAvailablePeriods(),
    getAntecipacaoFeeByUnits(scopedIds, refMonth.year, refMonth.month),
  ])
  const t = report.totals
  const antecipTotal = Array.from(antecipMap.values()).reduce((a, b) => a + b, 0)

  // VR da rede pro DRE detalhado (mesma regra do /financeiro e do detalhe da loja)
  const vrInfoRede: VrInfo | undefined =
    t.vrLiquido > 0
      ? {
          liquido: t.vrLiquido,
          bruto: t.vrLiquido / 0.92,
          taxa: t.vrLiquido / 0.92 - t.vrLiquido,
          porBandeira: [],
        }
      : undefined

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
            current={range}
            options={availablePeriods}
            enableRange
            enableYear
            years={years}
          />
          <ExportPdfButton />
        </div>
      </div>

      {multiMonth && (
        <div
          className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400"
          data-print="hide"
        >
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          <span>
            Você selecionou <strong>{rangeLabel}</strong>, mas o DRE consolidado é
            mensal (CMV/operação por mês). Mostrando o mês mais recente do período
            (<strong>{periodLabel}</strong>). Pra ver mês a mês, use o seletor de
            período no modo Mês.
          </span>
        </div>
      )}

      {!multiMonth && (
        <ImportCoverageBanner
          coverage={report.coverage}
          year={refMonth.year}
          month={refMonth.month}
          periodLabel={periodLabel}
          platformsEnabled={tenantPlatforms}
          apiSync={apiSync}
        />
      )}

      {/* 1 — Consolidado */}
      <SectionDivider number={1} label="Consolidado da rede" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      {/* DRE detalhado por plataforma (mesmo componente do detalhe da loja) */}
      {drePlats.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <DreDetalhado
              platforms={drePlats}
              totalBruto={t.bruto}
              totalLiquido={t.liquidoPlataformas}
              cmv={t.cmvTotal}
              operacao={t.custoOperacao}
              vrInfo={vrInfoRede}
              antecipacaoIfood={antecipTotal}
              title={`DRE da rede · ${periodLabel}`}
              totalLabel="Resultado total da rede"
            />
          </div>
          <BrutoBreakdown
            platforms={drePlats.map((p) => ({
              id: p.id,
              bruto: p.bruto,
              liquido: p.liquido,
              promocoesLoja: p.promocoesLoja ?? 0,
            }))}
            totalBruto={t.bruto}
            totalLiquido={t.liquidoPlataformas}
            cmv={t.cmvTotal}
            operacao={t.custoOperacao}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          Sem faturamento no período. Importe os relatórios em{" "}
          <a href="/importacao" className="underline">
            /importacao
          </a>
          .
        </div>
      )}

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
