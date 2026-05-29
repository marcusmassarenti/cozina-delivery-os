import type { LucideIcon } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"

export type KpiTone = "positive" | "neutral" | "warning"

export type Kpi = {
  label: string
  value: string
  trend?: string
  tone?: KpiTone
  icon: LucideIcon
  /** Plataformas que alimentam esse KPI. Aparece como mini badges no canto. */
  platforms?: PlatformId[]
}

const toneClass: Record<KpiTone, string> = {
  positive: "text-emerald-600 dark:text-emerald-400",
  neutral: "text-muted-foreground",
  warning: "text-amber-600 dark:text-amber-400",
}

export function KpiCard({ kpi }: { kpi: Kpi }) {
  const Icon = kpi.icon
  return (
    <div className="relative rounded-xl border bg-card p-3.5 shadow-sm">
      {/* Header: ícone + badges de plataforma */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <Icon className="size-3.5" />
        </div>
        {kpi.platforms && kpi.platforms.length > 0 && (
          <div className="flex items-center gap-0.5">
            {kpi.platforms.map((p) => (
              <PlatformLogo key={p} platform={p} size="sm" />
            ))}
          </div>
        )}
      </div>

      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {kpi.label}
      </p>
      <p className="mt-0.5 text-xl font-bold tracking-tight tabular-nums">
        {kpi.value}
      </p>
      {kpi.trend ? (
        <p
          className={`mt-0.5 text-[10px] font-medium ${toneClass[kpi.tone ?? "neutral"]}`}
        >
          {kpi.trend}
        </p>
      ) : null}
    </div>
  )
}
