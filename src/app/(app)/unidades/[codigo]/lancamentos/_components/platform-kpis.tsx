"use client"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import type { PlatformSummary } from "@/lib/data/lancamentos"

const PLATFORMS: { id: PlatformId; label: string }[] = [
  { id: "ifood", label: "iFood" },
  { id: "99food", label: "99 Food" },
  { id: "keeta", label: "Keeta" },
]

export function PlatformKpis({
  summary,
}: {
  summary: Record<PlatformId, PlatformSummary>
}) {
  // Total da rede pra calcular share
  const totalFat = PLATFORMS.reduce(
    (acc, p) => acc + summary[p.id].faturamento,
    0,
  )

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {PLATFORMS.map((p) => {
        const s = summary[p.id]
        const share = totalFat > 0 ? (s.faturamento / totalFat) * 100 : 0
        return (
          <div
            key={p.id}
            className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PlatformLogo platform={p.id} size="md" />
                <span className="text-sm font-semibold">{p.label}</span>
              </div>
              <span className="text-[10px] font-medium text-muted-foreground">
                {fmtPct(share)} da rede
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <Kpi label="Faturamento" value={fmtBRL(s.faturamento)} highlight />
              <Kpi label="Pedidos" value={fmtNum(s.pedidos)} />
              <Kpi label="Ticket Médio" value={fmtBRL(s.ticketMedio)} />
              <Kpi
                label="% Cancelado"
                value={fmtPct(s.pctCancelamento)}
                tone={s.pctCancelamento > 5 ? "warning" : undefined}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Kpi({
  label,
  value,
  highlight,
  tone,
}: {
  label: string
  value: string
  highlight?: boolean
  tone?: "warning"
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-0.5 text-sm font-bold tabular-nums ${
          highlight
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "warning"
              ? "text-amber-600 dark:text-amber-400"
              : ""
        }`}
      >
        {value}
      </p>
    </div>
  )
}
