"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronDown, ChevronRight } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import type { Unit } from "@/lib/sample-data"
import { fmtBRL, fmtBRLShort, fmtNum, fmtPct } from "@/lib/sample-data"

export function UnitsTable({ units }: { units: Unit[] }) {
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())

  const toggle = (code: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="grid grid-cols-[24px_minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto] items-center gap-4 border-b px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <div></div>
        <div>Unidade</div>
        <div className="text-right">Pedidos</div>
        <div className="text-right">Ticket Médio</div>
        <div className="text-right">Total Bruto</div>
        <div className="text-right">Total Líquido</div>
        <div className="text-right">Detalhe</div>
      </div>

      {units.map((unit, idx) => {
        const isOpen = expanded.has(unit.code)
        const m = unit.monthly
        const hasData = m.pedidos > 0
        return (
          <React.Fragment key={unit.code}>
            <button
              type="button"
              onClick={() => toggle(unit.code)}
              className={`grid w-full grid-cols-[24px_minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto] items-center gap-4 px-5 py-4 text-sm transition-colors hover:bg-muted/50 ${
                idx < units.length - 1 && !isOpen ? "border-b" : ""
              }`}
            >
              {isOpen ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )}
              <div className="flex items-center gap-3 text-left">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <span className="text-[11px] font-bold tabular-nums">
                    {unit.code}
                  </span>
                </div>
                <span className="truncate font-medium">{unit.name}</span>
              </div>
              <div className="text-right tabular-nums">
                {hasData ? fmtNum(m.pedidos) : "—"}
              </div>
              <div className="text-right tabular-nums text-muted-foreground">
                {hasData ? fmtBRL(m.ticketMedio) : "—"}
              </div>
              <div className="text-right tabular-nums font-semibold">
                {hasData ? fmtBRL(m.faturamentoBruto) : "—"}
              </div>
              <div className="text-right tabular-nums font-semibold">
                {hasData ? fmtBRL(m.faturamentoLiquido) : "—"}
              </div>
              <Link
                href={`/unidades/${unit.code}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-primary hover:underline"
              >
                Ver detalhe
                <ChevronRight className="size-3" />
              </Link>
            </button>

            {isOpen && (
              <div
                className={`bg-muted/30 px-5 py-4 ${
                  idx < units.length - 1 ? "border-b" : ""
                }`}
              >
                {hasData ? (
                  <div className="ml-12 grid gap-3 md:grid-cols-3">
                    {m.platforms.map((p) => (
                      <div
                        key={p.id}
                        className="rounded-lg border bg-card p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <PlatformLogo platform={p.id} size="sm" />
                            <span className="text-xs font-semibold">
                              {p.name}
                            </span>
                          </div>
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {fmtPct(p.pctLoja)} loja
                          </span>
                        </div>
                        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${p.pctLoja}%` }}
                          />
                          <div
                            className="h-full bg-slate-400 dark:bg-slate-600"
                            style={{ width: `${100 - p.pctLoja}%` }}
                          />
                        </div>
                        <div className="mt-2 flex items-baseline justify-between text-[10px]">
                          <span className="text-muted-foreground">
                            Bruto {fmtBRLShort(p.bruto)}
                          </span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            Líq. {fmtBRLShort(p.liquido)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="ml-12 text-xs text-muted-foreground">
                    Sem dados de plataforma neste mês.
                  </p>
                )}
              </div>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
