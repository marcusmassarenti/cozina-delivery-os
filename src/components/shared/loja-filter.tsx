"use client"

import * as React from "react"
import { useSearchParams, usePathname } from "next/navigation"
import { useNavigate } from "@/components/shared/navigation-progress"
import { Check, ChevronDown, Store } from "lucide-react"

export type LojaOption = { code: string; name: string }

/**
 * Filtro de lojas reutilizável (multi-seleção via popover) que escreve no
 * query param `lojas` (códigos separados por vírgula). "Todas" = param ausente.
 * Reusado em várias telas de rede (Relatório Diário, DRE, Resultado…).
 */
export function LojaFilter({
  units,
  param = "lojas",
}: {
  units: LojaOption[]
  param?: string
}) {
  const navigate = useNavigate()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const fromUrl = (searchParams.get(param) ?? "").split(",").filter(Boolean)
  const urlKey = fromUrl.join(",")

  const [open, setOpen] = React.useState(false)
  const [sel, setSel] = React.useState<Set<string>>(new Set(fromUrl))

  // Resync se a URL mudar por fora (voltar/avançar do navegador).
  React.useEffect(() => {
    setSel(new Set(urlKey ? urlKey.split(",") : []))
  }, [urlKey])

  function toggle(code: string) {
    setSel((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  function aplicar() {
    const params = new URLSearchParams(searchParams.toString())
    if (sel.size > 0) params.set(param, Array.from(sel).join(","))
    else params.delete(param)
    navigate(`${pathname}?${params.toString()}`)
    setOpen(false)
  }

  const label =
    sel.size === 0
      ? "Todas as lojas"
      : sel.size === 1
        ? "1 loja"
        : `${sel.size} lojas`

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 min-w-[150px] items-center justify-between gap-2 rounded-md border bg-card px-3 text-xs font-medium transition-colors hover:bg-muted"
      >
        <span className="inline-flex items-center gap-1.5">
          <Store className="size-3.5 text-muted-foreground" />
          {label}
        </span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 flex max-h-80 w-64 flex-col rounded-md border bg-popover shadow-lg">
            <div className="flex items-center justify-between border-b px-2 py-1.5">
              <button
                type="button"
                onClick={() => setSel(new Set())}
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
              >
                Todas
              </button>
              <button
                type="button"
                onClick={() => setSel(new Set(units.map((u) => u.code)))}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Selecionar todas
              </button>
            </div>
            <div className="flex-1 overflow-auto p-1">
              {units.map((u) => {
                const on = sel.has(u.code)
                return (
                  <button
                    key={u.code}
                    type="button"
                    onClick={() => toggle(u.code)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                  >
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input"
                      }`}
                    >
                      {on && <Check className="size-3" />}
                    </span>
                    <span className="truncate">
                      {u.name}{" "}
                      <span className="text-muted-foreground">#{u.code}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="border-t p-1.5">
              <button
                type="button"
                onClick={aplicar}
                className="h-8 w-full rounded-md bg-primary text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Aplicar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
