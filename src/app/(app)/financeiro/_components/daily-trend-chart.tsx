"use client"

import * as React from "react"
import { CalendarDays, ShoppingBag } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { fmtBRL, fmtBRLShort, fmtNum } from "@/lib/format"

export type DailySeries = {
  days: number[]
  faturamento: Record<number, number>
  pedidos: Record<number, number>
}

const pad = (d: number) => String(d).padStart(2, "0")

const TONE = {
  emerald: { bar: "bg-emerald-500/55 hover:bg-emerald-500", active: "bg-emerald-500" },
  sky: { bar: "bg-sky-500/55 hover:bg-sky-500", active: "bg-sky-500" },
} as const

/**
 * Tendência diária da rede com seletor de plataforma. Recebe as séries já
 * prontas por plataforma (somadas no servidor) e troca no cliente — sem
 * round-trip. Os dois gráficos (faturamento + pedidos) compartilham o dia em
 * hover, então passar o mouse num dia mostra o valor E os pedidos daquele dia.
 */
export function DailyTrendChart({
  data,
  platforms,
}: {
  data: Partial<Record<"todas" | PlatformId, DailySeries>>
  platforms: PlatformId[]
}) {
  const [sel, setSel] = React.useState<"todas" | PlatformId>("todas")
  const [hoverDay, setHoverDay] = React.useState<number | null>(null)
  const multi = platforms.length > 1

  const s =
    data[sel] ?? data.todas ?? { days: [], faturamento: {}, pedidos: {} }
  const fatDia = hoverDay != null ? s.faturamento[hoverDay] ?? 0 : 0
  const pedDia = hoverDay != null ? s.pedidos[hoverDay] ?? 0 : 0

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Tendência diária da rede</h2>
        {hoverDay != null && (
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums">
            Dia {pad(hoverDay)} · {fmtBRL(fatDia)} · {fmtNum(pedDia)} ped
          </span>
        )}
        {multi && (
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSel("todas")}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                sel === "todas"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Todas
            </button>
            {platforms.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setSel(p)}
                aria-label={p}
                className={`flex items-center rounded-md p-1 transition-colors ${
                  sel === p
                    ? "bg-primary/10 ring-1 ring-primary"
                    : "hover:bg-muted"
                }`}
              >
                <PlatformLogo platform={p} size="sm" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <MetricChart
          icon={<CalendarDays className="size-4 text-muted-foreground" />}
          title="Faturamento por dia"
          dias={s.days}
          valores={s.faturamento}
          tone="emerald"
          format={fmtBRL}
          formatShort={fmtBRLShort}
          hoverDay={hoverDay}
          setHoverDay={setHoverDay}
          emptyLabel="Sem faturamento no mês."
        />
        <MetricChart
          icon={<ShoppingBag className="size-4 text-muted-foreground" />}
          title="Pedidos por dia"
          dias={s.days}
          valores={s.pedidos}
          tone="sky"
          format={(n) => `${fmtNum(n)} pedidos`}
          formatShort={(n) => `${fmtNum(n)} ped`}
          hoverDay={hoverDay}
          setHoverDay={setHoverDay}
          emptyLabel="Sem pedidos no mês."
        />
      </div>
    </div>
  )
}

function MetricChart({
  icon,
  title,
  dias,
  valores,
  tone,
  format,
  formatShort,
  hoverDay,
  setHoverDay,
  emptyLabel,
}: {
  icon: React.ReactNode
  title: string
  dias: number[]
  valores: Record<number, number>
  tone: keyof typeof TONE
  format: (n: number) => string
  formatShort: (n: number) => string
  hoverDay: number | null
  setHoverDay: (d: number | null) => void
  emptyLabel: string
}) {
  const max = Math.max(...dias.map((d) => valores[d] ?? 0), 1)
  const total = dias.reduce((a, d) => a + (valores[d] ?? 0), 0)
  const t = TONE[tone]

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
          {hoverDay != null
            ? `Dia ${pad(hoverDay)}: ${format(valores[hoverDay] ?? 0)}`
            : `${formatShort(total)} no mês`}
        </span>
      </div>
      {total <= 0 ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div>
          <div className="flex h-28 items-end gap-px">
            {dias.map((d) => {
              const v = valores[d] ?? 0
              const h = v > 0 ? Math.max(3, (v / max) * 100) : 0
              const active = hoverDay === d
              return (
                <div
                  key={d}
                  onMouseEnter={() => setHoverDay(d)}
                  onMouseLeave={() => setHoverDay(null)}
                  className={`flex-1 cursor-default rounded-t transition-colors ${
                    active ? t.active : t.bar
                  }`}
                  style={{ height: `${h}%` }}
                  title={`Dia ${pad(d)}: ${format(v)}`}
                />
              )
            })}
          </div>
          <div className="mt-1 flex justify-between text-[9px] text-muted-foreground">
            <span>dia 01</span>
            <span>pico {formatShort(max)}</span>
            <span>dia {dias.length}</span>
          </div>
        </div>
      )}
    </div>
  )
}
