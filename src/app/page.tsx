import {
  CalendarDays,
  DollarSign,
  Filter,
  Percent,
  Receipt,
  TrendingUp,
} from "lucide-react"

import { UnitsTable } from "@/components/dashboard/units-table"
import { PlatformLogo } from "@/components/platform-logo"
import { KpiCard, type Kpi } from "@/components/shared/kpi-card"
import { SectionDivider } from "@/components/shared/section-divider"
import { createClient } from "@/lib/supabase/server"
import {
  fmtBRL,
  fmtBRLShort,
  fmtNum,
  fmtPct,
  networkTotals,
  platformTotals,
  units,
} from "@/lib/sample-data"

async function checkSupabase() {
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.getUser()
    if (error && error.message !== "Auth session missing!") {
      return { ok: false, message: error.message }
    }
    return { ok: true, message: "Supabase conectado · sem dados reais ainda" }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro desconhecido",
    }
  }
}

const kpis: Kpi[] = [
  {
    label: "Pedidos Totais",
    value: fmtNum(networkTotals.pedidos),
    trend: "+100,0% vs mês ant.",
    tone: "positive",
    icon: CalendarDays,
  },
  {
    label: "Média Pedidos/Dia",
    value: fmtNum(networkTotals.mediaDia),
    trend: "+100,0% vs mês ant.",
    tone: "positive",
    icon: CalendarDays,
  },
  {
    label: "Ticket Médio",
    value: fmtBRL(networkTotals.mediaTicket),
    trend: "+5,2% vs mês ant.",
    tone: "positive",
    icon: Receipt,
  },
  {
    label: "Total Bruto",
    value: fmtBRLShort(networkTotals.faturamentoBruto),
    trend: "+100,0% vs mês ant.",
    tone: "positive",
    icon: DollarSign,
  },
  {
    label: "Total Líquido",
    value: fmtBRLShort(networkTotals.faturamentoLiquido),
    trend: "+100,0% vs mês ant.",
    tone: "positive",
    icon: DollarSign,
  },
  {
    label: "Taxa de Repasse",
    value: fmtPct(networkTotals.taxaRepasse),
    trend: "Acima da média do setor (~62%)",
    tone: "positive",
    icon: Percent,
  },
]

export default async function Home() {
  const status = await checkSupabase()

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent-foreground">
              Demonstração
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Visão geral · terça-feira, 26 de maio
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-xs font-medium transition-colors hover:bg-muted"
          >
            <TrendingUp className="size-3.5" />
            Com faturamento
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-xs font-medium transition-colors hover:bg-muted"
          >
            <Filter className="size-3.5" />
            Filtrar Unidades
            <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-[10px] font-semibold text-background">
              {units.filter((u) => u.active).length}
            </span>
          </button>
        </div>
      </div>

      {/* Supabase status */}
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
        <span className="font-medium">{status.message}</span>
      </div>

      {/* Section 1: Performance da Operação */}
      <SectionDivider number={1} label="Performance da Operação" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      {/* Section 2: Visão Geral por Plataforma */}
      <SectionDivider number={2} label="Visão Geral por Plataforma (rede)" />
      <div className="grid gap-3 md:grid-cols-3">
        {platformTotals.map((p) => (
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

      {/* Section 3: Detalhamento por Unidade */}
      <SectionDivider number={3} label="Detalhamento por Unidade" />
      <UnitsTable units={units} />
    </div>
  )
}
