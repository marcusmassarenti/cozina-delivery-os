"use client"

import * as React from "react"
import { ChevronRight } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import type {
  DailyReportMatrix,
  UnitDailyRow,
} from "@/lib/data/relatorio-diario"
import type { DailyMetric } from "@/lib/data/relatorio-diario-types"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"

type Week = { index: number; label: string; range: string; days: number[] }

const pad = (n: number) => String(n).padStart(2, "0")

/** Agrupa os dias do mês em semanas calendário (começando na segunda). */
function buildWeeks(year: number, month: number, days: number[]): Week[] {
  const buckets: number[][] = []
  let current: number[] = []
  for (const d of days) {
    const weekday = new Date(year, month - 1, d).getDay() // 0=Dom..6=Sáb
    if (weekday === 1 && current.length > 0) {
      buckets.push(current)
      current = []
    }
    current.push(d)
  }
  if (current.length > 0) buckets.push(current)
  return buckets.map((ds, i) => ({
    index: i,
    label: `Sem ${i + 1}`,
    range: `${pad(ds[0])}–${pad(ds[ds.length - 1])}`,
    days: ds,
  }))
}

/**
 * Matriz semanal: lojas nas linhas (com nome), semanas nas colunas.
 * Clicar numa semana expande os 7 dias dela. Cabe na largura sem coluna
 * fixa (4-6 semanas), então escala pra muitas lojas sem bug de sidebar.
 */
