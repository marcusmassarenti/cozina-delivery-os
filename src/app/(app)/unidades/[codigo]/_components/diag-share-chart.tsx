"use client"

import * as React from "react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { fmtBRL, fmtBRLShort, fmtNum, fmtPct } from "@/lib/format"

export type SharePlat = {
  id: PlatformId
  label: string
  bruto: number
  pedidos: number
  ticket: number
  sharePct: number
}

// iFood vermelho · Keeta verde · 99 Food amarelo (identidade reforçada pelo logo).
const COR: Record<string, string> = {
  ifood: "#EF4444",
  keeta: "#16A34A",
  "99food": "#EAB308",
}

const R = 46
const C = 2 * Math.PI * R
const clamp = (n: number) => Math.max(0, Math.min(100, n))

/**
 * Pizza (rosca) interativa do peso de cada plataforma. Clicar numa plataforma
 * (chip ou fatia) destaca a fatia, esmaece as outras e atualiza o centro + os
 * KPIs pra aquela plataforma. "Todas" volta pro consolidado.
 */
export function DiagShareChart({
  plats,
  total,
}: {
  plats: SharePlat[]
  total: { bruto: number; pedidos: number; ticket: number }
}) {
  const [sel, setSel] = React.useState<string>("todas")

  const segs = plats.map((p, i) => {
    const anteriores = plats
      .slice(0, i)
      .reduce((a, x) => a + clamp(x.sharePct), 0)
    const len = (clamp(p.sharePct) / 100) * C
    return { ...p, dash: `${len} ${C - len}`, offset: -((anteriores / 100) * C) }
  })

  const cur = sel === "todas" ? null : plats.find((p) => p.id === sel)
  const kpiFat = cur ? cur.bruto : total.bruto
  const kpiPed = cur ? cur.pedidos : total.pedidos
  const kpiTic = cur ? cur.ticket : total.ticket
  const centroTop = cur ? fmtPct(cur.sharePct) : fmtBRLShort(total.bruto)
  const centroBot = cur ? cur.label : `${plats.length} plataformas`

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      {/* Rosca */}
      <svg
        viewBox="0 0 120 120"
        className="size-36 shrink-0"
        role="img"
        aria-label="Peso de cada plataforma no faturamento"
      >
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          strokeWidth="18"
          style={{ stroke: "var(--border)" }}
        />
        {segs.map((s) => {
          const on = sel === "todas" || sel === s.id
          return (
            <circle
              key={s.id}
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke={COR[s.id] ?? "#94a3b8"}
              strokeWidth={sel === s.id ? 22 : 18}
              strokeDasharray={s.dash}
              strokeDashoffset={s.offset}
              transform="rotate(-90 60 60)"
              className="cursor-pointer transition-[opacity,stroke-width] duration-300"
              style={{ opacity: on ? 1 : 0.22 }}
              onClick={() => setSel(sel === s.id ? "todas" : s.id)}
            />
          )
        })}
        <text
          x="60"
          y="57"
          textAnchor="middle"
          className="text-[14px] font-bold"
          style={{ fill: "var(--foreground)" }}
        >
          {centroTop}
        </text>
        <text
          x="60"
          y="72"
          textAnchor="middle"
          className="text-[8.5px]"
          style={{ fill: "var(--muted-foreground)" }}
        >
          {centroBot}
        </text>
      </svg>

      <div className="flex w-full flex-1 flex-col gap-3">
        {/* Chips seletores */}
        <div className="flex flex-wrap gap-2">
          <Chip
            ativo={sel === "todas"}
            onClick={() => setSel("todas")}
            dot="conic-gradient(#EF4444 0 33%,#16A34A 33% 66%,#EAB308 66% 100%)"
          >
            Todas
          </Chip>
          {plats.map((p) => (
            <Chip
              key={p.id}
              ativo={sel === p.id}
              onClick={() => setSel(sel === p.id ? "todas" : p.id)}
              logo={p.id}
            >
              {p.label}
            </Chip>
          ))}
        </div>

        {/* KPIs reativos */}
        <div className="grid grid-cols-3 gap-2">
          <MiniKpi label="Faturamento" value={fmtBRL(kpiFat)} />
          <MiniKpi label="Pedidos" value={fmtNum(kpiPed)} />
          <MiniKpi label="Ticket médio" value={fmtBRL(kpiTic)} />
        </div>
      </div>
    </div>
  )
}

function Chip({
  ativo,
  onClick,
  children,
  logo,
  dot,
}: {
  ativo: boolean
  onClick: () => void
  children: React.ReactNode
  logo?: PlatformId
  dot?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
        ativo
          ? "border-foreground bg-muted font-semibold"
          : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {logo ? (
        <PlatformLogo platform={logo} className="size-3.5 rounded-[3px]" />
      ) : (
        <span
          className="size-2.5 rounded-[3px]"
          style={{ background: dot }}
        />
      )}
      {children}
    </button>
  )
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-base font-bold tabular-nums">{value}</div>
    </div>
  )
}
