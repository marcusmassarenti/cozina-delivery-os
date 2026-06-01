"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRight, Filter, Search, X } from "lucide-react"

import { BrandLogo } from "@/components/brand-logo"
import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import type { Unit } from "@/lib/data/units"
import { DeleteUnitButton } from "./delete-unit-button"
import { EditUnitDialog } from "./edit-unit-dialog"
import { NewUnitDialog } from "./new-unit-dialog"

const ALL_PLATFORMS: { id: PlatformId; label: string }[] = [
  { id: "ifood", label: "iFood" },
  { id: "99food", label: "99 Food" },
  { id: "keeta", label: "Keeta" },
]

export function UnitsListView({
  units,
  canEdit = false,
  canDelete = false,
}: {
  units: Unit[]
  canEdit?: boolean
  canDelete?: boolean
}) {
  const router = useRouter()
  const [search, setSearch] = React.useState("")
  const [cityFilter, setCityFilter] = React.useState<string>("")
  const [platformFilter, setPlatformFilter] = React.useState<PlatformId[]>([])
  const [onlyActive, setOnlyActive] = React.useState(false)

  const cities = React.useMemo(() => {
    const set = new Set<string>()
    for (const u of units) if (u.city) set.add(u.city)
    return Array.from(set).sort()
  }, [units])

  const filtered = React.useMemo(() => {
    return units.filter((u) => {
      if (onlyActive && !u.active) return false
      if (cityFilter && u.city !== cityFilter) return false
      if (platformFilter.length > 0) {
        const has = platformFilter.every((p) => u.platforms.includes(p))
        if (!has) return false
      }
      if (search) {
        const s = search.toLowerCase()
        if (
          !u.name.toLowerCase().includes(s) &&
          !u.code.toLowerCase().includes(s) &&
          !(u.city ?? "").toLowerCase().includes(s)
        ) {
          return false
        }
      }
      return true
    })
  }, [units, search, cityFilter, platformFilter, onlyActive])

  const togglePlatform = (id: PlatformId) =>
    setPlatformFilter((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    )

  const clearFilters = () => {
    setSearch("")
    setCityFilter("")
    setPlatformFilter([])
    setOnlyActive(false)
  }

  const hasFilters =
    search !== "" ||
    cityFilter !== "" ||
    platformFilter.length > 0 ||
    onlyActive

  const activeCount = units.filter((u) => u.active).length

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Unidades</h1>
            {units.length > 0 && (
              <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent-foreground">
                {units.length} no total · {activeCount} ativas
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Escolhe uma unidade pra ver detalhes do mês
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar unidade..."
              className="h-9 w-48 rounded-md border bg-card pl-8 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
            />
          </div>
          {canEdit && <NewUnitDialog />}
        </div>
      </div>

      {/* Filters row */}
      {units.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
          <Filter className="size-3.5 text-muted-foreground" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Filtros
          </span>

          {/* Cidade */}
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
          >
            <option value="">Todas as cidades</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Plataformas */}
          <div className="flex items-center gap-1.5">
            {ALL_PLATFORMS.map((p) => {
              const active = platformFilter.includes(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePlatform(p.id)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border bg-background text-muted-foreground opacity-70 hover:opacity-100"
                  }`}
                >
                  <PlatformLogo platform={p.id} size="sm" />
                  {p.label}
                </button>
              )
            })}
          </div>

          {/* Toggle ativas */}
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(e) => setOnlyActive(e.target.checked)}
              className="size-3.5 rounded border-border"
            />
            Só ativas
          </label>

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3" />
              Limpar
            </button>
          )}
        </div>
      )}

      {/* Grid de cards */}
      {units.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-12 text-center">
          <p className="text-sm font-medium">Nenhuma unidade cadastrada</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Clique em &quot;+ Nova Unidade&quot; acima pra cadastrar a primeira
            loja da rede.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-12 text-center">
          <p className="text-sm font-medium">Nenhuma unidade bate com os filtros</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-2 text-xs font-medium text-primary hover:underline"
          >
            Limpar filtros
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((unit) => (
            <div
              key={unit.code}
              onClick={() => router.push(`/unidades/${unit.code}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  router.push(`/unidades/${unit.code}`)
                }
              }}
              className={`group relative flex cursor-pointer flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md ${
                !unit.active ? "opacity-60" : ""
              }`}
            >
              {/* Top: logo + ações */}
              <div className="flex items-start justify-between">
                <BrandLogo size="md" />
                <div
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  {canEdit && (
                    <EditUnitDialog
                      inline
                      unit={{
                        unitId: unit.id,
                        code: unit.code,
                        name: unit.name,
                        city: unit.city,
                        state: unit.state,
                        cnpj: unit.cnpj,
                        active: unit.active,
                        dataInauguracao: unit.data_inauguracao,
                        dataEncerramento: unit.data_encerramento,
                        platforms: unit.platforms,
                        externalStoreIds: unit.externalStoreIds,
                        platformInauguracoes: unit.platformInauguracoes,
                      }}
                    />
                  )}
                  {canDelete && (
                    <DeleteUnitButton unitId={unit.id} unitName={unit.name} />
                  )}
                </div>
              </div>

              {/* Meio: código + nome + cidade/UF */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex shrink-0 items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                    #{unit.code}
                  </span>
                  {!unit.active && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Inativa
                    </span>
                  )}
                </div>
                <p className="line-clamp-2 text-sm font-semibold leading-snug">
                  {unit.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {unit.city ?? "—"}
                  {unit.state ? ` · ${unit.state}` : ""}
                </p>
              </div>

              {/* Bottom: plataformas + seta */}
              <div className="mt-auto flex items-center justify-between border-t pt-3">
                <div className="flex items-center gap-1">
                  {unit.platforms.length === 0 ? (
                    <span className="text-[10px] text-muted-foreground">
                      Nenhuma plataforma
                    </span>
                  ) : (
                    unit.platforms.map((p) => (
                      <PlatformLogo key={p} platform={p} size="sm" />
                    ))
                  )}
                </div>
                <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
