"use client"

import * as React from "react"
import { useRouter, usePathname } from "next/navigation"
import { Check, ChevronDown, Store, X } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import {
  COMPARATIVO_METRICS,
  type ComparativoMetric,
} from "@/lib/data/comparativo-metrics"

const PLATAFORMAS: { id: PlatformId; label: string }[] = [
  { id: "ifood", label: "iFood" },
  { id: "99food", label: "99 Food" },
  { id: "keeta", label: "Keeta" },
]

export type PeriodOption = { key: string; label: string }
export type UnitOption = { code: string; name: string }

export function ComparativoFilters({
  units,
  periods,
  initial,
}: {
  units: UnitOption[]
  periods: PeriodOption[]
  initial: {
    plataformas: PlatformId[]
    lojas: string[]
    mesA: string
    mesB: string | null
    metrica: ComparativoMetric
  }
}) {
  const router = useRouter()
  const pathname = usePathname()

  const [plataformas, setPlataformas] = React.useState<Set<PlatformId>>(
    new Set(initial.plataformas),
  )
  const [lojas, setLojas] = React.useState<Set<string>>(new Set(initial.lojas))
  const [mesA, setMesA] = React.useState(initial.mesA)
  const [comparar, setComparar] = React.useState(initial.mesB !== null)
  const [mesB, setMesB] = React.useState(
    initial.mesB ?? periods.find((p) => p.key !== initial.mesA)?.key ?? "",
  )
  const [metrica, setMetrica] = React.useState<ComparativoMetric>(
    initial.metrica,
  )
  const [lojasOpen, setLojasOpen] = React.useState(false)

  function togglePlat(id: PlatformId) {
    setPlataformas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size > 1) next.delete(id) // sempre ao menos 1
      } else next.add(id)
      return next
    })
  }

  function toggleLoja(code: string) {
    setLojas((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  function aplicar() {
    const params = new URLSearchParams()
    if (plataformas.size > 0 && plataformas.size < 3) {
      params.set("plat", Array.from(plataformas).join(","))
    }
    if (lojas.size > 0) params.set("lojas", Array.from(lojas).join(","))
    params.set("mesA", mesA)
    if (comparar && mesB && mesB !== mesA) params.set("mesB", mesB)
    params.set("metrica", metrica)
    router.push(`${pathname}?${params.toString()}`)
  }

  const lojasLabel =
    lojas.size === 0
      ? "Todas as lojas"
      : lojas.size === 1
        ? `1 loja`
        : `${lojas.size} lojas`

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        {/* Plataformas */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Plataformas
          </span>
          <div className="flex items-center gap-1">
            {PLATAFORMAS.map((p) => {
              const on = plataformas.has(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePlat(p.id)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
                    on
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "bg-card text-muted-foreground opacity-50 hover:opacity-100"
                  }`}
                >
                  <PlatformLogo platform={p.id} size="sm" />
                  {p.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Lojas (multi) */}
        <div className="relative flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Lojas
          </span>
          <button
            type="button"
            onClick={() => setLojasOpen((o) => !o)}
            className="inline-flex h-9 min-w-[150px] items-center justify-between gap-2 rounded-md border bg-card px-2.5 text-xs font-medium"
          >
            <span className="inline-flex items-center gap-1.5">
              <Store className="size-3.5 text-muted-foreground" />
              {lojasLabel}
            </span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </button>
          {lojasOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setLojasOpen(false)}
              />
              <div className="absolute top-full z-20 mt-1 max-h-72 w-60 overflow-auto rounded-md border bg-popover p-1 shadow-lg">
                <div className="flex items-center justify-between px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => setLojas(new Set())}
                    className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    Todas
                  </button>
                  <button
                    type="button"
                    onClick={() => setLojas(new Set(units.map((u) => u.code)))}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    Selecionar todas
                  </button>
                </div>
                {units.map((u) => {
                  const on = lojas.has(u.code)
                  return (
                    <button
                      key={u.code}
                      type="button"
                      onClick={() => toggleLoja(u.code)}
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
            </>
          )}
        </div>

        {/* Mês A */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {comparar ? "Mês (atual)" : "Mês"}
          </span>
          <select
            value={mesA}
            onChange={(e) => setMesA(e.target.value)}
            className="h-9 rounded-md border bg-card px-2.5 text-xs font-medium"
          >
            {periods.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Comparar com (Mês B) */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Comparar com
          </span>
          {comparar ? (
            <div className="flex items-center gap-1">
              <select
                value={mesB}
                onChange={(e) => setMesB(e.target.value)}
                className="h-9 rounded-md border bg-card px-2.5 text-xs font-medium"
              >
                {periods.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setComparar(false)}
                aria-label="Remover comparação"
                className="flex h-9 w-8 items-center justify-center rounded-md border bg-card text-muted-foreground hover:bg-muted"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setComparar(true)}
              className="inline-flex h-9 items-center rounded-md border border-dashed bg-card px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              + outro mês
            </button>
          )}
        </div>

        {/* Indicador foco (só importa quando comparando) */}
        {comparar && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Indicador
            </span>
            <select
              value={metrica}
              onChange={(e) =>
                setMetrica(e.target.value as ComparativoMetric)
              }
              className="h-9 rounded-md border bg-card px-2.5 text-xs font-medium"
            >
              {COMPARATIVO_METRICS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          type="button"
          onClick={aplicar}
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Aplicar
        </button>
      </div>
    </div>
  )
}
