"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { useNavigate } from "@/components/shared/navigation-progress"

import { PlatformLogo, type PlatformId,
  PLATAFORMAS as TODAS_PLATAFORMAS,
  rotuloPlataforma,
} from "@/components/platform-logo"
import {
  COMPARATIVO_METRICS,
  type ComparativoMetric,
} from "@/lib/data/comparativo-metrics"
import type { PeriodOption, UnitOption } from "./comparativo-filters"
import { SeletorLojas } from "./seletor-lojas"

const PLATAFORMAS: { id: PlatformId; label: string }[] = TODAS_PLATAFORMAS.map((id) => ({
  id,
  label: rotuloPlataforma(id),
}))

export function EvolucaoFilters({
  units,
  periods,
  platforms,
  initial,
}: {
  units: UnitOption[]
  periods: PeriodOption[]
  /** Plataformas habilitadas no tenant — só essas viram chip. */
  platforms: PlatformId[]
  initial: {
    plataformas: PlatformId[]
    lojas: string[]
    de: string
    ate: string
    metrica: ComparativoMetric
  }
}) {
  const PLATS_ATIVAS = PLATAFORMAS.filter((p) => platforms.includes(p.id))
  const navigate = useNavigate()
  const pathname = usePathname()

  const [plataformas, setPlataformas] = React.useState<Set<PlatformId>>(
    new Set(initial.plataformas),
  )
  const [lojas, setLojas] = React.useState<Set<string>>(new Set(initial.lojas))
  const [de, setDe] = React.useState(initial.de)
  const [ate, setAte] = React.useState(initial.ate)
  const [metrica, setMetrica] = React.useState<ComparativoMetric>(
    initial.metrica,
  )

  function togglePlat(id: PlatformId) {
    setPlataformas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size > 1) next.delete(id)
      } else next.add(id)
      return next
    })
  }

  function aplicar() {
    const params = new URLSearchParams()
    if (plataformas.size > 0 && plataformas.size < PLATS_ATIVAS.length) {
      params.set("plat", Array.from(plataformas).join(","))
    }
    if (lojas.size > 0) params.set("lojas", Array.from(lojas).join(","))
    // garante de <= ate
    const a = de <= ate ? de : ate
    const b = de <= ate ? ate : de
    params.set("de", a)
    params.set("ate", b)
    params.set("metrica", metrica)
    navigate(`${pathname}?${params.toString()}`)
  }

  const lojasLabel =
    lojas.size === 0
      ? "Rede toda"
      : lojas.size === 1
        ? "1 loja"
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
            {PLATS_ATIVAS.map((p) => {
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
          <SeletorLojas
            units={units}
            selecionadas={lojas}
            onChange={setLojas}
            rotulo={lojasLabel}
          />
        </div>

        {/* Indicador */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Indicador
          </span>
          <select
            value={metrica}
            onChange={(e) => setMetrica(e.target.value as ComparativoMetric)}
            className="h-9 rounded-md border bg-card px-2.5 text-xs font-medium"
          >
            {COMPARATIVO_METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* De */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            De
          </span>
          <select
            value={de}
            onChange={(e) => setDe(e.target.value)}
            className="h-9 rounded-md border bg-card px-2.5 text-xs font-medium"
          >
            {periods.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Até */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Até
          </span>
          <select
            value={ate}
            onChange={(e) => setAte(e.target.value)}
            className="h-9 rounded-md border bg-card px-2.5 text-xs font-medium"
          >
            {periods.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
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
    </div>
  )
}
