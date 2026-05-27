"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRight, Filter, Search, X } from "lucide-react"

import { BrandLogo } from "@/components/brand-logo"
import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import type { Unit } from "@/lib/data/units"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import { DeleteUnitButton } from "./delete-unit-button"
import { EditUnitDialog } from "./edit-unit-dialog"
import { NewUnitDialog } from "./new-unit-dialog"

const ALL_PLATFORMS: { id: PlatformId; label: string }[] = [
  { id: "ifood", label: "iFood" },
  { id: "99food", label: "99 Food" },
  { id: "keeta", label: "Keeta" },
]

export function UnitsListView({ units }: { units: Unit[] }) {
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
            Visão por loja · Maio/2026
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
          <NewUnitDialog />
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

      {/* Tabela */}
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
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="grid grid-cols-[44px_minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_108px] items-center gap-3 border-b px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <div></div>
            <div>Nome</div>
            <div className="text-center">Cidade</div>
            <div className="text-center">Plataformas</div>
            <div className="text-right">Faturamento</div>
            <div className="text-right">Margem</div>
            <div></div>
          </div>

          {filtered.map((unit, idx) => {
            const m = unit.monthly
            const hasData = m.pedidos > 0
            return (
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
                className={`grid cursor-pointer grid-cols-[44px_minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_108px] items-center gap-3 px-5 py-3 text-sm transition-colors hover:bg-muted/30 ${
                  idx < filtered.length - 1 ? "border-b" : ""
                } ${!unit.active ? "opacity-60" : ""}`}
              >
                <BrandLogo size="md" />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="inline-flex shrink-0 items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                      #{unit.code}
                    </span>
                    <p className="truncate font-medium">{unit.name}</p>
                  </div>
                  {!unit.active && (
                    <span className="text-[10px] text-muted-foreground">
                      Inativa
                    </span>
                  )}
                </div>
                <div className="truncate text-center text-xs text-muted-foreground">
                  {unit.city ?? "—"}
                </div>
                <div className="flex items-center justify-center gap-1">
                  {unit.platforms.length === 0 ? (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  ) : (
                    unit.platforms.map((p) => (
                      <PlatformLogo key={p} platform={p} size="sm" />
                    ))
                  )}
                </div>
                <div className="text-right tabular-nums font-semibold">
                  {hasData ? fmtBRL(m.faturamentoBruto) : "—"}
                </div>
                <div className="text-right tabular-nums">
                  {hasData ? (
                    <span
                      className={`font-semibold ${
                        m.margemLucroPct >= 30
                          ? "text-emerald-600 dark:text-emerald-400"
                          : m.margemLucroPct >= 20
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {fmtPct(m.margemLucroPct)}
                    </span>
                  ) : (
                    "—"
                  )}
                </div>
                <div
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="flex items-center gap-0.5"
                >
                  <Link
                    href={`/unidades/${unit.code}`}
                    aria-label="Ver detalhe"
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <ChevronRight className="size-3.5" />
                  </Link>
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
                      platforms: unit.platforms,
                    }}
                  />
                  <DeleteUnitButton unitId={unit.id} unitName={unit.name} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