export function WeeklyMatrix({
  matrix,
  metric,
  year,
  month,
  platforms,
}: {
  matrix: DailyReportMatrix
  metric: DailyMetric
  year: number
  month: number
  platforms: PlatformId[]
}) {
  const weeks = React.useMemo(
    () => buildWeeks(year, month, matrix.days),
    [year, month, matrix.days],
  )
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set())

  const toggle = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  const sumDays = (rec: Record<number, number>, days: number[]) =>
    days.reduce((s, d) => s + (rec[d] ?? 0), 0)

  // Valor agregado de uma semana (ou dia) conforme a métrica
  const aggValue = (
    row: { faturamento: Record<number, number>; pedidos: Record<number, number>; cancelamentos: Record<number, number> },
    days: number[],
  ): { display: string; cancelRate: number | null; pedidos: number } => {
    if (metric === "faturamento") {
      const v = sumDays(row.faturamento, days)
      return { display: v > 0 ? fmtNum(Math.round(v)) : "·", cancelRate: null, pedidos: 0 }
    }
    if (metric === "pedidos") {
      const v = sumDays(row.pedidos, days)
      return { display: v > 0 ? fmtNum(v) : "·", cancelRate: null, pedidos: v }
    }
    const c = sumDays(row.cancelamentos, days)
    const p = sumDays(row.pedidos, days)
    if (c === 0) return { display: "·", cancelRate: 0, pedidos: p }
    const rate = p > 0 ? (c / p) * 100 : 100
    return { display: p > 0 ? fmtPct(rate) : fmtNum(c), cancelRate: rate, pedidos: p }
  }

  const cellTone = (cancelRate: number | null): string => {
    if (metric !== "cancelamentos" || cancelRate === null || cancelRate === 0)
      return ""
    if (cancelRate >= 10)
      return "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
    if (cancelRate >= 5)
      return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
    return ""
  }

  const rowTotal = (row: UnitDailyRow): string => {
    if (metric === "faturamento") return fmtBRL(row.totalFaturamento)
    if (metric === "pedidos") return fmtNum(row.totalPedidos)
    return row.totalPedidos > 0
      ? fmtPct((row.totalCancelamentos / row.totalPedidos) * 100)
      : fmtNum(row.totalCancelamentos)
  }
  const grandTotal = (): string => {
    if (metric === "faturamento") return fmtBRL(matrix.totalFaturamento)
    if (metric === "pedidos") return fmtNum(matrix.totalPedidos)
    return matrix.totalPedidos > 0
      ? fmtPct((matrix.totalCancelamentos / matrix.totalPedidos) * 100)
      : fmtNum(matrix.totalCancelamentos)
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-5 py-3.5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Detalhamento por loja</h3>
          <div className="flex items-center gap-0.5">
            {platforms.map((p) => (
              <PlatformLogo key={p} platform={p} size="sm" />
            ))}
          </div>
        </div>
        <span className="text-[11px] text-muted-foreground">
          clique numa semana pra abrir os dias
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            {/* Linha de semanas */}
            <tr className="border-b bg-muted/40">
              <th
                rowSpan={2}
                className="min-w-[150px] px-3 py-2 text-left align-bottom font-semibold uppercase tracking-wider text-[10px] text-muted-foreground"
              >
                Loja
              </th>
              {weeks.map((w) => {
                const isOpen = expanded.has(w.index)
                return isOpen ? (
                  <th
                    key={w.index}
                    colSpan={w.days.length}
                    onClick={() => toggle(w.index)}
                    className="cursor-pointer select-none border-l px-2 py-2 text-center font-semibold text-[10px] text-foreground hover:bg-muted"
                    title="Recolher semana"
                  >
                    <span className="inline-flex items-center gap-1">
                      <ChevronRight className="size-3 rotate-90" />
                      {w.label} ({w.range})
                    </span>
                  </th>
                ) : (
                  <th
                    key={w.index}
                    rowSpan={2}
                    onClick={() => toggle(w.index)}
                    className="cursor-pointer select-none border-l px-2 py-2 text-right align-bottom font-semibold text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Abrir dias da semana"
                  >
                    <span className="inline-flex items-center gap-0.5">
                      <ChevronRight className="size-3" />
                      {w.label}
                      <span className="ml-0.5 hidden font-normal opacity-60 sm:inline">
                        {w.range}
                      </span>
                    </span>
                  </th>
                )
              })}
              <th
                rowSpan={2}
                className="min-w-[80px] border-l px-3 py-2 text-right align-bottom font-semibold uppercase tracking-wider text-[10px] text-muted-foreground"
              >
                Total
              </th>
            </tr>
            {/* Linha de dias (só pras semanas abertas) */}
            <tr className="border-b bg-muted/20">
              {weeks
                .filter((w) => expanded.has(w.index))
                .flatMap((w) =>
                  w.days.map((d, di) => (
                    <th
                      key={`${w.index}-${d}`}
                      className={`px-2 py-1.5 text-right font-medium tabular-nums text-[10px] text-muted-foreground ${
                        di === 0 ? "border-l" : ""
                      }`}
                    >
                      {pad(d)}
                    </th>
                  )),
                )}
            </tr>
          </thead>

          <tbody>
            {matrix.units.map((u) => (
              <tr key={u.unitId} className="border-b">
                <td className="px-3 py-2 text-left">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex shrink-0 items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                      #{u.code}
                    </span>
                    <span className="truncate font-medium">{u.name}</span>
                  </div>
                </td>
                {weeks.map((w) => {
                  if (expanded.has(w.index)) {
                    return w.days.map((d, di) => {
                      const cell = aggValue(u, [d])
                      return (
                        <td
                          key={`${w.index}-${d}`}
                          className={`px-2 py-2 text-right tabular-nums ${
                            di === 0 ? "border-l" : ""
                          } ${cellTone(cell.cancelRate)}`}
                        >
                          {cell.display}
                        </td>
                      )
                    })
                  }
                  const cell = aggValue(u, w.days)
                  return (
                    <td
                      key={w.index}
                      className={`border-l px-2 py-2 text-right font-medium tabular-nums ${cellTone(
                        cell.cancelRate,
                      )}`}
                    >
                      {cell.display}
                    </td>
                  )
                })}
                <td className="border-l px-3 py-2 text-right font-semibold tabular-nums">
                  {rowTotal(u)}
                </td>
              </tr>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t-2 bg-muted/40 font-semibold">
              <td className="px-3 py-2.5 text-left uppercase tracking-wider text-[10px]">
                Rede
              </td>
              {weeks.map((w) => {
                const netRow = {
                  faturamento: matrix.networkByDay.faturamento,
                  pedidos: matrix.networkByDay.pedidos,
                  cancelamentos: matrix.networkByDay.cancelamentos,
                }
                if (expanded.has(w.index)) {
                  return w.days.map((d, di) => {
                    const cell = aggValue(netRow, [d])
                    return (
                      <td
                        key={`${w.index}-${d}`}
                        className={`px-2 py-2.5 text-right tabular-nums ${
                          di === 0 ? "border-l" : ""
                        }`}
                      >
                        {cell.display}
                      </td>
                    )
                  })
                }
                const cell = aggValue(netRow, w.days)
                return (
                  <td
                    key={w.index}
                    className="border-l px-2 py-2.5 text-right tabular-nums"
                  >
                    {cell.display}
                  </td>
                )
              })}
              <td className="border-l px-3 py-2.5 text-right tabular-nums">
                {grandTotal()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="border-t px-4 py-2 text-[10px] text-muted-foreground">
        {metric === "faturamento"
          ? "Faturamento bruto somado por semana (R$). Clique pra ver os dias."
          : metric === "pedidos"
            ? "Pedidos somados por semana. Clique pra ver os dias."
            : "Taxa de cancelamento por semana · célula colorida = taxa alta."}
      </p>
    </div>
  )
}
