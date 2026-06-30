"use client"

import * as React from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { useNavigate } from "@/components/shared/navigation-progress"
import { Check, ChevronDown, Filter, Store, TrendingUp, X } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"

type UnitOption = { code: string; name: string }

const PLATFORMS: { id: PlatformId; label: string }[] = [
  { id: "ifood", label: "iFood" },
  { id: "99food", label: "99 Food" },
  { id: "keeta", label: "Keeta" },
]

/**
 * Filtros do Dashboard. Persistem via query params:
 *   ?ativo=1
 *   ?unidades=01,02
 *   ?plataforma=ifood
 *
 * Mantém o `?periodo=` intacto.
 */
export function DashboardFilters({
  unitOptions,
  ativo,
  unidadesSelected,
  plataformaSelected,
}: {
  unitOptions: UnitOption[]
  ativo: boolean
  unidadesSelected: string[]
  plataformaSelected: PlatformId | null
}) {
  const navigate = useNavigate()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [unitsOpen, setUnitsOpen] = React.useState(false)
  const [platOpen, setPlatOpen] = React.useState(false)

  function pushWith(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === null || value === "") {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    navigate(`${pathname}?${params.toString()}`)
  }

  function toggleAtivo() {
    pushWith("ativo", ativo ? null : "1")
  }

  function setUnidades(codes: string[]) {
    pushWith("unidades", codes.length === 0 ? null : codes.join(","))
  }

  function togglePlataforma(p: PlatformId | null) {
    pushWith("plataforma", p)
    setPlatOpen(false)
  }

  const unitsCount = unidadesSelected.length
  const allSelected = unitsCount === 0 || unitsCount === unitOptions.length

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Toggle: com faturamento */}
      <button
        type="button"
        onClick={toggleAtivo}
        className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ${
          ativo
            ? "border-primary bg-primary/10 text-primary"
            : "bg-card hover:bg-muted"
        }`}
      >
        <TrendingUp className="size-3.5" />
        Com faturamento
        {ativo && <Check className="size-3" />}
      </button>

      {/* Filtro unidades */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setUnitsOpen((p) => !p)
            setPlatOpen(false)
          }}
          className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ${
            unitsCount > 0
              ? "border-primary bg-primary/10 text-primary"
              : "bg-card hover:bg-muted"
          }`}
        >
          <Filter className="size-3.5" />
          {allSelected ? "Todas as unidades" : `${unitsCount} unid.`}
          <ChevronDown
            className={`size-3 transition-transform ${unitsOpen ? "rotate-180" : ""}`}
          />
        </button>
        {unitsOpen && (
          <div className="absolute right-0 z-50 mt-1 w-64 overflow-hidden rounded-md border bg-card shadow-lg">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Filtrar por unidade
              </span>
              {unitsCount > 0 && (
                <button
                  type="button"
                  onClick={() => setUnidades([])}
                  className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
                >
                  Limpar
                </button>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {unitOptions.map((u) => {
                const checked = unidadesSelected.includes(u.code)
                return (
                  <button
                    key={u.code}
                    type="button"
                    onClick={() =>
                      setUnidades(
                        checked
                          ? unidadesSelected.filter((c) => c !== u.code)
                          : [...unidadesSelected, u.code],
                      )
                    }
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted"
                  >
                    <div
                      className={`flex size-4 items-center justify-center rounded border ${
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background"
                      }`}
                    >
                      {checked && <Check className="size-3" />}
                    </div>
                    <span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                      #{u.code}
                    </span>
                    <span className="truncate">{u.name}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Filtro plataforma */}
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setPlatOpen((p) => !p)
            setUnitsOpen(false)
          }}
          className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors ${
            plataformaSelected
              ? "border-primary bg-primary/10 text-primary"
              : "bg-card hover:bg-muted"
          }`}
        >
          {plataformaSelected ? (
            <PlatformLogo platform={plataformaSelected} size="sm" />
          ) : (
            <Store className="size-3.5" />
          )}
          {plataformaSelected
            ? PLATFORMS.find((p) => p.id === plataformaSelected)?.label
            : "Todas plataformas"}
          <ChevronDown
            className={`size-3 transition-transform ${platOpen ? "rotate-180" : ""}`}
          />
        </button>
        {platOpen && (
          <div className="absolute right-0 z-50 mt-1 w-48 overflow-hidden rounded-md border bg-card shadow-lg">
            <button
              type="button"
              onClick={() => togglePlataforma(null)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
            >
              <Store className="size-3.5 text-muted-foreground" />
              Todas plataformas
              {plataformaSelected === null && (
                <Check className="ml-auto size-3 text-primary" />
              )}
            </button>
            <div className="border-t" />
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePlataforma(p.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
              >
                <PlatformLogo platform={p.id} size="sm" />
                {p.label}
                {plataformaSelected === p.id && (
                  <Check className="ml-auto size-3 text-primary" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Limpar tudo */}
      {(ativo || unitsCount > 0 || plataformaSelected) && (
        <button
          type="button"
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString())
            params.delete("ativo")
            params.delete("unidades")
            params.delete("plataforma")
            navigate(`${pathname}?${params.toString()}`)
          }}
          className="inline-flex h-9 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <X className="size-3" />
          Limpar filtros
        </button>
      )}
    </div>
  )
}
