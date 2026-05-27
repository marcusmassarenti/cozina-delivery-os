import type { LucideIcon } from "lucide-react"

export type KpiTone = "positive" | "neutral" | "warning"

export type Kpi = {
  label: string
  value: string
  trend?: string
  tone?: KpiTone
  icon: LucideIcon
}

const toneClass: Record<KpiTone, string> = {
  positive: "text-emerald-600 dark:text-emerald-400",
  neutral: "text-muted-foreground",
  warning: "text-amber-600 dark:text-amber-400",
}

export function KpiCard({ kpi }: { kpi: Kpi }) {
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
      {kpi.trend ? (
        <p className={`mt-1 text-[11px] font-medium ${toneClass[kpi.tone ?? "neutral"]}`}>
          {kpi.trend}
        </p>
      ) : null}
    </div>
  )
}
