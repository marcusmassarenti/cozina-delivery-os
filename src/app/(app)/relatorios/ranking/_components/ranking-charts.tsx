/**
 * Gráficos do Ranking — SVG/divs leves, sem dependência externa.
 * Server components (estáticos). Cores das plataformas fixas pra reconhecimento.
 */
import type { PlatformId } from "@/components/platform-logo"
import { fmtBRL, fmtBRLShort, fmtPct } from "@/lib/format"

export const PLATFORM_COLOR: Record<PlatformId, string> = {
  ifood: "#EA1D2C",
  "99food": "#FF7A00",
  keeta: "#7C3AED",
}
const PLATFORM_LABEL: Record<PlatformId, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
}
const PLATS: PlatformId[] = ["ifood", "99food", "keeta"]

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3">
        <p className="text-sm font-semibold">{title}</p>
        {subtitle && (
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  )
}

// ─── 1. Barra: faturamento por loja ─────────────────────────────────
export function BarFaturamentoPorLoja({
  data,
}: {
  data: { code: string; name: string; value: number }[]
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <ChartCard title="Faturamento por loja" subtitle="No período selecionado">
      <div className="flex flex-col gap-2">
        {data.map((d) => (
          <div key={d.code} className="flex items-center gap-2">
            <div className="w-28 shrink-0 truncate text-[11px] text-muted-foreground">
              {d.name}
            </div>
            <div className="relative h-5 flex-1 overflow-hidden rounded-sm bg-muted/50">
              <div
                className="h-full rounded-sm bg-primary"
                style={{ width: `${(d.value / max) * 100}%` }}
              />
            </div>
            <div className="w-24 shrink-0 text-right text-[11px] font-medium tabular-nums">
              {fmtBRLShort(d.value)}
            </div>
          </div>
        ))}
      </div>
    </ChartCard>
  )
}

// ─── 2. Barra empilhada por plataforma ──────────────────────────────
export function BarEmpilhadaPlataforma({
  data,
}: {
  data: {
    code: string
    name: string
    perPlatform: Record<PlatformId, number>
    total: number
  }[]
}) {
  const max = Math.max(1, ...data.map((d) => d.total))
  return (
    <ChartCard
      title="Faturamento por loja × plataforma"
      subtitle="Composição de cada loja"
    >
      <div className="mb-3 flex flex-wrap gap-3">
        {PLATS.map((p) => (
          <span key={p} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="size-2.5 rounded-sm"
              style={{ background: PLATFORM_COLOR[p] }}
            />
            {PLATFORM_LABEL[p]}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {data.map((d) => (
          <div key={d.code} className="flex items-center gap-2">
            <div className="w-28 shrink-0 truncate text-[11px] text-muted-foreground">
              {d.name}
            </div>
            <div className="flex h-5 flex-1 overflow-hidden rounded-sm bg-muted/30">
              {PLATS.map((p) => {
                const v = d.perPlatform[p]
                if (v <= 0) return null
                return (
                  <div
                    key={p}
                    className="h-full"
                    style={{
                      width: `${(v / max) * 100}%`,
                      background: PLATFORM_COLOR[p],
                    }}
                    title={`${PLATFORM_LABEL[p]}: ${fmtBRL(v)}`}
                  />
                )
              })}
            </div>
            <div className="w-24 shrink-0 text-right text-[11px] font-medium tabular-nums">
              {fmtBRLShort(d.total)}
            </div>
          </div>
        ))}
      </div>
    </ChartCard>
  )
}

// ─── 3. Linha: evolução da rede mês a mês ───────────────────────────
const MES_ABREV = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
]

export function LinhaEvolucaoRede({
  data,
  year,
}: {
  data: { month: number; bruto: number }[]
  year: number
}) {
  const W = 720
  const H = 220
  const padX = 36
  const padTop = 16
  const padBottom = 28
  const max = Math.max(1, ...data.map((d) => d.bruto))
  const innerW = W - padX * 2
  const innerH = H - padTop - padBottom
  const x = (i: number) => padX + (innerW * i) / Math.max(1, data.length - 1)
  const y = (v: number) => padTop + innerH - (innerH * v) / max
  const pts = data.map((d, i) => `${x(i)},${y(d.bruto)}`).join(" ")
  // pontos com dado (>0) pra marcar bolinhas
  const dotIdx = data
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.bruto > 0)

  return (
    <ChartCard
      title="Evolução da rede"
      subtitle={`Faturamento mês a mês · ${year}`}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* grid: 3 linhas horizontais */}
        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={padX}
            x2={W - padX}
            y1={padTop + innerH * (1 - f)}
            y2={padTop + innerH * (1 - f)}
            className="stroke-border"
            strokeWidth={1}
            strokeDasharray={f === 0 ? "0" : "3 3"}
          />
        ))}
        {/* linha */}
        <polyline
          points={pts}
          fill="none"
          className="stroke-primary"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* bolinhas */}
        {dotIdx.map(({ d, i }) => (
          <g key={i}>
            <circle
              cx={x(i)}
              cy={y(d.bruto)}
              r={3.5}
              className="fill-primary"
            />
            <title>{`${MES_ABREV[d.month - 1]}: ${fmtBRL(d.bruto)}`}</title>
          </g>
        ))}
        {/* rótulos dos meses */}
        {data.map((d, i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 8}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {MES_ABREV[d.month - 1]}
          </text>
        ))}
        {/* topo do eixo Y (valor máximo) */}
        <text
          x={padX}
          y={padTop - 4}
          textAnchor="start"
          className="fill-muted-foreground text-[10px]"
        >
          {fmtBRLShort(max)}
        </text>
      </svg>
    </ChartCard>
  )
}

