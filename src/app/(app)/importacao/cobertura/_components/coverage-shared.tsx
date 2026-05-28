/**
 * Componentes visuais compartilhados pelas views de cobertura
 * (iFood, 99 Food e futuras plataformas).
 */

import type { CoverageStatus } from "@/lib/data/ifood-imported"

type Tone = "blue" | "amber" | "emerald" | "rose" | "violet"

export function StatCard({
  icon: Icon,
  label,
  complete,
  partial,
  total,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  complete: number
  partial: number
  total: number
  color: Tone
}) {
  const completePct = total > 0 ? (complete / total) * 100 : 0
  const partialPct = total > 0 ? (partial / total) * 100 : 0
  const colors: Record<Tone, string> = {
    blue: "bg-blue-500",
    amber: "bg-amber-500",
    emerald: "bg-emerald-500",
    rose: "bg-rose-500",
    violet: "bg-violet-500",
  }
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold">{label}</span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {complete + partial}/{total}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums">
          {completePct.toFixed(0)}%
        </span>
        <span className="text-[11px] text-muted-foreground">completo</span>
        {partial > 0 && (
          <span className="text-[10px] text-amber-700 dark:text-amber-400">
            +{partialPct.toFixed(0)}% parcial
          </span>
        )}
      </div>
      <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${colors[color]}`}
          style={{ width: `${completePct}%` }}
        />
        <div
          className="h-full bg-amber-300 dark:bg-amber-700"
          style={{ width: `${partialPct}%` }}
        />
      </div>
    </div>
  )
}

export function CoverageBadge({
  status,
  label,
  tone,
  tooltip,
}: {
  status: CoverageStatus
  label: string
  tone: Tone
  tooltip: string
}) {
  const toneStyles: Record<
    Tone,
    { complete: string; partial: string }
  > = {
    blue: {
      complete: "bg-blue-500 text-white",
      partial:
        "bg-blue-200 text-blue-900 dark:bg-blue-900/40 dark:text-blue-300",
    },
    amber: {
      complete: "bg-amber-500 text-white",
      partial:
        "bg-amber-200 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300",
    },
    emerald: {
      complete: "bg-emerald-500 text-white",
      partial:
        "bg-emerald-200 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-300",
    },
    rose: {
      complete: "bg-rose-500 text-white",
      partial:
        "bg-rose-200 text-rose-900 dark:bg-rose-900/40 dark:text-rose-300",
    },
    violet: {
      complete: "bg-violet-500 text-white",
      partial:
        "bg-violet-200 text-violet-900 dark:bg-violet-900/40 dark:text-violet-300",
    },
  }
  const cls =
    status === "complete"
      ? toneStyles[tone].complete
      : status === "partial"
        ? toneStyles[tone].partial
        : "bg-muted text-muted-foreground/40"
  return (
    <span
      title={tooltip}
      className={`inline-flex size-5 items-center justify-center rounded-md text-[10px] font-bold ${cls}`}
    >
      {label}
    </span>
  )
}

export function LegendItem({ label, name }: { label: string; name: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-flex size-5 items-center justify-center rounded-md bg-foreground text-[10px] font-bold text-background">
        {label}
      </span>
      {name}
    </div>
  )
}

export function StatusLegend({
  status,
  label,
}: {
  status: CoverageStatus
  label: string
}) {
  const cls =
    status === "complete"
      ? "bg-emerald-500"
      : status === "partial"
        ? "bg-amber-400"
        : "bg-muted border"
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block size-3 rounded ${cls}`} />
      {label}
    </div>
  )
}
