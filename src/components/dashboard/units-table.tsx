"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronDown, ChevronRight } from "lucide-react"

import { BrandLogo } from "@/components/brand-logo"
import { PlatformLogo } from "@/components/platform-logo"
import type { Unit } from "@/lib/data/units"
import { fmtBRL, fmtBRLShort, fmtNum, fmtPct } from "@/lib/format"

export function UnitsTable({ units }: { units: Unit[] }) {
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())

  const toggle = (code: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })

  // Ordena por faturamento bruto DESC (maior vende primeiro)
  const sortedUnits = [...units].sort(
    (a, b) => b.monthly.faturamentoBruto - a.monthly.faturamentoBruto,
  )

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="grid grid-cols-[24px_minmax(0,2fr)_repeat(5,minmax(0,1fr))_auto] items-center gap-3 border-b px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <div></div>
        <div>Unidade</div>
        <div className="text-right">Pedidos</div>
        <div className="text-right">Ticket</div>
        <div className="text-right">Bruto</div>
        <div className="text-right">Líquido</div>
        <div className="text-right">% Loja</div>
        <div className="text-right">Detalhe</div>
      </div>

      {sortedUnits.map((unit, idx) => {
        const isOpen = expanded.has(unit.code)
        const m = unit.monthly
        const hasData = m.pedidos > 0
        const taxas = m.faturamentoBruto - m.faturamentoLiquido
        const pctLoja =
          m.faturamentoBruto > 0
            ? (m.faturamentoLiquido / m.faturamentoBruto) * 100
            : 0
        // Tom: verde >= 60%, amarelo 50-60%, vermelho < 50%
        const pctTone =
          pctLoja >= 60
            ? "text-emerald-700 dark:text-emerald-400"
            : pctLoja >= 50
              ? "text-amber-700 dark:text-amber-400"
              : "text-rose-700 dark:text-rose-400"
        return (
          <React.Fragment key={unit.code}>
            <button
              type="button"
              onClick={() => toggle(unit.code)}
              className={`grid w-full grid-cols-[24px_minmax(0,2fr)_repeat(5,minmax(0,1fr))_auto] items-center gap-3 px-5 py-4 text-sm transition-colors hover:bg-muted/50 ${
                idx < sortedUnits.length - 1 && !isOpen ? "border-b" : ""
              }`}
            >
              {isOpen ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )}
              <div className="flex min-w-0 items-center gap-3 text-left">
                <BrandLogo size="md" />
                <span className="inline-flex shrink-0 items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                  #{unit.code}
                </span>
                <span className="truncate font-medium">{unit.name}</span>
              </div>
              <div className="text-right tabular-nums">
                {hasData ? fmtNum(m.pedidos) : "—"}
              </div>
              <div className="text-right tabular-nums text-muted-foreground">
                {hasData ? fmtBRL(m.ticketMedio) : "—"}
              </div>
              <div className="text-right tabular-nums font-semibold whitespace-nowrap">
                {hasData ? fmtBRLShort(m.faturamentoBruto) : "—"}
              </div>
              <div className="text-right tabular-nums font-semibold whitespace-nowrap">
                {hasData ? fmtBRLShort(m.faturamentoLiquido) : "—"}
              </div>
              <div
                className="text-right tabular-nums whitespace-nowrap"
                title={hasData ? `Taxas: ${fmtBRL(taxas)}` : undefined}
              >
                {hasData ? (
                  <div className="flex flex-col items-end leading-tight">
                    <span className={`font-bold ${pctTone}`}>
                      {fmtPct(pctLoja)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      − {fmtBRLShort(taxas)}
                    </span>
                  </div>
                ) : (
                  "—"
                )}
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
                  idx < sortedUnits.length - 1 ? "border-b" : ""
                }`}
              >
                {hasData ? (
                  <div className="ml-12 flex flex-col gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Margem por Plataforma
                    </p>
                    <div className="grid gap-2 md:grid-cols-3">
                      {m.platforms.map((p) => {
                        const taxas = p.bruto - p.liquido
                        const pctTaxas = Math.max(0, 100 - p.pctLoja)
                        const hasPlatformData = p.bruto > 0
                        return (
                          <div
                            key={p.id}
                            className="flex flex-col gap-1.5 rounded-md border bg-card p-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <PlatformLogo platform={p.id} size="sm" />
                                <span className="text-xs font-semibold">
                                  {p.name}
                                </span>
                              </div>
                              <span className="text-[10px] tabular-nums text-muted-foreground">
                                {fmtBRLShort(p.bruto)}
                              </span>
                            </div>

                            {hasPlatformData ? (
                              <>
                                {/* Barra fina dividida — info por baixo */}
                                <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                                  <div
                                    className="bg-emerald-500"
                                    style={{ width: `${p.pctLoja}%` }}
                                    title={`Loja: ${fmtPct(p.pctLoja)} · ${fmtBRLShort(p.liquido)}`}
                                  />
                                  <div
                                    className="bg-slate-500 dark:bg-slate-600"
                                    style={{ width: `${pctTaxas}%` }}
                                    title={`${p.name}: ${fmtPct(pctTaxas)} · ${fmtBRLShort(taxas)}`}
                                  />
                                </div>
                                <div className="flex items-baseline justify-between text-[10px] tabular-nums leading-tight">
                                  <span className="text-emerald-700 dark:text-emerald-400">
                                    <span className="font-bold">
                                      {fmtPct(p.pctLoja)}
                                    </span>{" "}
                                    <span className="text-muted-foreground">
                                      {fmtBRLShort(p.liquido)}
                                    </span>
                                  </span>
                                  <span className="text-slate-700 dark:text-slate-400">
                                    <span className="font-bold">
                                      {fmtPct(pctTaxas)}
                                    </span>{" "}
                                    <span className="text-muted-foreground">
                                      {fmtBRLShort(taxas)}
                                    </span>
                                  </span>
                                </div>
                              </>
                            ) : (
                              <p className="text-[10px] text-muted-foreground">
                                Sem movimento
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
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
