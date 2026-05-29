import type { DailyMetric } from "@/lib/data/relatorio-diario-types"

export type Bar = { day: number; value: number; label: string }

const METRIC_COLOR: Record<DailyMetric, string> = {
  faturamento: "bg-emerald-500",
  pedidos: "bg-indigo-500",
  cancelamentos: "bg-rose-500",
}
const METRIC_COLOR_MAX: Record<DailyMetric, string> = {
  faturamento: "bg-emerald-400",
  pedidos: "bg-indigo-400",
  cancelamentos: "bg-rose-400",
}

/**
 * Gráfico de barras do dia-a-dia da rede (CSS puro, sem lib).
 * Destaca o melhor dia. Tooltip nativo via `title`.
 */
export function DailyBarChart({
  bars,
  metric,
  metricLabel,
}: {
  bars: Bar[]
  metric: DailyMetric
  metricLabel: string
}) {
  const max = Math.max(...bars.map((b) => b.value), 0)
  const maxDay = bars.reduce(
    (best, b) => (b.value > best.value ? b : best),
    bars[0] ?? { day: 0, value: 0, label: "" },
  )
  const color = METRIC_COLOR[metric]
  const colorMax = METRIC_COLOR_MAX[metric]

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{metricLabel} por dia · rede</h3>
        {max > 0 && (
          <span className="text-[11px] text-muted-foreground">
            Melhor dia:{" "}
            <span className="font-semibold text-foreground">
              {String(maxDay.day).padStart(2, "0")}
            </span>{" "}
            ({maxDay.label})
          </span>
        )}
      </div>

      <div className="flex h-44 items-end gap-[3px]">
        {bars.map((b) => {
          const h = max > 0 ? (b.value / max) * 100 : 0
          const isMax = b.day === maxDay.day && b.value > 0
          return (
            <div
              key={b.day}
              className="group relative flex flex-1 items-end"
              style={{ height: "100%" }}
              title={`Dia ${String(b.day).padStart(2, "0")}: ${b.label}`}
            >
              <div
                className={`w-full rounded-t-sm transition-colors ${
                  b.value > 0 ? (isMax ? colorMax : color) : "bg-muted"
                } group-hover:opacity-80`}
                style={{ height: `${b.value > 0 ? Math.max(3, h) : 2}%` }}
              />
            </div>
          )
        })}
      </div>

      {/* Eixo X: dias */}
      <div className="mt-1.5 flex gap-[3px]">
        {bars.map((b) => (
          <span
            key={b.day}
            className="flex-1 text-center text-[8px] tabular-nums text-muted-foreground"
          >
            {b.day}
          </span>
        ))}
      </div>
    </div>
  )
}
