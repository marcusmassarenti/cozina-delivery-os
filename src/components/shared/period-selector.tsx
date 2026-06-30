"use client"

import * as React from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"

import {
  firstDayOfMonth,
  formatRangeLabel,
  lastDayOfMonth,
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
 * Seletor de período (range). Default = mês corrente. Clicar abre um
 * popover grande com 2 colunas:
 *  - Esquerda: atalhos (Hoje, Últimos 7d, Últimos 30d, Este mês, Mês
 *    passado, Últimos 3 meses, Este ano, Limpar).
 *  - Direita: 2 meses do calendário lado a lado, com seleção de range.
 *
 * URL convention:
 *  - mês inteiro → ?periodo=YYYY-MM
 *  - range custom → ?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
 * Trocar limpa o outro param.
 *
 * `current` aceita Period {year,month} ou DateRange {start,end} (compat).
 * `options` (legado) e `enableRange` são ignorados — manteve só por compat.
 */
export function PeriodSelector({
  current,
  options: _options,
  className,
  enableRange: _enableRange,
  enableYear,
  years,
}: {
  current: Period | DateRange
  options?: AvailablePeriodOption[]
  className?: string
  enableRange?: boolean
  /** Mostra atalhos de "ano inteiro" (Jan–Dez). Só faz sentido em telas que
   *  agregam o range (ex.: Ranking) — não nas que clampam pro 1º mês. */
  enableYear?: boolean
  years?: number[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const range: DateRange = isPeriod(current) ? rangeFromPeriod(current) : current
  const isFullMonthCurrent = rangeIsFullMonth(range)
  // Sem param na URL = "default implícito" (mês corrente). Mostra "Selecionar
  // período" no botão. Quando o user clica e escolhe algo (ou se a URL já tem
  // param), mostra o label do que tá ativo.
  const hasExplicitParam =
    !!searchParams.get("periodo") ||
    !!searchParams.get("inicio") ||
    !!searchParams.get("fim")

  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora ou Esc
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

  function applyRange(start: string, end: string) {
    const params = new URLSearchParams(searchParams.toString())
    // Se for mês inteiro, usa ?periodo=YYYY-MM (mais limpo na URL)
    const r = { start, end }
    if (rangeIsFullMonth(r)) {
      params.set("periodo", start.slice(0, 7))
      params.delete("inicio")
      params.delete("fim")
    } else {
      params.set("inicio", start)
      params.set("fim", end)
      params.delete("periodo")
    }
    router.push(`${pathname}?${params.toString()}`)
    setOpen(false)
  }

  function clearToCurrentMonth() {
    const today = nowParts()
    const p = { year: today.year, month: today.month }
    const r = rangeFromPeriod(p)
    applyRange(r.start, r.end)
  }

  const label = hasExplicitParam ? formatRangeLabel(range) : "Selecionar período"

  return (
    <div ref={rootRef} className={`relative inline-flex ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-9 items-center gap-2 rounded-md border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
      >
        <Calendar className="size-3.5 text-muted-foreground" />
        <span>{label}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>

      {open && (
        <RangePickerPanel
          initial={range}
          onApply={applyRange}
          onClear={clearToCurrentMonth}
          onClose={() => setOpen(false)}
          years={enableYear ? years : undefined}
        />
      )}
    </div>
  )
}

function isPeriod(v: Period | DateRange): v is Period {
  return (v as Period).month !== undefined
}

// ─── Painel do picker (atalhos à esquerda + calendário duplo à direita) ─

function RangePickerPanel({
  initial,
  onApply,
  onClear,
  onClose,
  years,
}: {
  initial: DateRange
  onApply: (start: string, end: string) => void
  onClear: () => void
  onClose: () => void
  years?: number[]
}) {
  // Estado interno do picker — só "commita" pra URL no Aplicar / atalho
  const [start, setStart] = React.useState<string | null>(initial.start)
  const [end, setEnd] = React.useState<string | null>(initial.end)
  const [hover, setHover] = React.useState<string | null>(null)
  // Posicionamento dinâmico: o painel é grande (680px) e o botão fica em
  // headers com vários outros filtros — se abrir com `left-0` sai da viewport.
  // Mede o parent (div.relative que ancora) e aplica shift X pra clampar
  // dentro da viewport com 16px de folga. Funciona em qualquer largura.
  const panelRef = React.useRef<HTMLDivElement>(null)
  const [shiftX, setShiftX] = React.useState(0)
  React.useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return
    const parent = el.offsetParent as HTMLElement | null
    if (!parent) return
    const pr = parent.getBoundingClientRect()
    const panelW = el.offsetWidth || 680
    // Com left-0, panel ocuparia [pr.left, pr.left + panelW]. Clampa em [16, vw-16].
    const want = pr.left
    const min = 16
    const max = window.innerWidth - panelW - 16
    const target = Math.max(min, Math.min(want, max))
    setShiftX(target - want)
  }, [])
  // Mês exibido à esquerda (o direito é sempre mês+1)
  const [leftMonth, setLeftMonth] = React.useState<Period>(() => {
    const d = parseIso(initial.start)
    // Se o range cabe em 1 mês, mostra esse mês à esquerda. Se cross-month,
    // mostra o mês do start à esquerda e o próximo à direita.
    return { year: d.year, month: d.month }
  })

  const rightMonth = addMonth(leftMonth, 1)
  const today = nowParts()
  const todayIso = toIso(today)

  function clickDay(iso: string) {
    if (!start || (start && end)) {
      // Inicia novo range
      setStart(iso)
      setEnd(null)
      setHover(null)
      return
    }
    // Já tem start, sem end → fixa o end
    if (iso < start) {
      // Clicou antes do start → vira novo start, end = start antigo
      setEnd(start)
      setStart(iso)
    } else {
      setEnd(iso)
    }
    setHover(null)
  }

  // Pra display do hover: se temos só start, preview até hover
  const effectiveEnd = end ?? (hover && start && hover >= start ? hover : null)
  const effectiveStart =
    end || !hover || !start || hover >= start
      ? start
      : hover // hover < start, preview invertido

  const canApply = start && end
  const days = canApply ? rangeDays({ start: start!, end: end! }) : 0

  function applyShortcut(s: string, e: string) {
    setStart(s)
    setEnd(e)
    // Pula o "Aplicar" — commit direto
    setTimeout(() => onApply(s, e), 0)
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      style={{ transform: `translateX(${shiftX}px)` }}
      className="absolute left-0 top-[calc(100%+6px)] z-50 flex w-[680px] max-w-[calc(100vw-2rem)] rounded-lg border bg-popover shadow-lg"
    >
      {/* Coluna 1: atalhos */}
      <div className="flex w-44 flex-col border-r p-3">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Atalhos
        </div>
        <ShortcutItem
          label="Hoje"
          onClick={() => applyShortcut(todayIso, todayIso)}
        />
        <ShortcutItem
          label="Últimos 7 dias"
          onClick={() => {
            const e = todayIso
            const s = toIso(addDays(today, -6))
            applyShortcut(s, e)
          }}
        />
        <ShortcutItem
          label="Últimos 30 dias"
          onClick={() => {
            const e = todayIso
            const s = toIso(addDays(today, -29))
            applyShortcut(s, e)
          }}
        />
        <ShortcutItem
          label="Este mês"
          onClick={() => {
            const p = { year: today.year, month: today.month }
            applyShortcut(firstDayOfMonth(p), lastDayOfMonth(p))
          }}
        />
        <ShortcutItem
          label="Mês passado"
          onClick={() => {
            const p = previousMonth({ year: today.year, month: today.month })
            applyShortcut(firstDayOfMonth(p), lastDayOfMonth(p))
          }}
        />
        <ShortcutItem
          label="Últimos 3 meses"
          onClick={() => {
            const e = todayIso
            const s = toIso(addDays(today, -89))
            applyShortcut(s, e)
          }}
        />
        <ShortcutItem
          label="Este ano"
          onClick={() => {
            const s = `${today.year}-01-01`
            applyShortcut(s, todayIso)
          }}
        />
        {years && years.length > 0 && (
          <div className="mt-2 border-t pt-2">
            <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Ano inteiro
            </div>
            {years.map((y) => (
              <ShortcutItem
                key={y}
                label={`${y} · Jan–Dez`}
                onClick={() => applyShortcut(`${y}-01-01`, `${y}-12-31`)}
              />
            ))}
          </div>
        )}
        <div className="mt-auto border-t pt-2">
          <ShortcutItem
            label="Limpar"
            muted
            onClick={() => {
              onClear()
            }}
          />
        </div>
      </div>

      {/* Coluna 2: calendário duplo */}
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-3 flex items-center">
          <button
            type="button"
            onClick={() => setLeftMonth(addMonth(leftMonth, -1))}
            aria-label="Mês anterior"
            className="flex size-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <div className="flex-1 text-center text-xs font-semibold lowercase">
            {monthLabel(leftMonth)}
          </div>
          <div className="flex-1 text-center text-xs font-semibold lowercase">
            {monthLabel(rightMonth)}
          </div>
          <button
            type="button"
            onClick={() => setLeftMonth(addMonth(leftMonth, 1))}
            aria-label="Próximo mês"
            className="flex size-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
        <div className="flex gap-6">
          <CalendarMonth
            month={leftMonth}
            start={effectiveStart}
            end={effectiveEnd}
            onClickDay={clickDay}
            onHoverDay={setHover}
            todayIso={todayIso}
          />
          <CalendarMonth
            month={rightMonth}
            start={effectiveStart}
            end={effectiveEnd}
            onClickDay={clickDay}
            onHoverDay={setHover}
            todayIso={todayIso}
          />
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3">
          <div className="text-[11px] text-muted-foreground">
            {start && end
              ? `${days} dia${days === 1 ? "" : "s"} · ${formatRangeLabel({ start, end })}`
              : start
                ? `Início ${fmtDayLabel(start)} — escolha o fim`
                : "Selecione o início e o fim"}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!canApply}
              onClick={() => start && end && onApply(start, end)}
              className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
            >
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ShortcutItem({
  label,
  onClick,
  muted,
}: {
  label: string
  onClick: () => void
  muted?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-0.5 w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted ${
        muted ? "text-muted-foreground" : "text-foreground"
      }`}
    >
      {label}
    </button>
  )
}

// ─── Calendário de 1 mês ────────────────────────────────────────────

const DOW_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"]

function CalendarMonth({
  month,
  start,
  end,
  onClickDay,
  onHoverDay,
  todayIso,
}: {
  month: Period
  start: string | null
  end: string | null
  onClickDay: (iso: string) => void
  onHoverDay: (iso: string | null) => void
  todayIso: string
}) {
  const firstDow = new Date(month.year, month.month - 1, 1).getDay() // 0..6, dom..sab
  const lastDay = new Date(month.year, month.month, 0).getDate()
  const prevMonth = addMonth(month, -1)
  const prevLastDay = new Date(prevMonth.year, prevMonth.month, 0).getDate()

  // 6 linhas × 7 = 42 células. Algumas mostram o mês anterior/próximo, cinza.
  const cells: Array<{ iso: string; day: number; inMonth: boolean }> = []
  // Mês anterior pra preencher antes do dia 1
  for (let i = firstDow - 1; i >= 0; i--) {
    const d = prevLastDay - i
    cells.push({
      iso: `${prevMonth.year}-${pad(prevMonth.month)}-${pad(d)}`,
      day: d,
      inMonth: false,
    })
  }
  // Mês atual
  for (let d = 1; d <= lastDay; d++) {
    cells.push({
      iso: `${month.year}-${pad(month.month)}-${pad(d)}`,
      day: d,
      inMonth: true,
    })
  }
  // Mês próximo pra completar 42
  const nextMonth = addMonth(month, 1)
  let d = 1
  while (cells.length < 42) {
    cells.push({
      iso: `${nextMonth.year}-${pad(nextMonth.month)}-${pad(d)}`,
      day: d,
      inMonth: false,
    })
    d++
  }

  return (
    <div className="flex-1">
      <div className="mb-1.5 grid grid-cols-7 gap-y-1 text-center text-[10px] font-medium text-muted-foreground">
        {DOW_LABELS.map((l) => (
          <div key={l}>{l}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((c, i) => {
          const isStart = start === c.iso
          const isEnd = end === c.iso
          const inRange =
            start && end && c.iso >= start && c.iso <= end ? true : false
          const isToday = c.iso === todayIso
          const isEndpoint = isStart || isEnd
          return (
            <button
              key={`${c.iso}-${i}`}
              type="button"
              onClick={() => onClickDay(c.iso)}
              onMouseEnter={() => onHoverDay(c.iso)}
              onMouseLeave={() => onHoverDay(null)}
              className={`relative flex h-8 items-center justify-center text-[11px] tabular-nums transition-colors ${
                !c.inMonth
                  ? "text-muted-foreground/40"
                  : isEndpoint
                    ? "z-10 rounded-full bg-primary font-semibold text-primary-foreground"
                    : inRange
                      ? "bg-primary/15 text-foreground"
                      : isToday
                        ? "font-semibold text-primary"
                        : "text-foreground hover:bg-muted"
              } ${
                inRange && !isEndpoint
                  ? c.iso === start ||
                    (start &&
                      end &&
                      c.iso === toIso(addDays(parseIso(start), 0)))
                    ? "rounded-l-full"
                    : c.iso === end
                      ? "rounded-r-full"
                      : ""
                  : ""
              }`}
            >
              {c.day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Helpers de data (sem libs externas) ────────────────────────────

type DateParts = { year: number; month: number; day: number }

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

function toIso(p: DateParts): string {
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

function parseIso(iso: string): DateParts {
  return {
    year: Number(iso.slice(0, 4)),
    month: Number(iso.slice(5, 7)),
    day: Number(iso.slice(8, 10)),
  }
}

function addDays(p: DateParts, n: number): DateParts {
  const d = new Date(p.year, p.month - 1, p.day + n)
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
}

function addMonth(p: Period, n: number): Period {
  const d = new Date(p.year, p.month - 1 + n, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

function previousMonth(p: Period): Period {
  return addMonth(p, -1)
}

function nowParts(): DateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  return { year: get("year"), month: get("month"), day: get("day") }
}

const MESES_NOMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
]

function monthLabel(p: Period): string {
  return `${MESES_NOMES[p.month - 1]} ${p.year}`
}

const MES_ABREV = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
]

function fmtDayLabel(iso: string): string {
  const p = parseIso(iso)
  return `${pad(p.day)}/${MES_ABREV[p.month - 1]}`
}
