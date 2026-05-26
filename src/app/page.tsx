import {
  CalendarDays,
  ChevronRight,
  DollarSign,
  Filter,
  Percent,
  PiggyBank,
  Receipt,
  Star,
  TrendingUp,
  XCircle,
} from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { createClient } from "@/lib/supabase/server"

//----------------------------------------------------------------
// Tipos e dados de demonstração
//----------------------------------------------------------------

type Tone = "positive" | "neutral" | "warning"

type Kpi = {
  label: string
  value: string
  trend: string
  tone: Tone
  icon: React.ComponentType<{ className?: string }>
}

const kpisOperacao: Kpi[] = [
  { label: "Pedidos Totais",      value: "8.296",      trend: "+100,0% vs mês ant.", tone: "positive", icon: CalendarDays },
  { label: "Faturamento Bruto",   value: "R$ 529,8k",  trend: "+100,0% vs mês ant.", tone: "positive", icon: DollarSign },
  { label: "Faturamento Líquido", value: "R$ 348,6k",  trend: "+100,0% vs mês ant.", tone: "positive", icon: DollarSign },
  { label: "Ticket Médio",        value: "R$ 64",      trend: "+5,2% vs mês ant.",    tone: "positive", icon: Receipt },
]

const kpisSaude: Kpi[] = [
  { label: "Margem Bruta",        value: "—",          trend: "Aguardando compras Cozina (Mai/26)", tone: "neutral",  icon: PiggyBank },
  { label: "Taxa de Repasse",     value: "65,8%",      trend: "Acima da média da rede",            tone: "positive", icon: Percent },
  { label: "Nota Média",          value: "4,7",        trend: "↗ 0,1 vs mês ant.",                  tone: "positive", icon: Star },
  { label: "Cancelamentos",       value: "2,1%",       trend: "Dentro do limite (<3%)",            tone: "positive", icon: XCircle },
]

type Platform = {
  id: PlatformId
  name: string
  bruto: string
  liquido: string
  pctLoja: number
}

type Unit = {
  code: string
  name: string
  city: string
  state: string
  pedidos: string
  ticket: string
  bruto: string
  liquido: string
  platforms: Platform[]
}

const units: Unit[] = [
  {
    code: "02", name: "Churrasco no Pote — JK", city: "São Paulo", state: "SP",
    pedidos: "3.600", ticket: "R$ 60,65", bruto: "R$ 216.646", liquido: "R$ 146.836",
    platforms: [
      { id: "ifood",  name: "iFood",   bruto: "R$ 130k", liquido: "R$ 84k", pctLoja: 64.8 },
      { id: "99food", name: "99 Food", bruto: "R$ 54k",  liquido: "R$ 40k", pctLoja: 74.1 },
      { id: "keeta",  name: "Keeta",   bruto: "R$ 32k",  liquido: "R$ 20k", pctLoja: 62.5 },
    ],
  },
  {
    code: "04", name: "Churrasco no Pote — Brooklin", city: "São Paulo", state: "SP",
    pedidos: "1.476", ticket: "R$ 65,41", bruto: "R$ 96.183", liquido: "R$ 60.838",
    platforms: [
      { id: "ifood",  name: "iFood",   bruto: "R$ 58k", liquido: "R$ 36k", pctLoja: 62.1 },
      { id: "99food", name: "99 Food", bruto: "R$ 22k", liquido: "R$ 16k", pctLoja: 73.0 },
      { id: "keeta",  name: "Keeta",   bruto: "R$ 16k", liquido: "R$ 9k",  pctLoja: 56.3 },
    ],
  },
  {
    code: "05", name: "Churrasco no Pote — Hortolândia", city: "Hortolândia", state: "SP",
    pedidos: "—", ticket: "R$ —", bruto: "R$ —", liquido: "R$ —",
    platforms: [
      { id: "ifood",  name: "iFood",   bruto: "—", liquido: "—", pctLoja: 0 },
      { id: "99food", name: "99 Food", bruto: "—", liquido: "—", pctLoja: 0 },
      { id: "keeta",  name: "Keeta",   bruto: "—", liquido: "—", pctLoja: 0 },
    ],
  },
  {
    code: "10", name: "Churrasco no Pote — Ribeirão Preto", city: "Ribeirão Preto", state: "SP",
    pedidos: "83", ticket: "R$ 63,53", bruto: "R$ 5.212", liquido: "R$ 2.884",
    platforms: [
      { id: "ifood",  name: "iFood",   bruto: "R$ 3,2k", liquido: "R$ 1,7k", pctLoja: 53.1 },
      { id: "99food", name: "99 Food", bruto: "R$ 1,2k", liquido: "R$ 0,9k", pctLoja: 75.0 },
      { id: "keeta",  name: "Keeta",   bruto: "R$ 0,8k", liquido: "R$ 0,3k", pctLoja: 37.5 },
    ],
  },
  {
    code: "11", name: "Churrasco no Pote — São José dos Campos", city: "S. J. dos Campos", state: "SP",
    pedidos: "335", ticket: "R$ 68,71", bruto: "R$ 22.771", liquido: "R$ 14.575",
    platforms: [
      { id: "ifood",  name: "iFood",   bruto: "R$ 14k", liquido: "R$ 9k", pctLoja: 64.3 },
      { id: "99food", name: "99 Food", bruto: "R$ 5k",  liquido: "R$ 4k", pctLoja: 80.0 },
      { id: "keeta",  name: "Keeta",   bruto: "R$ 4k",  liquido: "R$ 2k", pctLoja: 50.0 },
    ],
  },
  {
    code: "12", name: "Churrasco no Pote — Tatuapé", city: "São Paulo", state: "SP",
    pedidos: "126", ticket: "R$ 82,22", bruto: "R$ 10.360", liquido: "R$ 7.045",
    platforms: [
      { id: "ifood",  name: "iFood",   bruto: "R$ 6,5k", liquido: "R$ 4,4k", pctLoja: 67.7 },
      { id: "99food", name: "99 Food", bruto: "R$ 2,1k", liquido: "R$ 1,6k", pctLoja: 76.2 },
      { id: "keeta",  name: "Keeta",   bruto: "R$ 1,8k", liquido: "R$ 1,0k", pctLoja: 55.6 },
    ],
  },
]

