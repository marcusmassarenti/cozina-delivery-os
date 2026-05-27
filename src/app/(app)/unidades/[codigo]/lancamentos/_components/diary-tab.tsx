"use client"

import * as React from "react"
import { Plus } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import { DailyEntryDialog, type DailyEntryInitial } from "./daily-entry-dialog"
import type { DailyAggregate } from "@/lib/data/lancamentos"

const PLATFORMS: PlatformId[] = ["ifood", "99food", "keeta"]

function pad2(n: number) {
  return String(n).padStart(2, "0")
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function formatDateBR(iso: string): string {
  const [y, m, d] = iso.split("-")
  const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
  const weekday = [
    "Dom",
    "Seg",
    "Ter",
    "Qua",
    "Qui",
    "Sex",
    "Sáb",
  ][date.getDay()]
  return `${weekday} ${d}/${m}`
}

export function DiaryTab({
  unitId,
  year,
  month,
  aggregates,
  unitActivePlatforms,
}: {
  unitId: string
  year: number
  month: number
  aggregates: DailyAggregate[]
  unitActivePlatforms: PlatformId[]
}) {
  const [open, setOpen] = React.useState(false)
  const [editingInitial, setEditingInitial] =
    React.useState<DailyEntryInitial | null>(null)

  const aggregatesByDate = React.useMemo(() => {
    const map = new Map<string, DailyAggregate>()
    for (const a of aggregates) map.set(a.date, a)
    return map
  }, [aggregates])

  const days = daysInMonth(year, month)
  const today = new Date()
  const todayIso = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`

  const rows = Array.from({ length: days }, (_, i) => {
    const day = i + 1
    const iso = `${year}-${pad2(month)}-${pad2(day)}`
    return {
      iso,
      isToday: iso === todayIso,
      isFuture: iso > todayIso,
      agg: aggregatesByDate.get(iso) ?? null,
    }
  }).reverse() // mais recente primeiro

  const handleRowClick = (iso: string, agg: DailyAggregate | null) => {
    setEditingInitial(
      agg
        ? {
            date: iso,
            ifood: { ...agg.ifood },
            "99food": { ...agg["99food"] },
            keeta: { ...agg.keeta },
          }
        : {
            date: iso,
            ifood: { pedidos: 0, cancelados: 0, faturamento: 0 },
            "99food": { pedidos: 0, cancelados: 0, faturamento: 0 },
            keeta: { pedidos: 0, cancelados: 0, faturamento: 0 },
          },
    )
    setOpen(true)
  }

  const handleNew = () => {
    setEditingInitial(null) // dialog usa today por padrão
    setOpen(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Click numa linha pra editar o lançamento do dia. Linhas verdes têm
          dados preenchidos.
        </p>
        <button
          type="button"
          onClick={handleNew}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus className="size-3.5" />
          Novo dia
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="grid grid-cols-[100px_repeat(3,minmax(0,1fr))_minmax(0,1.1fr)_minmax(0,0.9fr)] items-center gap-3 border-b px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div>Data</div>
          {PLATFORMS.map((p) => (
            <div key={p} className="flex items-center justify-center gap-1.5">
              <PlatformLogo platform={p} size="sm" />
              <span>
                {p === "ifood" ? "iFood" : p === "99food" ? "99" : "Keeta"}
              </span>
            </div>
          ))}
          <div className="text-right">Total</div>
          <div className="text-right">Ticket</div>
        </div>

        {rows.map((row, idx) => {
          const filled = !!row.agg && row.agg.totalPedidos > 0
          const ticket =
            row.agg && row.agg.totalPedidos > 0
              ? row.agg.totalFaturamento / row.agg.totalPedidos
              : 0
          return (
            <button
              key={row.iso}
              type="button"
              onClick={() => handleRowClick(row.iso, row.agg)}
              disabled={row.isFuture}
              className={`grid w-full grid-cols-[100px_repeat(3,minmax(0,1fr))_minmax(0,1.1fr)_minmax(0,0.9fr)] items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                idx < rows.length - 1 ? "border-b" : ""
              } ${
                row.isFuture
                  ? "cursor-not-allowed opacity-30"
                  : "hover:bg-muted/30"
              } ${row.isToday ? "bg-primary/5" : ""}`}
            >
              <div className="flex items-center gap-2 text-left">
                {filled ? (
                  <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
                ) : (
                  <span className="size-2 shrink-0 rounded-full border border-border" />
                )}
                <span
                  className={`text-xs ${
                    row.isToday ? "font-semibold text-primary" : ""
                  }`}
                >
                  {formatDateBR(row.iso)}
                </span>
              </div>
              {PLATFORMS.map((p) => {
                const d = row.agg?.[p]
                const has = d && (d.pedidos > 0 || d.faturamento > 0)
                return (
                  <div
                    key={p}
                    className="flex flex-col items-center text-center text-[11px]"
                  >
                    {has ? (
                      <>
                        <span className="font-semibold">{fmtNum(d!.pedidos)}</span>
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {fmtBRL(d!.faturamento)}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </div>
                )
              })}
              <div className="text-right tabular-nums">
                {row.agg ? (
                  <>
                    <div className="font-bold">{fmtNum(row.agg.totalPedidos)}</div>
                    <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                      {fmtBRL(row.agg.totalFaturamento)}
                    </div>
                  </>
                ) : (
                  <span className="text-muted-foreground/40">—</span>
                )}
              </div>
              <div className="text-right text-xs tabular-nums">
                {row.agg && row.agg.totalPedidos > 0
                  ? fmtBRL(ticket)
                  : "—"}
              </div>
            </button>
          )
        })}
      </div>

      <DailyEntryDialog
        unitId={unitId}
        open={open}
        onOpenChange={setOpen}
        initial={editingInitial}
        unitActivePlatforms={unitActivePlatforms}
      />
    </div>
  )
}
