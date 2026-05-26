import {
  DollarSign,
  Receipt,
  ShoppingCart,
  TrendingUp,
} from "lucide-react"

type KpiStatus = "positive" | "attention" | "neutral"

type Kpi = {
  label: string
  value: string
  hint: string
  status: { label: string; tone: KpiStatus }
  icon: React.ComponentType<{ className?: string }>
}

const kpis: Kpi[] = [
  {
    label: "Pedidos Totais",
    value: "—",
    hint: "Mês atual",
    status: { label: "Sem dados", tone: "neutral" },
    icon: ShoppingCart,
  },
  {
    label: "Ticket Médio",
    value: "R$ —",
    hint: "vs mês anterior",
    status: { label: "Sem dados", tone: "neutral" },
    icon: Receipt,
  },
  {
    label: "Total Bruto",
    value: "R$ —",
    hint: "vs mês anterior",
    status: { label: "Sem dados", tone: "neutral" },
    icon: DollarSign,
  },
  {
    label: "Total Líquido",
    value: "R$ —",
    hint: "Taxa repasse: —",
    status: { label: "Sem dados", tone: "neutral" },
    icon: TrendingUp,
  },
]

const statusStyles: Record<KpiStatus, string> = {
  positive: "bg-emerald-100 text-emerald-700",
  attention: "bg-rose-100 text-rose-700",
  neutral: "bg-muted text-muted-foreground",
}

export default function Home() {
  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Dashboard CEO
          </h1>
          <span className="text-xs text-muted-foreground">Delivery</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Visão geral · terça-feira, 26 de maio
        </p>
      </div>

      <SectionDivider number={1} label="Performance Operacional — Pedidos e Faturamento" />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>

      <SectionDivider number={2} label="Esqueleto em construção" />

      <div className="rounded-xl border border-dashed bg-card p-10 text-center">
        <p className="text-sm font-medium">
          Aqui vão entrar: tabela por unidade, margem por plataforma, top produtos
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Próximo passo: conectar Supabase e modelar entidades multi-tenant
        </p>
      </div>
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
      <div className="flex items-start justify-between">
        <div className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Icon className="size-5" />
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyles[kpi.status.tone]}`}
        >
          {kpi.status.label}
        </span>
      </div>
      <div className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {kpi.label}
        </p>
        <p className="mt-1.5 text-2xl font-bold tracking-tight">{kpi.value}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{kpi.hint}</p>
      </div>
    </div>
  )
}