const platformOverview = [
  { id: "ifood"  as PlatformId, name: "iFood",   bruto: "R$ 96,2k", pct: 62.2 },
  { id: "99food" as PlatformId, name: "99 Food", bruto: "R$ 26,8k", pct: 73.6 },
  { id: "keeta"  as PlatformId, name: "Keeta",   bruto: "R$ 64,7k", pct: 62.2 },
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

      <SectionDivider number={1} label="Performance da Operação" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpisOperacao.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <SectionDivider number={2} label="Saúde do Negócio" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpisSaude.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <SectionDivider number={3} label="Visão Geral por Plataforma (rede)" />
      <div className="grid gap-3 md:grid-cols-3">
        {platformOverview.map((p) => (
          <PlatformOverviewPill key={p.id} platform={p} />
        ))}
      </div>

      <SectionDivider number={4} label="Detalhamento por Unidade" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {units.map((u) => (
          <UnitCard key={u.code} unit={u} />
        ))}
      </div>
    </div>
  )
}

//----------------------------------------------------------------
// Componentes auxiliares
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
  const toneClass: Record<Tone, string> = {
    positive: "text-emerald-600 dark:text-emerald-400",
    neutral: "text-muted-foreground",
    warning: "text-amber-600 dark:text-amber-400",
  }
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Icon className="size-4" />
      </div>
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {kpi.label}
      </p>
      <p className="mt-1.5 text-2xl font-bold tracking-tight">{kpi.value}</p>
      <p className={`mt-1 text-[11px] font-medium ${toneClass[kpi.tone]}`}>
        {kpi.trend}
      </p>
    </div>
  )
}

function PlatformOverviewPill({
  platform,
}: {
  platform: { id: PlatformId; name: string; bruto: string; pct: number }
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
      <PlatformLogo platform={platform.id} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold">{platform.name}</span>
          <span className="text-sm font-bold tabular-nums">
            {platform.bruto}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-emerald-500"
            style={{ width: `${platform.pct}%` }}
          />
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {platform.pct.toFixed(1)}% líquido pra loja
        </p>
      </div>
    </div>
  )
}

function UnitCard({ unit }: { unit: Unit }) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <span className="text-xs font-bold tabular-nums">{unit.code}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">{unit.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {unit.city} · {unit.state}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
        >
          Ver detalhes
          <ChevronRight className="size-3" />
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-center">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Pedidos
          </p>
          <p className="text-sm font-bold tabular-nums">{unit.pedidos}</p>
        </div>
        <div className="border-x">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Bruto
          </p>
          <p className="text-sm font-bold tabular-nums">{unit.bruto}</p>
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Líquido
          </p>
          <p className="text-sm font-bold tabular-nums">{unit.liquido}</p>
        </div>
      </div>

      {/* Platform breakdown */}
      <div className="flex flex-col gap-2.5">
        {unit.platforms.map((p) => (
          <PlatformRow key={p.id} platform={p} />
        ))}
      </div>
    </div>
  )
}

function PlatformRow({ platform }: { platform: Platform }) {
  const hasData = platform.pctLoja > 0
  return (
    <div className="flex items-center gap-2.5">
      <PlatformLogo platform={platform.id} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-medium">{platform.name}</span>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {hasData ? `${platform.pctLoja.toFixed(0)}% loja` : "—"}
          </span>
        </div>
        <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-muted">
          {hasData ? (
            <>
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${platform.pctLoja}%` }}
              />
              <div
                className="h-full bg-slate-400 dark:bg-slate-600"
                style={{ width: `${100 - platform.pctLoja}%` }}
              />
            </>
          ) : null}
        </div>
        <div className="mt-1 flex items-baseline justify-between text-[10px] text-muted-foreground">
          <span>Bruto {platform.bruto}</span>
          <span className="text-emerald-600 dark:text-emerald-400">
            Líq. {platform.liquido}
          </span>
        </div>
      </div>
    </div>
  )
}
