"use client"

import * as React from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Calendar, CalendarRange, ChevronLeft, ChevronRight } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  firstDayOfMonth,
  formatPeriodKey,
  formatPeriodLabel,
  formatRangeLabel,
  lastDayOfMonth,
  MAX_RANGE_DAYS,
  rangeDays,
  rangeFromPeriod,
  rangeIsFullMonth,
  type DateRange,
  type Period,
} from "@/lib/period"

export type AvailablePeriodOption = {
  year: number
  month: number
  hasFinanceiro?: boolean
  hasCardapio?: boolean
  hasAvaliacoes?: boolean
}

/**
 * Seletor de período com 2 modos:
 *  [◀]  [ 📅 Maio/2026 ▾ ]  [▶]  [📆 Período]      → mês completo
 *  [◀]  [ 📆 01–15 jun/2026 ▾ ]  [▶]  [📆 Período]  → range custom
 *
 * URL convention:
 *  - mês completo  → ?periodo=YYYY-MM
 *  - range custom  → ?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
 * Trocar de modo limpa o outro.
 *
 * `current` aceita Period {year,month} (compat) ou DateRange {start,end} —
 * Period vira o range do mês inteiro.
 *
 * `enableRange` mostra o botão "Período" pra escolher range custom. Default
 * = false (mês fechado, comportamento legado). Telas que ainda não tratam
 * range filtrado pelos dias mantêm enableRange=false.
 */
export function PeriodSelector({
  current,
  options,
  className,
  enableRange = false,
}: {
  current: Period | DateRange
  options: AvailablePeriodOption[]
  className?: string
  enableRange?: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const range: DateRange = isPeriod(current) ? rangeFromPeriod(current) : current
  const isFullMonth = rangeIsFullMonth(range)
  const currentMonth: Period | null = isFullMonth
    ? { year: Number(range.start.slice(0, 4)), month: Number(range.start.slice(5, 7)) }
    : null
  const currentKey = currentMonth ? formatPeriodKey(currentMonth) : "__custom__"

  function setMonth(key: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("periodo", key)
    params.delete("inicio")
    params.delete("fim")
    router.push(`${pathname}?${params.toString()}`)
  }

  function setRange(start: string, end: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("inicio", start)
    params.set("fim", end)
    params.delete("periodo")
    router.push(`${pathname}?${params.toString()}`)
  }

  // Setas: só fazem sentido em modo mês
  const idx = currentMonth
    ? options.findIndex(
        (o) => o.year === currentMonth.year && o.month === currentMonth.month,
      )
    : -1
  const hasNewer = idx > 0
  const hasOlder = idx >= 0 && idx < options.length - 1
  const arrowsDisabled = !currentMonth

  function goPrev() {
    if (!hasOlder) return
    setMonth(formatPeriodKey(options[idx + 1]))
  }
  function goNext() {
    if (!hasNewer) return
    setMonth(formatPeriodKey(options[idx - 1]))
  }

  const label = formatRangeLabel(range)
  const Icon = isFullMonth ? Calendar : CalendarRange

  return (
    <div className={`inline-flex items-center gap-1 ${className ?? ""}`}>
      <button
        type="button"
        onClick={goPrev}
        disabled={arrowsDisabled || !hasOlder}
        aria-label="Mês anterior"
        className="flex h-9 w-8 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronLeft className="size-3.5" />
      </button>

      <Select
        value={currentKey}
        onValueChange={(v) => {
          if (!v || v === "__custom__") return
          setMonth(v)
        }}
      >
        <SelectTrigger className="h-9 min-w-[180px] gap-2 bg-card text-xs font-semibold">
          <Icon className="size-3.5" />
          <SelectValue>{label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => {
            const key = formatPeriodKey(opt)
            const optLabel = formatPeriodLabel(opt)
            const badges: string[] = []
            if (opt.hasFinanceiro) badges.push("F")
            if (opt.hasCardapio) badges.push("C")
            if (opt.hasAvaliacoes) badges.push("A")
            return (
              <SelectItem key={key} value={key}>
                <div className="flex items-center gap-2">
                  <span>{optLabel}</span>
                  {badges.length > 0 && (
                    <span className="text-[9px] font-mono text-muted-foreground">
                      {badges.join("·")}
                    </span>
                  )}
                </div>
              </SelectItem>
            )
          })}
          {!isFullMonth && (
            <SelectItem value="__custom__" disabled>
              <span className="text-muted-foreground">{label} (custom)</span>
            </SelectItem>
          )}
        </SelectContent>
      </Select>

      <button
        type="button"
        onClick={goNext}
        disabled={arrowsDisabled || !hasNewer}
        aria-label="Próximo mês"
        className="flex h-9 w-8 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronRight className="size-3.5" />
      </button>

      {enableRange && (
        <CustomRangeMenu
          range={range}
          onApply={setRange}
          onClearToMonth={(p) => setMonth(formatPeriodKey(p))}
        />
      )}
    </div>
  )
}

