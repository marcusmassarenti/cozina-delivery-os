"use client"

import * as React from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  formatPeriodKey,
  formatPeriodLabel,
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
 * Seletor de período com 3 partes:
 *  [◀]  [ 📅 Maio/2026 ▾ ]  [▶]
 *
 * - Setas avançam/voltam pra próximo/anterior na lista de `options`
 *   (lista vem ordenada do mais recente pro mais antigo; "anterior" = idx+1)
 * - Setas ficam disabled nas pontas
 * - Click no centro abre dropdown com a lista completa
 */
export function PeriodSelector({
  current,
  options,
  className,
}: {
  current: Period
  options: AvailablePeriodOption[]
  className?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const currentKey = formatPeriodKey(current)

  function navigateTo(key: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set("periodo", key)
    router.push(`${pathname}?${params.toString()}`)
  }

  // Índice atual na lista (options vem ordenada DESC: mais recente primeiro)
  const idx = options.findIndex(
    (o) => o.year === current.year && o.month === current.month,
  )
  const hasNewer = idx > 0
  const hasOlder = idx >= 0 && idx < options.length - 1

  function goPrev() {
    // Mês anterior = próximo idx na lista DESC
    if (!hasOlder) return
    navigateTo(formatPeriodKey(options[idx + 1]))
  }

  function goNext() {
    if (!hasNewer) return
    navigateTo(formatPeriodKey(options[idx - 1]))
  }

  return (
    <div className={`inline-flex items-center gap-1 ${className ?? ""}`}>
      <button
        type="button"
        onClick={goPrev}
        disabled={!hasOlder}
        aria-label="Mês anterior"
        className="flex h-9 w-8 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronLeft className="size-3.5" />
      </button>

      <Select
        value={currentKey}
        onValueChange={(v) => v && navigateTo(v)}
      >
        <SelectTrigger className="h-9 min-w-[160px] gap-2 bg-card text-xs font-semibold">
          <Calendar className="size-3.5" />
          <SelectValue placeholder={formatPeriodLabel(current)}>
            {formatPeriodLabel(current)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => {
            const key = formatPeriodKey(opt)
            const label = formatPeriodLabel(opt)
            const badges: string[] = []
            if (opt.hasFinanceiro) badges.push("F")
            if (opt.hasCardapio) badges.push("C")
            if (opt.hasAvaliacoes) badges.push("A")
            return (
              <SelectItem key={key} value={key}>
                <div className="flex items-center gap-2">
                  <span>{label}</span>
                  {badges.length > 0 && (
                    <span className="text-[9px] font-mono text-muted-foreground">
                      {badges.join("·")}
                    </span>
                  )}
                </div>
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>

      <button
        type="button"
        onClick={goNext}
        disabled={!hasNewer}
        aria-label="Próximo mês"
        className="flex h-9 w-8 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronRight className="size-3.5" />
      </button>
    </div>
  )
}
