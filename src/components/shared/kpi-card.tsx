import Link from "next/link"
import { ArrowUpRight, type LucideIcon } from "lucide-react"

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
  /** Se presente, o card vira link pra essa tela. */
  href?: string
}

const toneClass: Record<KpiTone, string> = {
  positive: "text-emerald-600 dark:text-emerald-400",
  neutral: "text-muted-foreground",
  warning: "text-amber-600 dark:text-amber-400",
}

export function KpiCard({ kpi }: { kpi: Kpi }) {
  const Icon = kpi.icon
  const clickable = Boolean(kpi.href)

  const card = (
    <div
      className={`relative h-full rounded-xl border bg-card p-3.5 shadow-sm ${
        clickable
          ? "transition-colors hover:border-primary/40 hover:bg-muted/30"
          : ""
      }`}
    >
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

      {clickable && (
        <ArrowUpRight className="absolute right-2.5 top-2.5 size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover/kpi:opacity-100" />
      )}
    </div>
  )

  if (kpi.href) {
    return (
      <Link href={kpi.href} className="group/kpi block">
        {card}
      </Link>
    )
  }
  return card
}