function isPeriod(v: Period | DateRange): v is Period {
  return (v as Period).month !== undefined
}

/**
 * Botão "Período" + menu inline (sem lib de popover — só estado + overlay
 * absolutamente posicionado). Click-outside fecha. Esc fecha.
 */
function CustomRangeMenu({
  range,
  onApply,
  onClearToMonth,
}: {
  range: DateRange
  onApply: (start: string, end: string) => void
  onClearToMonth: (p: Period) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [start, setStart] = React.useState(range.start)
  const [end, setEnd] = React.useState(range.end)
  const rootRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    setStart(range.start)
    setEnd(range.end)
  }, [range.start, range.end])

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const days = rangeDays({ start, end })
  const invalid = days < 1
  const tooBig = days > MAX_RANGE_DAYS

  function applyShortcut(daysBack: number) {
    const today = new Date()
    const endIso = isoLocal(today)
    const startD = new Date(today.getTime() - (daysBack - 1) * 86_400_000)
    setStart(isoLocal(startD))
    setEnd(endIso)
  }

  return (
    <div ref={rootRef} className="relative ml-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Período personalizado"
        aria-expanded={open}
        className="flex h-9 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <CalendarRange className="size-3.5" />
        Período
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-50 w-72 rounded-md border bg-popover p-3 shadow-md">
          <div className="mb-2 text-xs font-semibold">Período personalizado</div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
              De
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="rounded-md border bg-background px-2 py-1.5 text-xs"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
              Até
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="rounded-md border bg-background px-2 py-1.5 text-xs"
              />
            </label>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            {invalid
              ? "Selecione um intervalo válido."
              : tooBig
                ? `Máximo ${MAX_RANGE_DAYS} dias. Selecionou ${days}.`
                : `${days} dia${days === 1 ? "" : "s"} selecionado${days === 1 ? "" : "s"}.`}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
            <ShortcutBtn label="Últimos 7d" onClick={() => applyShortcut(7)} />
            <ShortcutBtn label="Últimos 15d" onClick={() => applyShortcut(15)} />
            <ShortcutBtn label="Últimos 30d" onClick={() => applyShortcut(30)} />
            <ShortcutBtn
              label="Este mês"
              onClick={() => {
                const today = new Date()
                const p = {
                  year: today.getFullYear(),
                  month: today.getMonth() + 1,
                }
                setStart(firstDayOfMonth(p))
                setEnd(lastDayOfMonth(p))
              }}
            />
          </div>
          <div className="mt-3 flex justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                const today = new Date()
                onClearToMonth({
                  year: today.getFullYear(),
                  month: today.getMonth() + 1,
                })
              }}
              className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            >
              Voltar pra mês inteiro
            </button>
            <button
              type="button"
              disabled={invalid || tooBig}
              onClick={() => {
                setOpen(false)
                onApply(start, end)
              }}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ShortcutBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border bg-card px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {label}
    </button>
  )
}

/** Date → YYYY-MM-DD local (sem fuso). */
function isoLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}
