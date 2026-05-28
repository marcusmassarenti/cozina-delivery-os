"use client"

import * as React from "react"
import { Calendar, CheckCircle2, ChevronDown, Store } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

export type Issue = {
  monthLabel: string
  items: Array<{ label: string; severity: "missing" | "partial" }>
}

export type UnitGap = {
  unitCode: string
  unitName: string
  totalMissing: number // qtd de "missing"
  totalPartial: number // qtd de "partial"
  months: Issue[]
}

export function GapsByUnit({ gaps }: { gaps: UnitGap[] }) {
  if (gaps.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/40 dark:bg-emerald-950/30">
        <CheckCircle2 className="size-5 text-emerald-600" />
        <div>
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-300">
            🎉 Cobertura completa!
          </p>
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            Todas as lojas ativas têm os 3 relatórios em todos os meses do
            período.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          O que falta importar
        </h3>
        <span className="text-[11px] text-muted-foreground">
          {gaps.length} loja{gaps.length !== 1 ? "s" : ""} com lacunas · clica
          pra expandir
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {gaps.map((g) => (
          <UnitGapCard key={g.unitCode} gap={g} />
        ))}
      </div>
    </div>
  )
}

function UnitGapCard({ gap }: { gap: UnitGap }) {
  return (
    <Collapsible className="group/g rounded-lg border bg-card transition-shadow hover:shadow-sm">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left">
        <div className="flex min-w-0 items-center gap-2">
          <Store className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
            #{gap.unitCode}
          </span>
          <span className="truncate text-xs font-semibold">
            {gap.unitName}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {gap.totalMissing > 0 && (
            <span className="inline-flex items-center rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-800 dark:bg-rose-950/40 dark:text-rose-400">
              {gap.totalMissing}
            </span>
          )}
          {gap.totalPartial > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
              {gap.totalPartial}
            </span>
          )}
          <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-data-[panel-open]/g:rotate-180" />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="divide-y border-t">
          {gap.months.map((m) => (
            <li
              key={m.monthLabel}
              className="flex flex-col gap-1 px-3 py-2 text-[11px]"
            >
              <span className="inline-flex items-center gap-1 font-medium text-muted-foreground">
                <Calendar className="size-3" />
                {m.monthLabel}
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {m.items.map((iss, j) => (
                  <span
                    key={j}
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      iss.severity === "missing"
                        ? "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                    }`}
                  >
                    {iss.label}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
