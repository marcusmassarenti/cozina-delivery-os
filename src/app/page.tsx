import {
  CalendarDays,
  ChevronRight,
  DollarSign,
  Filter,
  Percent,
  Receipt,
  ShoppingCart,
  TrendingUp,
} from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { createClient } from "@/lib/supabase/server"

//----------------------------------------------------------------
// Sample data (substituir por dados reais quando iFood + manuais conectarem)
//----------------------------------------------------------------

type Kpi = {
  label: string
  value: string
  trend: string
  icon: React.ComponentType<{ className?: string }>
}

const kpis: Kpi[] = [
  { label: "Pedidos Totais", value: "8.296", trend: "+100,0% vs mês anterior", icon: CalendarDays },
  { label: "Média Pedidos/Dia", value: "277", trend: "+100,0% vs mês anterior", icon: CalendarDays },
  { label: "Ticket Médio", value: "R$ 64", trend: "+100,0% vs mês anterior", icon: Receipt },
  { label: "Total Bruto", value: "R$ 529,8k", trend: "+100,0% vs mês anterior", icon: DollarSign },
  { label: "Total Líquido", value: "R$ 348,6k", trend: "+100,0% vs mês anterior", icon: DollarSign },
  { label: "Taxa de Repasse", value: "65,8%", trend: "+100,0% vs mês anterior", icon: Percent },
]

type Platform = {
  id: PlatformId
  name: string
  bruto: string
  liquido: string
  taxas: string
  pctLoja: number
  pctTaxas: number
}

const platforms: Platform[] = [
  { id: "ifood", name: "iFood", bruto: "R$ 96,2k", liquido: "R$ 59,8k", taxas: "R$ 36,4k", pctLoja: 62.2, pctTaxas: 37.8 },
  { id: "99food", name: "99 Food", bruto: "R$ 26,8k", liquido: "R$ 19,7k", taxas: "R$ 7,1k", pctLoja: 73.6, pctTaxas: 26.4 },
  { id: "keeta", name: "Keeta", bruto: "R$ 64,7k", liquido: "R$ 40,3k", taxas: "R$ 24,4k", pctLoja: 62.2, pctTaxas: 37.8 },
]

type Unit = {
  code: string
  name: string
  pedidos: string
  ticket: string
  bruto: string
  liquido: string
}

const units: Unit[] = [
  { code: "2",  name: "Churrasco no Pote — JK",                 pedidos: "3.600", ticket: "R$ 60,65", bruto: "R$ 216.646,43", liquido: "R$ 146.835,99" },
  { code: "4",  name: "Churrasco no Pote — Brooklin",           pedidos: "1.476", ticket: "R$ 65,41", bruto: "R$ 96.182,75",  liquido: "R$ 60.838,30"  },
  { code: "5",  name: "Churrasco no Pote — Hortolândia",        pedidos: "—",     ticket: "R$ —",     bruto: "R$ —",          liquido: "R$ —"          },
  { code: "10", name: "Churrasco no Pote — Ribeirão Preto",     pedidos: "83",    ticket: "R$ 63,53", bruto: "R$ 5.211,64",   liquido: "R$ 2.883,87"   },
  { code: "11", name: "Churrasco no Pote — São José dos Campos",pedidos: "335",   ticket: "R$ 68,71", bruto: "R$ 22.770,83",  liquido: "R$ 14.575,10"  },
  { code: "12", name: "Churrasco no Pote — Tatuapé",            pedidos: "126",   ticket: "R$ 82,22", bruto: "R$ 10.359,69",  liquido: "R$ 7.045,13"   },
]

//----------------------------------------------------------------
// Supabase connection check
//----------------------------------------------------------------

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

//----------------------------------------------------------------
// Page
//----------------------------------------------------------------

