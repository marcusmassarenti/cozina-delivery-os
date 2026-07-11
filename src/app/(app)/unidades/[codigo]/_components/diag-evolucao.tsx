"use client"

import * as React from "react"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { fmtBRL, fmtBRLShort, fmtNum } from "@/lib/format"

export type EvoPonto = {
  bruto: number
  pedidos: number
  ticket: number
  hasData: boolean
}

export type EvoSerie = {
  id: PlatformId
  label: string
  color: string
  pontos: EvoPonto[] // alinhado a `labels`
}

type MetricKey = "bruto" | "pedidos" | "ticket"

// Faturamento sem centavos (mais fácil de ler); ticket mantém centavos.
const brl0 = (n: number) => `R$ ${Math.round(n).toLocaleString("pt-BR")}`

const METRICS: {
  key: MetricKey
  label: string
  fmt: (n: number) => string
}[] = [
  { key: "bruto", label: "Faturamento", fmt: (n) => brl0(n) },
  { key: "pedidos", label: "Pedidos", fmt: (n) => fmtNum(n) },
  { key: "ticket", label: "Ticket médio", fmt: (n) => fmtBRL(n) },
]

/**
 * Evolução da operação nos últimos meses, UMA LINHA POR PLATAFORMA (cores da
 * consolidada) pra ver a evolução de cada uma. Abas trocam a métrica
 * (faturamento / pedidos / ticket). O valor grande é o TOTAL da operação.
 */
