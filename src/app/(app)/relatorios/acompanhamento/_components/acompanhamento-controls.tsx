"use client"

import * as React from "react"
import { useRouter, usePathname } from "next/navigation"

import type { PeriodOption } from "../../_components/comparativo-filters"

export function AcompanhamentoControls({
  periods,
  initial,
}: {
  periods: PeriodOption[]
  initial: { mes: string; de: number; ate: number; diasNoMes: number }
}) {
  const router = useRouter()
  const pathname = usePathname()

  const [mes, setMes] = React.useState(initial.mes)
  const [de, setDe] = React.useState(initial.de)
  const [ate, setAte] = React.useState(initial.ate)

  const dias = Array.from({ length: initial.diasNoMes }, (_, i) => i + 1)

  function aplicar() {
    const params = new URLSearchParams()
    params.set("mes", mes)
    params.set("de", String(Math.min(de, ate)))
    params.set("ate", String(Math.max(de, ate)))
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div
      className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-xl border bg-card p-4"
      data-print="hide"
    >
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Mês
        </span>
        <select
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          className="h-9 rounded-md border bg-card px-2.5 text-xs font-medium"
        >
          {periods.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Venda diária — de
        </span>
        <select
          value={de}
          onChange={(e) => setDe(Number(e.target.value))}
          className="h-9 rounded-md border bg-card px-2.5 text-xs font-medium tabular-nums"
        >
          {dias.map((d) => (
            <option key={d} value={d}>
              dia {d}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          até
        </span>
        <select
          value={ate}
          onChange={(e) => setAte(Number(e.target.value))}
          className="h-9 rounded-md border bg-card px-2.5 text-xs font-medium tabular-nums"
        >
          {dias.map((d) => (
            <option key={d} value={d}>
              dia {d}
            </option>
          ))}
        </select>
      </div>

      <button
        type="button"
        onClick={aplicar}
        className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Aplicar
      </button>
    </div>
  )
}
