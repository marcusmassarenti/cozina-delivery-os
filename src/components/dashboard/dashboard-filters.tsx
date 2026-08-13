"use client"

import * as React from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { useNavigate } from "@/components/shared/navigation-progress"
import { Check, ChevronDown, Filter, Store, TrendingUp, X } from "lucide-react"

import {
  PlatformLogo,
  PLATAFORMAS,
  rotuloPlataforma,
  type PlatformId,
} from "@/components/platform-logo"

type UnitOption = { code: string; name: string }

const PLATFORMS: { id: PlatformId; label: string }[] = PLATAFORMAS.map((id) => ({
  id,
  label: rotuloPlataforma(id),
}))

/**
 * Filtros do Dashboard. Persistem via query params:
 *   ?ativo=1
 *   ?unidades=01,02
 *   ?plataformas=ifood,keeta   (lista vazia/ausente = todas)
 *
 * Mantém o `?periodo=` intacto.
 */
export function DashboardFilters({
  unitOptions,
  ativo,
  unidadesSelected,
  plataformasSelected,
}: {
  unitOptions: UnitOption[]
  ativo: boolean
  unidadesSelected: string[]
  /** Vazio = todas. Marcar/desmarcar liga e desliga cada plataforma. */
  plataformasSelected: PlatformId[]
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

  function setPlataformas(ids: PlatformId[]) {
    // Marcar TODAS equivale a não filtrar — some da URL pra o link ficar
    // limpo e pra "Limpar filtros" não precisar de caso especial.
    const todas = ids.length === 0 || ids.length === PLATFORMS.length
    pushWith("plataformas", todas ? null : ids.join(","))
  }

  function togglePlataforma(id: PlatformId) {
    const base =
      plataformasSelected.length === 0
        ? PLATFORMS.map((p) => p.id) // "todas" implícito vira explícito
        : plataformasSelected
    const proxima = base.includes(id)
      ? base.filter((x) => x !== id)
      : [...base, id]
    // Desmarcar tudo não faz sentido (a tela ficaria vazia) — volta pra todas.
    setPlataformas(proxima.length === 0 ? [] : proxima)
  }

  // Vazio = todas. `platsAtivas` é a lista efetiva pra marcar os checkboxes.
  const platsFiltrando =
    plataformasSelected.length > 0 &&
    plataformasSelected.length < PLATFORMS.length
  const platsAtivas = platsFiltrando
    ? plataformasSelected
    : PLATFORMS.map((p) => p.id)

  const unitsCount = unidadesSelected.length
  const allSelected = unitsCount === 0 || unitsCount === unitOptions.length

  // Busca por nome OU código: quem tem 56 lojas decora o número de algumas e o
  // nome de outras. Sem acento e sem caixa, senão "Açaí" só acha quem digita a
  // cedilha certa.
  const [buscaUnidade, setBuscaUnidade] = React.useState("")
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
  const unitOptionsFiltradas = React.useMemo(() => {
    const q = norm(buscaUnidade.trim())
    if (!q) return unitOptions
    return unitOptions.filter(
      (u) => norm(u.name).includes(q) || u.code.toLowerCase().includes(q),
    )
  }, [unitOptions, buscaUnidade])

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
            {/* Busca: a DG FOODS tem 56 lojas, e achar a #30 numa lista
                rolável é caçar. Aparece só quando a rede é grande o bastante
                pra justificar — em quem tem 3 lojas, o campo seria só mais
                uma coisa na tela. */}
            {unitOptions.length > 8 && (
              <div className="border-b px-2 py-2">
                <input
                  autoFocus
                  value={buscaUnidade}
                  onChange={(e) => setBuscaUnidade(e.target.value)}
                  placeholder="Buscar loja por nome ou código..."
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none placeholder:text-muted-foreground focus:border-ring"
                />
              </div>
            )}
            <div className="max-h-64 overflow-y-auto py-1">
              {unitOptionsFiltradas.length === 0 && (
                <p className="px-3 py-3 text-center text-[11px] text-muted-foreground">
                  Nenhuma loja com “{buscaUnidade}”.
                </p>
              )}
              {unitOptionsFiltradas.map((u) => {
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
            platsFiltrando
              ? "border-primary bg-primary/10 text-primary"
              : "bg-card hover:bg-muted"
          }`}
        >
          {platsAtivas.length === 1 ? (
            <PlatformLogo platform={platsAtivas[0]} size="sm" />
          ) : (
            <Store className="size-3.5" />
          )}
          {!platsFiltrando
            ? "Todas plataformas"
            : platsAtivas.length === 1
              ? rotuloPlataforma(platsAtivas[0])
              : `${platsAtivas.length} plataformas`}
          <ChevronDown
            className={`size-3 transition-transform ${platOpen ? "rotate-180" : ""}`}
          />
        </button>
        {platOpen && (
          <div className="absolute right-0 z-50 mt-1 w-48 overflow-hidden rounded-md border bg-card shadow-lg">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Plataformas no cálculo
              </span>
              {platsFiltrando && (
                <button
                  type="button"
                  onClick={() => setPlataformas([])}
                  className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
                >
                  Todas
                </button>
              )}
            </div>
            {PLATFORMS.map((p) => {
              const checked = platsAtivas.includes(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePlataforma(p.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
                >
                  <div
                    className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                      checked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background"
                    }`}
                  >
                    {checked && <Check className="size-3" />}
                  </div>
                  <PlatformLogo platform={p.id} size="sm" />
                  {p.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Limpar tudo */}
      {(ativo || unitsCount > 0 || platsFiltrando) && (
        <button
          type="button"
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString())
            params.delete("ativo")
            params.delete("unidades")
            params.delete("plataformas")
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
