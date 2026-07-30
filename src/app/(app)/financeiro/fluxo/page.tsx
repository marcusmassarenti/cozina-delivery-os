import Link from "next/link"
import { AlertTriangle, TrendingUp, Wallet } from "lucide-react"

import { getFluxoCaixa, type FluxoDia } from "@/lib/data/fluxo-caixa"
import { fmtBRL, fmtBRLShort } from "@/lib/format"

const HORIZONTES = [30, 60, 90]

function fmtDia(iso: string): string {
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}
function fmtDiaLongo(iso: string): string {
  const d = new Date(`${iso}T12:00:00-03:00`)
  return d.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  })
}

/** Gráfico de saldo corrido (SVG server-side, sem dependência). */
function SaldoChart({
  dias,
  rupturaDate,
}: {
  dias: FluxoDia[]
  rupturaDate: string | null
}) {
  const W = 760
  const H = 220
  const padX = 44
  const padTop = 18
  const padBottom = 26
  const innerW = W - padX * 2
  const innerH = H - padTop - padBottom
  const vals = dias.map((d) => d.saldoFim)
  const max = Math.max(0, ...vals)
  const min = Math.min(0, ...vals)
  const span = max - min || 1
  const x = (i: number) => padX + (innerW * i) / Math.max(1, dias.length - 1)
  const y = (v: number) => padTop + innerH - (innerH * (v - min)) / span
  const zeroY = y(0)
  const line = dias.map((d, i) => `${x(i)},${y(d.saldoFim)}`).join(" ")
  // área até a linha do zero
  const area = `${padX},${zeroY} ${line} ${x(dias.length - 1)},${zeroY}`
  const rupturaIdx = rupturaDate ? dias.findIndex((d) => d.date === rupturaDate) : -1

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <clipPath id="above"><rect x="0" y="0" width={W} height={zeroY} /></clipPath>
        <clipPath id="below"><rect x="0" y={zeroY} width={W} height={H - zeroY} /></clipPath>
      </defs>
      {/* área positiva (verde) e negativa (rosa) */}
      <polygon points={area} className="fill-emerald-500/12" clipPath="url(#above)" />
      <polygon points={area} className="fill-rose-500/15" clipPath="url(#below)" />
      {/* linha do zero */}
      <line x1={padX} x2={W - padX} y1={zeroY} y2={zeroY} className="stroke-border" strokeWidth={1.5} strokeDasharray="4 3" />
      <text x={padX - 6} y={zeroY + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">R$ 0</text>
      {/* topo do eixo */}
      <text x={padX - 6} y={padTop + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">{fmtBRLShort(max)}</text>
      {min < 0 && (
        <text x={padX - 6} y={H - padBottom + 4} textAnchor="end" className="fill-rose-500 text-[10px]">{fmtBRLShort(min)}</text>
      )}
      {/* linha do saldo */}
      <polyline points={line} fill="none" className="stroke-primary" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {/* marcador da ruptura */}
      {rupturaIdx >= 0 && (
        <g>
          <line x1={x(rupturaIdx)} x2={x(rupturaIdx)} y1={padTop} y2={H - padBottom} className="stroke-rose-500" strokeWidth={1} strokeDasharray="3 3" />
          <circle cx={x(rupturaIdx)} cy={y(dias[rupturaIdx].saldoFim)} r={4} className="fill-rose-500" />
        </g>
      )}
      {/* rótulos de data (a cada ~1/6) */}
      {dias.map((d, i) => {
        const step = Math.ceil(dias.length / 6)
        if (i % step !== 0 && i !== dias.length - 1) return null
        return (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[9px]">
            {fmtDia(d.date)}
          </text>
        )
      })}
    </svg>
  )
}

export default async function FluxoCaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; h?: string }>
}) {
  const sp = await searchParams
  const horizonte = HORIZONTES.includes(Number(sp.h)) ? Number(sp.h) : 30
  const fluxo = await getFluxoCaixa(horizonte, sp.loja)
  if (!fluxo) return null

  const hrefH = (h: number) => {
    const p = new URLSearchParams()
    if (sp.loja) p.set("loja", sp.loja)
    p.set("h", String(h))
    return `?${p.toString()}`
  }

  const kpis = [
    { label: "Saldo hoje", value: fmtBRL(fluxo.saldoAtual), icon: Wallet },
    { label: `Entradas previstas (${horizonte}d)`, value: fmtBRL(fluxo.totalEntradas), tone: "pos" as const },
    { label: `Saídas previstas (${horizonte}d)`, value: fmtBRL(fluxo.totalSaidas), tone: "neg" as const },
    {
      label: `Saldo projetado (${horizonte}d)`,
      value: fmtBRL(fluxo.saldoProjetadoFim),
      tone: fluxo.saldoProjetadoFim < 0 ? ("neg" as const) : undefined,
      strong: true,
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <TrendingUp className="size-5 text-primary" />
            Fluxo de Caixa
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Saldo projetado juntando contas a pagar/receber e os repasses de
            delivery (iFood + Keeta).
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
          {HORIZONTES.map((h) => (
            <Link
              key={h}
              href={hrefH(h)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                h === horizonte
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {h} dias
            </Link>
          ))}
        </div>
      </div>

      {/* Alerta de ruptura */}
      {fluxo.primeiroDiaNegativo ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong>Alerta de caixa:</strong> no ritmo atual, o saldo fica{" "}
            <strong>negativo em {fmtDiaLongo(fluxo.primeiroDiaNegativo)}</strong>{" "}
            (mínimo projetado de <strong>{fmtBRL(fluxo.saldoMinimo)}</strong>).
            Antecipe um recebível ou renegocie uma conta antes disso.
          </span>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
          <TrendingUp className="mt-0.5 size-4 shrink-0" />
          <span>
            Caixa positivo em todo o horizonte. Menor saldo projetado:{" "}
            <strong>{fmtBRL(fluxo.saldoMinimo)}</strong>.
          </span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-3 shadow-sm">
            <div className="text-[11px] font-medium text-muted-foreground">{k.label}</div>
            <div
              className={`mt-0.5 text-lg font-semibold tabular-nums ${
                k.tone === "pos"
                  ? "text-emerald-600"
                  : k.tone === "neg"
                    ? "text-rose-600"
                    : ""
              } ${k.strong ? "text-xl" : ""}`}
            >
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Gráfico */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-sm font-semibold">Saldo corrido projetado</p>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-primary" /> saldo</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-sm bg-rose-500/60" /> negativo</span>
          </div>
        </div>
        <SaldoChart dias={fluxo.dias} rupturaDate={fluxo.primeiroDiaNegativo} />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Inclui <strong>{fmtBRL(fluxo.totalEntradasDelivery)}</strong> de repasses de delivery previstos
          {fluxo.atrasadoPagar > 0 && (
            <> · <strong className="text-rose-600">{fmtBRL(fluxo.atrasadoPagar)}</strong> em contas vencidas jogadas em hoje</>
          )}
          .
        </p>
      </div>

      {/* Tabela de movimentos */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b px-4 py-2.5">
          <p className="text-sm font-semibold">Dias com movimento</p>
        </div>
        {fluxo.movimentos.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhuma entrada ou saída prevista nos próximos {horizonte} dias.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 font-semibold">Dia</th>
                  <th className="px-4 py-2 text-right font-semibold">Delivery</th>
                  <th className="px-4 py-2 text-right font-semibold">A receber</th>
                  <th className="px-4 py-2 text-right font-semibold">A pagar</th>
                  <th className="px-4 py-2 text-right font-semibold">Saldo no dia</th>
                </tr>
              </thead>
              <tbody>
                {fluxo.movimentos.map((d) => (
                  <tr key={d.date} className="border-b last:border-0">
                    <td className="px-4 py-2 text-xs">{fmtDiaLongo(d.date)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-emerald-600">
                      {d.entradasDelivery > 0 ? `+${fmtBRLShort(d.entradasDelivery)}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-emerald-500">
                      {d.entradasManual > 0 ? `+${fmtBRLShort(d.entradasManual)}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-rose-600">
                      {d.saidas > 0 ? `−${fmtBRLShort(d.saidas)}` : "—"}
                    </td>
                    <td className={`px-4 py-2 text-right font-semibold tabular-nums ${d.saldoFim < 0 ? "text-rose-600" : ""}`}>
                      {fmtBRL(d.saldoFim)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
