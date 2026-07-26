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
  cardapioweb: "#5B2A86",
}
const PLATFORM_LABEL: Record<PlatformId, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
  cardapioweb: "Cardápio Web",
}
const PLATS: PlatformId[] = ["ifood", "99food", "keeta", "cardapioweb"]

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
  // Só as plataformas com dado no conjunto (loja só-iFood não mostra 99/Keeta).
  const platsPresent = PLATS.filter((p) =>
    data.some((d) => d.perPlatform[p] > 0),
  )
  return (
    <ChartCard
      title="Faturamento por loja × plataforma"
      subtitle="Composição de cada loja"
    >
      <div className="mb-3 flex flex-wrap gap-3">
        {platsPresent.map((p) => (
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
              {platsPresent.map((p) => {
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
  // Mais alto que os 220 originais: o card divide a linha com a lista de
  // lojas, e a proporção antiga deixava um vazio grande embaixo.
  const H = 300
  const padX = 44
  const padTop = 28
  const padBottom = 34
  const comDado = data.filter((d) => d.bruto > 0)
  const max = Math.max(1, ...data.map((d) => d.bruto))
  const innerW = W - padX * 2
  const innerH = H - padTop - padBottom
  const x = (i: number) => padX + (innerW * i) / Math.max(1, data.length - 1)
  const y = (v: number) => padTop + innerH - (innerH * v) / max
  const pts = data.map((d, i) => `${x(i)},${y(d.bruto)}`).join(" ")
  const dotIdx = data
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.bruto > 0)

  // Área sob a linha: dá volume ao gráfico e ocupa o espaço que sobrava.
  const areaPts =
    dotIdx.length > 0
      ? `${x(0)},${padTop + innerH} ${pts} ${x(data.length - 1)},${padTop + innerH}`
      : ""

  // Leitura rápida do período — era o que faltava: o gráfico mostrava a
  // forma da curva, mas nenhum número além do topo do eixo.
  const total = comDado.reduce((s, d) => s + d.bruto, 0)
  const media = comDado.length > 0 ? total / comDado.length : 0
  const melhor = comDado.reduce(
    (a, b) => (b.bruto > a.bruto ? b : a),
    comDado[0] ?? { month: 0, bruto: 0 },
  )
  const ultimo = comDado[comDado.length - 1]
  const penultimo = comDado[comDado.length - 2]
  const variacao =
    ultimo && penultimo && penultimo.bruto > 0
      ? ((ultimo.bruto - penultimo.bruto) / penultimo.bruto) * 100
      : null

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
        {/* grid: 3 linhas horizontais, agora com o valor de cada uma */}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1={padX}
              x2={W - padX}
              y1={padTop + innerH * (1 - f)}
              y2={padTop + innerH * (1 - f)}
              className="stroke-border"
              strokeWidth={1}
              strokeDasharray={f === 0 ? "0" : "3 3"}
            />
            {f > 0 && (
              <text
                x={padX - 6}
                y={padTop + innerH * (1 - f) + 3}
                textAnchor="end"
                className="fill-muted-foreground text-[9px]"
              >
                {fmtBRLShort(max * f)}
              </text>
            )}
          </g>
        ))}

        {areaPts && (
          <polygon points={areaPts} className="fill-primary/10" />
        )}

        <polyline
          points={pts}
          fill="none"
          className="stroke-primary"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {dotIdx.map(({ d, i }) => {
          const ehUltimo = i === dotIdx[dotIdx.length - 1].i
          const ehMelhor = d.month === melhor.month && comDado.length > 1
          return (
            <g key={i}>
              <circle
                cx={x(i)}
                cy={y(d.bruto)}
                r={ehUltimo || ehMelhor ? 5 : 3.5}
                className={
                  ehMelhor ? "fill-emerald-500" : "fill-primary"
                }
              />
              {/* Valor só nos pontos que importam (melhor mês e mês atual):
                  rotular todos vira uma parede de números sobrepostos. */}
              {(ehUltimo || ehMelhor) && (
                <text
                  x={x(i)}
                  y={y(d.bruto) - 11}
                  textAnchor={i === data.length - 1 ? "end" : "middle"}
                  className="fill-foreground text-[10px] font-semibold"
                >
                  {fmtBRLShort(d.bruto)}
                </text>
              )}
              <title>{`${MES_ABREV[d.month - 1]}: ${fmtBRL(d.bruto)}`}</title>
            </g>
          )
        })}

        {data.map((d, i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 12}
            textAnchor="middle"
            className={`text-[10px] ${
              d.bruto > 0 ? "fill-muted-foreground" : "fill-muted-foreground/40"
            }`}
          >
            {MES_ABREV[d.month - 1]}
          </text>
        ))}
      </svg>

      {/* Resumo do período: o gráfico mostrava a forma da curva, mas o
          número só aparecia passando o mouse — inútil no PDF e no celular. */}
      {/* 2 colunas fixas: o card divide a linha com outro, e em 4 colunas os
          valores saíam truncados no meio ("R$ 5.709..."). Valor curto pelo
          mesmo motivo — número cortado não informa nada. */}
      {comDado.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t pt-3">
          <ResumoItem rotulo="Total no ano" valor={fmtBRLShort(total)} />
          <ResumoItem rotulo="Média mensal" valor={fmtBRLShort(media)} />
          <ResumoItem
            rotulo="Melhor mês"
            valor={`${MES_ABREV[melhor.month - 1]} · ${fmtBRLShort(melhor.bruto)}`}
          />
          <ResumoItem
            rotulo="Último vs anterior"
            valor={
              variacao === null
                ? "—"
                : `${variacao >= 0 ? "+" : ""}${fmtPct(variacao)}`
            }
            tom={
              variacao === null
                ? undefined
                : variacao >= 0
                  ? "positivo"
                  : "negativo"
            }
          />
        </div>
      )}
    </ChartCard>
  )
}

function ResumoItem({
  rotulo,
  valor,
  tom,
}: {
  rotulo: string
  valor: string
  tom?: "positivo" | "negativo"
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </p>
      <p
        className={`truncate text-sm font-semibold tabular-nums ${
          tom === "positivo"
            ? "text-emerald-600 dark:text-emerald-400"
            : tom === "negativo"
              ? "text-rose-600 dark:text-rose-400"
              : ""
        }`}
      >
        {valor}
      </p>
    </div>
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
      {/* No mobile empilha: o donut (160px) + legenda lado a lado não cabem
          em 375px e empurravam a página. */}
      <div className="flex flex-col items-center gap-5 sm:flex-row">
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
          {PLATS.filter((p) => perPlatform[p] > 0).map((p) => {
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
