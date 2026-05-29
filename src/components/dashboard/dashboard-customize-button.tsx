"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { Check, RotateCcw, SlidersHorizontal } from "lucide-react"

import {
  SECTION_META,
  SECTION_ORDER,
  useDashboardPrefs,
} from "@/lib/hooks/use-dashboard-prefs"

/**
 * Botão "Customizar Dashboard" no topbar.
 *
 * Visível só quando a rota é `/` (Dashboard). Abre um popover ancorado à
 * direita do botão com as 4 seções e checkboxes. Estado persiste em
 * localStorage via `useDashboardPrefs`.
 *
 * Popover é custom (não Base UI Menu) porque o dropdown-menu fecha ao
 * clicar num item — queremos toggle múltiplo sem fechar.
 */
export function DashboardCustomizeButton() {
  const pathname = usePathname()
  const isDashboard = pathname === "/"

  const { prefs, toggle, resetAll, ready } = useDashboardPrefs()
  const [open, setOpen] = React.useState(false)
  const wrapperRef = React.useRef<HTMLDivElement>(null)

  // Fechar ao clicar fora ou apertar Esc
  React.useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    document.addEventListener("keydown", handleKey)
    return () => {
      document.removeEventListener("mousedown", handleClick)
      document.removeEventListener("keydown", handleKey)
    }
  }, [open])

  if (!isDashboard) return null

  const hiddenCount = ready
    ? SECTION_ORDER.filter((id) => !prefs[id]).length
    : 0

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-label="Customizar dashboard"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[active=true]:bg-muted data-[active=true]:text-foreground"
        data-active={open}
      >
        <SlidersHorizontal className="size-4" />
        {hiddenCount > 0 && (
          <span className="absolute right-1 top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
            {hiddenCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-lg ring-1 ring-foreground/10">
          <div className="flex items-center justify-between px-2 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Seções do Dashboard
            </p>
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Restaurar padrão"
            >
              <RotateCcw className="size-3" />
              Restaurar
            </button>
          </div>

          <div className="space-y-0.5">
            {SECTION_ORDER.map((id) => {
              const meta = SECTION_META[id]
              const isOn = prefs[id]
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle(id)}
                  className="flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <div
                    className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      isOn
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background"
                    }`}
                  >
                    {isOn && <Check className="size-3" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">
                      <span className="mr-1 text-muted-foreground">
                        {meta.number}.
                      </span>
                      {meta.label}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {meta.description}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>

          <p className="mt-1 border-t px-2 py-1.5 text-[10px] text-muted-foreground">
            Suas preferências ficam salvas neste navegador.
          </p>
        </div>
      )}
    </div>
  )
}
