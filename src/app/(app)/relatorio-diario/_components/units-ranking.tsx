import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import type { DailyMetric } from "@/lib/data/relatorio-diario-types"
import { fmtPct } from "@/lib/format"

export type RankingUnit = {
  code: string
  name: string
  value: number
  label: string
  /** % que a loja representa do total da rede (null = não aplicável) */
  share: number | null
  series: number[] // valor por dia (pro sparkline)
}

const METRIC_BAR: Record<DailyMetric, string> = {
  faturamento: "bg-emerald-500/80",
  pedidos: "bg-indigo-500/80",
  cancelamentos: "bg-rose-500/80",
}
const METRIC_SPARK: Record<DailyMetric, string> = {
  faturamento: "bg-emerald-400/70",
  pedidos: "bg-indigo-400/70",
  cancelamentos: "bg-rose-400/70",
}

/**
 * Ranking de lojas por métrica: barra horizontal proporcional + mini
 * sparkline + valor + % do total da rede. Ordenado pelo valor (desc).
 */
export function UnitsRanking({
  units,
  metric,
  metricLabel,
  platforms,
}: {
  units: RankingUnit[]
  metric: DailyMetric
  metricLabel: string
  platforms: PlatformId[]
}) {
  const max = Math.max(...units.map((u) => u.value), 1)
  const barColor = METRIC_BAR[metric]
  const sparkColor = METRIC_SPARK[metric]
  const shareLabel =
    metric === "cancelamentos" ? "dos cancelamentos" : "do total"

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <h3 className="text-sm font-semibold">
          Ranking por loja · {metricLabel}
        </h3>
        <div className="flex items-center gap-0.5">
          {platforms.map((p) => (
            <PlatformLogo key={p} platform={p} size="sm" />
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {units.map((u) => {
          const seriesMax = Math.max(...u.series, 0)
          return (
            <div key={u.code} className="flex items-center gap-3">
              {/* Loja */}
              <div className="flex w-36 shrink-0 items-center gap-1.5">
                <span className="inline-flex shrink-0 items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                  #{u.code}
                </span>
                <span className="truncate text-xs font-medium">{u.name}</span>
              </div>

              {/* Barra proporcional */}
              <div className="relative h-5 flex-1 overflow-hidden rounded bg-muted/50">
                <div
                  className={`h-full ${barColor}`}
                  style={{ width: `${(u.value / max) * 100}%` }}
                />
              </div>

              {/* Sparkline */}
              <div className="hidden h-6 w-24 items-end gap-px sm:flex">
                {u.series.map((v, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-[1px] ${
                      v > 0 ? sparkColor : "bg-muted"
                    }`}
                    style={{
                      height: `${
                        seriesMax > 0 && v > 0
                          ? Math.max(10, (v / seriesMax) * 100)
                          : 2
                      }%`,
                    }}
                  />
                ))}
              </div>

              {/* Valor + % */}
              <div className="w-24 shrink-0 text-right">
                <p className="text-xs font-semibold tabular-nums">{u.label}</p>
                {u.share !== null && (
                  <p
                    className="text-[10px] tabular-nums text-muted-foreground"
                    title={`${fmtPct(u.share)} ${shareLabel} da rede`}
                  >
                    {fmtPct(u.share)} {shareLabel}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