export default async function Home() {
  const supabaseStatus = await checkSupabase()

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <PageHeader />

      <ConnectionBadge status={supabaseStatus} />

      <SectionDivider number={1} label="Performance Geral" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <SectionDivider number={2} label="Margem de Ganho por Plataforma" />
      <div className="grid gap-4 md:grid-cols-3">
        {platforms.map((p) => (
          <PlatformMarginCard key={p.id} platform={p} />
        ))}
      </div>

      <SectionDivider number={3} label="Detalhamento por Unidade" />
      <UnitTable />
    </div>
  )
}

//----------------------------------------------------------------
// Components
//----------------------------------------------------------------

function PageHeader() {
  return (
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
        <ToolbarButton>
          <TrendingUp className="size-3.5" />
          Com faturamento
        </ToolbarButton>
        <ToolbarButton>
          <Filter className="size-3.5" />
          Filtrar Unidades
          <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-[10px] font-semibold text-background">
            10
          </span>
        </ToolbarButton>
      </div>
    </div>
  )
}

function ToolbarButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-xs font-medium transition-colors hover:bg-muted"
    >
      {children}
    </button>
  )
}

function ConnectionBadge({
  status,
}: {
  status: { ok: boolean; message: string }
}) {
  return (
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
  )
}

function SectionDivider({
  number,
  label,
}: {
  number: number
  label: string
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {number}
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  const Icon = kpi.icon
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Icon className="size-4" />
      </div>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {kpi.label}
      </p>
      <p className="mt-1.5 text-2xl font-bold tracking-tight">{kpi.value}</p>
      <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
        <TrendingUp className="size-3" />
        {kpi.trend}
      </p>
    </div>
  )
}

function PlatformMarginCard({ platform }: { platform: Platform }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <PlatformLogo platform={platform.id} size="md" />
          <div>
            <p className="text-sm font-semibold">{platform.name}</p>
            <p className="text-[11px] text-muted-foreground">
              Divisão entre receita líquida e taxas
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Bruto
          </p>
          <p className="text-sm font-bold">{platform.bruto}</p>
        </div>
      </div>

      <div className="mt-4 flex h-7 overflow-hidden rounded-md text-[11px] font-semibold">
        <div
          className="flex items-center justify-center bg-emerald-500 text-white"
          style={{ width: `${platform.pctLoja}%` }}
        >
          {platform.pctLoja.toFixed(1)}% Loja
        </div>
        <div
          className="flex items-center justify-center bg-slate-600 text-white"
          style={{ width: `${platform.pctTaxas}%` }}
        >
          {platform.pctTaxas.toFixed(1)}% Taxas
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span className="text-emerald-600 dark:text-emerald-400">
          Líquido: <span className="font-semibold">{platform.liquido}</span>
        </span>
        <span className="text-muted-foreground">
          Taxas: <span className="font-semibold">{platform.taxas}</span>
        </span>
      </div>
    </div>
  )
}

function UnitTable() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="grid grid-cols-[2fr_repeat(4,_1fr)_auto] items-center gap-4 border-b px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <div>Unidade / Plataforma</div>
        <div className="text-right">Pedidos</div>
        <div className="text-right">Ticket Médio</div>
        <div className="text-right">Total Bruto</div>
        <div className="text-right">Total Líquido</div>
        <div className="text-right">Status</div>
      </div>

      {units.map((u, idx) => (
        <div
          key={u.code}
          className={`grid grid-cols-[2fr_repeat(4,_1fr)_auto] items-center gap-4 px-5 py-4 text-sm ${
            idx < units.length - 1 ? "border-b" : ""
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <span className="text-[11px] font-bold">{u.code}</span>
            </div>
            <span className="font-medium">{u.name}</span>
          </div>
          <div className="text-right tabular-nums">{u.pedidos}</div>
          <div className="text-right tabular-nums text-muted-foreground">
            {u.ticket}
          </div>
          <div className="text-right tabular-nums font-semibold">{u.bruto}</div>
          <div className="text-right tabular-nums font-semibold">
            {u.liquido}
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-primary hover:bg-accent"
          >
            Ver detalhes
            <ChevronRight className="size-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
