"use client"

import * as React from "react"
import { useSearchParams, usePathname } from "next/navigation"
import { useNavigate } from "@/components/shared/navigation-progress"
import { Star } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type UnitOption = {
  code: string
  name: string
  /** Plataformas que essa unidade tem ativadas — controla quais chips aparecem */
  platforms: PlatformId[]
}

const PLATFORM_LABEL: Record<PlatformId, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
}

/**
 * Filtros da tela /avaliacoes.
 * Sincroniza os search params `unidade` (code) e `plataforma`. O período
 * é gerenciado pelo PeriodSelector separado.
 *
 * Mostra os chips de plataforma só dentre as ativadas na unidade selecionada.
 */
export function AvaliacoesFilters({
  unitOptions,
  unidadeSelected,
  plataformaSelected,
}: {
  unitOptions: UnitOption[]
  unidadeSelected: string | null
  plataformaSelected: PlatformId | null
}) {
  const navigate = useNavigate()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function pushWith(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key)
      else params.set(key, value)
    }
    navigate(`${pathname}?${params.toString()}`)
  }

  function onUnidadeChange(code: string | null) {
    // Quando troca de unidade, valida se a plataforma escolhida ainda existe
    // nela; senão, limpa pra cair no default da nova unidade.
    const u = unitOptions.find((o) => o.code === code)
    const platStillValid =
      plataformaSelected && u?.platforms.includes(plataformaSelected)
    pushWith({
      unidade: code,
      plataforma: platStillValid ? plataformaSelected : null,
    })
  }

  function setPlataforma(p: PlatformId | null) {
    pushWith({ plataforma: p })
  }

  // Plataformas com avaliação (filtro da visão de rede)
  const NETWORK_PLATFORMS: PlatformId[] = ["ifood", "99food", "keeta"]

  // Filtro de estrelas (notas) — filtra a lista de comentários
  const notasSelected = (searchParams.get("notas") ?? "")
    .split(",")
    .map((s) => Number(s))
    .filter((n) => n >= 1 && n <= 5)
  function toggleNota(n: number) {
    const set = new Set(notasSelected)
    if (set.has(n)) set.delete(n)
    else set.add(n)
    const arr = [...set].sort((a, b) => a - b)
    pushWith({ notas: arr.length ? arr.join(",") : null })
  }

  const currentUnit =
    unitOptions.find((u) => u.code === unidadeSelected) ?? null
  const availablePlatforms = currentUnit?.platforms ?? []

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Unidade */}
      <div className="min-w-[220px]">
        <Select
          value={unidadeSelected ?? ""}
          onValueChange={(v) => onUnidadeChange(v ?? null)}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Escolha uma unidade…" />
          </SelectTrigger>
          <SelectContent>
            {unitOptions.map((u) => (
              <SelectItem key={u.code} value={u.code}>
                <span className="font-mono text-[10px] text-muted-foreground">
                  #{u.code}
                </span>{" "}
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Plataforma — só aparece quando há unidade escolhida e com plataformas */}
      {currentUnit && availablePlatforms.length > 0 && (
        <div className="flex items-center gap-1.5 rounded-md border bg-card p-1">
          {availablePlatforms.map((p) => {
            const isActive =
              plataformaSelected === p ||
              // Default: 1ª plataforma fica ativa quando nada está selecionado
              (!plataformaSelected && p === availablePlatforms[0])
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPlataforma(p)}
                aria-pressed={isActive}
                className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <PlatformLogo platform={p} size="sm" />
                {PLATFORM_LABEL[p]}
              </button>
            )
          })}
        </div>
      )}

      {/* Filtro de plataforma da rede — aparece quando nenhuma unidade
          está selecionada. "Todas" soma as 3; ou escolhe uma. */}
      {!currentUnit && (
        <div className="flex items-center gap-1.5 rounded-md border bg-card p-1">
          <button
            type="button"
            onClick={() => setPlataforma(null)}
            aria-pressed={!plataformaSelected}
            className={`inline-flex items-center rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              !plataformaSelected
                ? "bg-primary/10 text-foreground"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
          >
            Todas
          </button>
          {NETWORK_PLATFORMS.map((p) => {
            const isActive = plataformaSelected === p
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPlataforma(p)}
                aria-pressed={isActive}
                className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <PlatformLogo platform={p} size="sm" />
                {PLATFORM_LABEL[p]}
              </button>
            )
          })}
        </div>
      )}

      {/* Filtro de estrelas — filtra a lista de comentários (todas as telas) */}
      <div className="flex items-center gap-1 rounded-md border bg-card p-1">
        <span className="px-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Notas
        </span>
        {[1, 2, 3, 4, 5].map((n) => {
          const active = notasSelected.includes(n)
          return (
            <button
              key={n}
              type="button"
              onClick={() => toggleNota(n)}
              aria-pressed={active}
              title={`Comentários com nota ${n}`}
              className={`inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-xs font-medium tabular-nums transition-colors ${
                active
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {n}
              <Star
                className={`size-3 ${
                  active
                    ? "fill-amber-400 stroke-amber-400"
                    : "stroke-muted-foreground/50"
                }`}
              />
            </button>
          )
        })}
        {notasSelected.length > 0 && (
          <button
            type="button"
            onClick={() => pushWith({ notas: null })}
            className="ml-0.5 rounded px-1.5 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted/50"
          >
            limpar
          </button>
        )}
      </div>
    </div>
  )
}