export function DiagEvolucao({
  labels,
  series,
}: {
  labels: string[]
  series: EvoSerie[]
}) {
  const [metric, setMetric] = React.useState<MetricKey>("bruto")
  const m = METRICS.find((x) => x.key === metric) ?? METRICS[0]
  const n = labels.length

  // Geometria
  const W = 600
  const H = 170
  const padX = 12
  const padY = 18
  const x = (i: number) => (n <= 1 ? W / 2 : padX + (i * (W - 2 * padX)) / (n - 1))

  const allVals: number[] = []
  series.forEach((s) =>
    s.pontos.forEach((p) => {
      if (p.hasData) allVals.push(p[metric])
    }),
  )
  // Zoom na faixa real dos dados (com folga) pra as linhas ocuparem o espaço
  // e o eixo mostrar valores de verdade — não um "R$ 0" lá embaixo.
  const rawMax = allVals.length ? Math.max(...allVals) : 1
  const rawMin = allVals.length ? Math.min(...allVals) : 0
  const maxV = rawMax * 1.04
  const minV = rawMin * 0.9
  const span = maxV - minV || 1
  const y = (v: number) => H - padY - ((v - minV) / span) * (H - 2 * padY)
  // Posição dos rótulos do eixo Y (% da altura do container), alinhada ao plot.
  const padTopPct = (padY / H) * 100
  const plotPct = ((H - 2 * padY) / H) * 100
  // Formato compacto pra caber no eixo.
  const axisFmt = (v: number) =>
    metric === "pedidos"
      ? v >= 1000
        ? `${(v / 1000).toFixed(1).replace(".", ",")}k`
        : String(Math.round(v))
      : metric === "ticket"
        ? `R$ ${Math.round(v)}`
        : fmtBRLShort(v)

  // Caminho da linha, quebrando onde a plataforma não tem dado no mês.
  const pathFor = (s: EvoSerie) => {
    let d = ""
    let caneta = false
    s.pontos.forEach((p, i) => {
      if (!p.hasData) {
        caneta = false
        return
      }
      d += `${caneta ? "L" : "M"}${x(i)},${y(p[metric])} `
      caneta = true
    })
    return d.trim()
  }

  // Total da operação (soma) por mês — pro valor de cima + variação.
  const totBruto = labels.map((_, i) =>
    series.reduce((a, s) => a + (s.pontos[i]?.hasData ? s.pontos[i].bruto : 0), 0),
  )
  const totPed = labels.map((_, i) =>
    series.reduce((a, s) => a + (s.pontos[i]?.hasData ? s.pontos[i].pedidos : 0), 0),
  )
  const totMetric = (i: number) =>
    metric === "ticket"
      ? totPed[i] > 0
        ? totBruto[i] / totPed[i]
        : 0
      : metric === "bruto"
        ? totBruto[i]
        : totPed[i]
  const atual = totMetric(n - 1)
  const anterior = totMetric(n - 2)
  const delta = anterior > 0 ? ((atual - anterior) / anterior) * 100 : null
  const Trend =
    delta == null || Math.abs(delta) < 0.5
      ? Minus
      : delta > 0
        ? TrendingUp
        : TrendingDown
  const trendCls =
    delta == null || Math.abs(delta) < 0.5
      ? "text-muted-foreground"
      : delta > 0
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-rose-600 dark:text-rose-400"

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <TrendingUp className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Evolução da operação</h3>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          últimos {n} meses · por plataforma
        </span>
      </div>

      {/* Abas de métrica */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {METRICS.map((mm) => {
          const on = mm.key === metric
          return (
            <button
              key={mm.key}
              type="button"
              onClick={() => setMetric(mm.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                on
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {mm.label}
            </button>
          )
        })}
      </div>

      {/* Total + variação */}
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums">{m.fmt(atual)}</span>
        <span className={`flex items-center gap-0.5 text-xs font-semibold ${trendCls}`}>
          <Trend className="size-3.5" />
          {delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta.toFixed(0)}%`}
        </span>
        <span className="text-[11px] text-muted-foreground">
          total · vs mês anterior
        </span>
      </div>

      {/* Gráfico multi-linha com eixo Y */}
      <div className="mt-2 flex gap-1.5">
        {/* Eixo Y — a escala (o que a altura das linhas significa) */}
        <div className="relative h-40 w-12 shrink-0 text-[9px] text-muted-foreground tabular-nums">
          {[0, 0.5, 1].map((f) => (
            <span
              key={f}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${padTopPct + f * plotPct}%` }}
            >
              {axisFmt(maxV - f * span)}
            </span>
          ))}
        </div>

        {/* Área do gráfico */}
        <div className="min-w-0 flex-1">
          <div className="relative h-40 w-full">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="absolute inset-0 h-full w-full"
              preserveAspectRatio="none"
              role="img"
              aria-label={`Evolução de ${m.label} por plataforma`}
            >
              {[0.25, 0.5, 0.75].map((f) => (
                <line
                  key={f}
                  x1={padX}
                  x2={W - padX}
                  y1={padY + f * (H - 2 * padY)}
                  y2={padY + f * (H - 2 * padY)}
                  style={{ stroke: "var(--border)" }}
                  strokeWidth="1"
                />
              ))}
              {series.map((s) => (
                <path
                  key={s.id}
                  d={pathFor(s)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>

            {/* Bolinhas HTML (redondas) + tooltip no hover */}
            {series.map((s) =>
              s.pontos.map((p, i) =>
                p.hasData ? (
                  <div
                    key={`${s.id}-${i}`}
                    className="group absolute z-0 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center hover:z-20"
                    style={{
                      left: `${(x(i) / W) * 100}%`,
                      top: `${(y(p[metric]) / H) * 100}%`,
                    }}
                  >
                    <div
                      className="size-2.5 rounded-full border-2"
                      style={{
                        borderColor: s.color,
                        background: i === n - 1 ? s.color : "var(--card)",
                      }}
                    />
                    <div className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md border bg-card px-2 py-1 text-[10px] shadow-md group-hover:block">
                      <div className="flex items-center gap-1">
                        <span
                          className="size-2 rounded-[2px]"
                          style={{ background: s.color }}
                        />
                        <span className="font-semibold">{s.label}</span>
                        <span className="text-muted-foreground">
                          · {labels[i]}
                        </span>
                      </div>
                      <div className="mt-0.5 text-sm font-bold tabular-nums">
                        {m.fmt(p[metric])}
                      </div>
                    </div>
                  </div>
                ) : null,
              ),
            )}
          </div>
          {/* rótulos do eixo X */}
          <div className="mt-1 flex justify-between px-1 text-[10px] text-muted-foreground">
            {labels.map((l, i) => (
              <span
                key={i}
                className={i === n - 1 ? "font-semibold text-foreground" : ""}
              >
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Legenda: plataforma + valor atual (dá sentido a cada linha) */}
      <div className="mt-3 flex flex-col gap-1.5">
        {series.map((s) => {
          const ult = [...s.pontos].reverse().find((p) => p.hasData)
          return (
            <div
              key={s.id}
              className="grid grid-cols-[10px_18px_1fr_auto] items-center gap-2 text-xs"
            >
              <span
                className="size-2.5 rounded-[3px]"
                style={{ background: s.color }}
              />
              <PlatformLogo platform={s.id} className="size-[18px] rounded-[3px]" />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="font-semibold tabular-nums">
                {ult ? m.fmt(ult[metric]) : "—"}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
