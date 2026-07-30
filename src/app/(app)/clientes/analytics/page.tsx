import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, TrendingUp, UserPlus, Wallet, PieChart } from "lucide-react"

import { isSuperadmin } from "@/lib/auth/permissions"
import { getPlatformAnalytics, type PlanoBreak } from "@/lib/data/plataforma"
import { fmtBRL, fmtBRLShort, fmtNum, fmtPct } from "@/lib/format"

const PLAN_COLOR: Record<PlanoBreak["tier"], string> = {
  essencial: "#7C3AED",
  pro: "#2563EB",
  ai: "#059669",
  sem: "#94A3B8",
}

function Card({
  title,
  icon: Icon,
  subtitle,
  children,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="border-b px-5 py-3">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        {subtitle && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

// ── Linha: receita recebida mês a mês ──────────────────────────────
function LineChart({
  labels,
  values,
}: {
  labels: string[]
  values: number[]
}) {
  const W = 640
  const H = 200
  const padX = 40
  const padTop = 16
  const padBottom = 26
  const max = Math.max(1, ...values)
  const innerW = W - padX * 2
  const innerH = H - padTop - padBottom
  const x = (i: number) =>
    padX + (innerW * i) / Math.max(1, values.length - 1)
  const y = (v: number) => padTop + innerH - (innerH * v) / max
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(" ")

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
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
      <polyline
        points={pts}
        fill="none"
        className="stroke-primary"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {values.map((v, i) =>
        v > 0 ? (
          <g key={i}>
            <circle cx={x(i)} cy={y(v)} r={3.5} className="fill-primary" />
            <title>{`${labels[i]}: ${fmtBRL(v)}`}</title>
          </g>
        ) : null,
      )}
      {labels.map((l, i) => (
        <text
          key={i}
          x={x(i)}
          y={H - 8}
          textAnchor="middle"
          className="fill-muted-foreground text-[10px]"
        >
          {l}
        </text>
      ))}
      <text x={padX} y={padTop - 4} textAnchor="start" className="fill-muted-foreground text-[10px]">
        {fmtBRLShort(max)}
      </text>
    </svg>
  )
}

// ── Barras agrupadas: novos vs cancelados ──────────────────────────
function GroupedBars({
  labels,
  novos,
  cancelados,
}: {
  labels: string[]
  novos: number[]
  cancelados: number[]
}) {
  const max = Math.max(1, ...novos, ...cancelados)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-stretch gap-2" style={{ height: 176 }}>
        {labels.map((l, i) => (
          <div key={i} className="flex flex-1 flex-col items-center">
            <div className="flex w-full flex-1 items-end justify-center gap-1">
              <div
                className="w-3.5 rounded-t bg-emerald-500"
                style={{ height: `${Math.max(novos[i] > 0 ? 4 : 0, (novos[i] / max) * 100)}%` }}
                title={`Novos: ${novos[i]}`}
              />
              <div
                className="w-3.5 rounded-t bg-rose-500"
                style={{ height: `${Math.max(cancelados[i] > 0 ? 4 : 0, (cancelados[i] / max) * 100)}%` }}
                title={`Cancelados: ${cancelados[i]}`}
              />
            </div>
            <span className="mt-1.5 text-[10px] text-muted-foreground">{l}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 text-[11px]">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-emerald-500" /> Novos
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-rose-500" /> Cancelados
        </span>
      </div>
    </div>
  )
}

// ── Donut: distribuição por plano ──────────────────────────────────
function Donut({ data }: { data: PlanoBreak[] }) {
  const total = data.reduce((s, d) => s + d.clientes, 0)
  const R = 70
  const r = 44
  const cx = 90
  const cy = 90
  let acc = 0
  const arcs = data.map((d) => {
    const frac = total > 0 ? d.clientes / total : 0
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
    const dPath = `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} L ${xi1} ${yi1} A ${r} ${r} 0 ${large} 0 ${xi0} ${yi0} Z`
    return { d, dPath }
  })
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <svg viewBox="0 0 180 180" className="size-40 shrink-0">
        {total === 0 && <circle cx={cx} cy={cy} r={R} className="fill-muted" />}
        {arcs.map(({ d, dPath }) => (
          <path key={d.tier} d={dPath} fill={PLAN_COLOR[d.tier]}>
            <title>{`${d.label}: ${d.clientes}`}</title>
          </path>
        ))}
      </svg>
      <div className="flex-1 self-stretch">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="pb-1.5 font-semibold">Plano</th>
              <th className="pb-1.5 text-right font-semibold">Clientes</th>
              <th className="pb-1.5 text-right font-semibold">MRR</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.tier} className="border-b last:border-0">
                <td className="py-1.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm" style={{ background: PLAN_COLOR[d.tier] }} />
                    {d.label}
                    <span className="text-muted-foreground">
                      · {fmtPct(total > 0 ? (d.clientes / total) * 100 : 0)}
                    </span>
                  </span>
                </td>
                <td className="py-1.5 text-right tabular-nums">{d.clientes}</td>
                <td className="py-1.5 text-right font-medium tabular-nums">
                  {fmtBRL(d.mrr)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default async function PlatformAnalyticsPage() {
  if (!(await isSuperadmin())) notFound()
  const a = await getPlatformAnalytics(6)
  if (!a) notFound()

  const labels = a.meses.map((m) => m.label)
  const resumo = [
    { label: "MRR atual", value: fmtBRL(a.resumo.mrr), icon: Wallet },
    { label: "Recebido (6 meses)", value: fmtBRL(a.resumo.recebidoTotal), icon: TrendingUp },
    { label: "Clientes ativos", value: fmtNum(a.resumo.clientesAtivos), icon: UserPlus },
    { label: "Ticket médio (ARPA)", value: fmtBRL(a.resumo.arpa), icon: PieChart },
  ]

  return (
    <div className="flex flex-1 flex-col gap-5 bg-muted/30 p-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/clientes"
          className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Clientes da plataforma
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <TrendingUp className="size-6 text-muted-foreground" />
          Analytics da plataforma
        </h1>
        <p className="text-sm text-muted-foreground">
          Tendências dos últimos 6 meses · visão de dono
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {resumo.map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <k.icon className="size-4" />
              {k.label}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Receita recebida"
          icon={TrendingUp}
          subtitle="Pagamentos registrados mês a mês (tendência de faturamento)"
        >
          <LineChart labels={labels} values={a.receitaPorMes} />
        </Card>
        <Card
          title="Novos vs cancelados"
          icon={UserPlus}
          subtitle="Movimento da base de clientes por mês"
        >
          <GroupedBars
            labels={labels}
            novos={a.novosPorMes}
            cancelados={a.canceladosPorMes}
          />
        </Card>
      </div>

      <Card
        title="Distribuição por plano"
        icon={PieChart}
        subtitle="Quantos clientes e quanto de MRR cada plano representa"
      >
        {a.porPlano.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum cliente com plano definido ainda.
          </p>
        ) : (
          <Donut data={a.porPlano} />
        )}
      </Card>
    </div>
  )
}