// ─── 4. Pizza (donut): participação por plataforma ──────────────────
export function PizzaPlataforma({
  perPlatform,
}: {
  perPlatform: Record<PlatformId, number>
}) {
  const total = PLATS.reduce((s, p) => s + perPlatform[p], 0)
  const R = 70
  const r = 42
  const cx = 90
  const cy = 90
  let acc = 0
  const arcs = PLATS.filter((p) => perPlatform[p] > 0).map((p) => {
    const frac = total > 0 ? perPlatform[p] / total : 0
    const a0 = acc * 2 * Math.PI - Math.PI / 2
    acc += frac
    const a1 = acc * 2 * Math.PI - Math.PI / 2
    const large = frac > 0.5 ? 1 : 0
    const x0 = cx + R * Math.cos(a0)
    const y0 = cy + R * Math.sin(a0)
    const x1 = cx + R * Math.cos(a1)
    const y1 = cy + R * Math.sin(a1)
    const xi1 = cx + r * Math.cos(a1)
    const yi1 = cy + r * Math.sin(a1)
    const xi0 = cx + r * Math.cos(a0)
    const yi0 = cy + r * Math.sin(a0)
    const d = `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} L ${xi1} ${yi1} A ${r} ${r} 0 ${large} 0 ${xi0} ${yi0} Z`
    return { p, d, frac }
  })
  return (
    <ChartCard
      title="Participação por plataforma"
      subtitle="Quanto cada uma representa do total"
    >
      <div className="flex items-center gap-5">
        <svg viewBox="0 0 180 180" className="size-40 shrink-0">
          {arcs.map(({ p, d }) => (
            <path key={p} d={d} fill={PLATFORM_COLOR[p]}>
              <title>{`${PLATFORM_LABEL[p]}: ${fmtBRL(perPlatform[p])}`}</title>
            </path>
          ))}
          {total === 0 && (
            <circle cx={cx} cy={cy} r={R} className="fill-muted" />
          )}
        </svg>
        <div className="flex flex-col gap-2">
          {PLATS.map((p) => {
            const frac = total > 0 ? perPlatform[p] / total : 0
            return (
              <div key={p} className="flex items-center gap-2 text-xs">
                <span
                  className="size-2.5 rounded-sm"
                  style={{ background: PLATFORM_COLOR[p] }}
                />
                <span className="w-16 text-muted-foreground">
                  {PLATFORM_LABEL[p]}
                </span>
                <span className="font-medium tabular-nums">
                  {fmtPct(frac * 100)}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {fmtBRLShort(perPlatform[p])}
                </span>
              </div>
            )
          })}
          <div className="mt-1 border-t pt-1.5 text-xs">
            <span className="text-muted-foreground">Total · </span>
            <span className="font-semibold tabular-nums">{fmtBRL(total)}</span>
          </div>
        </div>
      </div>
    </ChartCard>
  )
}
