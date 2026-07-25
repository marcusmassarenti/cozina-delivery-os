"use client"

import * as React from "react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"

const LABELS: Record<PlatformId, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
  cardapioweb: "Cardápio Web",
}

export type PlatformSlot = {
  /** Marca como "sem dados" (chip aparece com aviso) */
  empty?: boolean
  /** Texto curto opcional pra mostrar abaixo do chip (ex: "21 dias") */
  hint?: string
  /** O conteúdo renderizado quando essa plataforma está ativa */
  content: React.ReactNode
}

/**
 * Chip de plataforma reutilizável.
 *
 * Renderiza todos os slots no servidor (cada um pode ter Suspense próprio),
 * mas só mostra o ativo. Trocar de chip é instantâneo no client (sem refetch).
 *
 * Plataforma default: a 1ª com dados, senão a 1ª da lista.
 */
export function PlatformSwitcher({
  slots,
  className,
}: {
  /** Ordem de exibição dos chips. Plataformas ausentes ficam fora. */
  slots: Array<{ platform: PlatformId } & PlatformSlot>
  className?: string
}) {
  // Default: primeira com dado (empty != true), senão primeira da lista
  const firstWithData = slots.find((s) => !s.empty)
  const [active, setActive] = React.useState<PlatformId>(
    firstWithData?.platform ?? slots[0]?.platform ?? "ifood",
  )

  if (slots.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground">
        Nenhuma plataforma ativada nesta unidade.
      </div>
    )
  }

  const activeSlot = slots.find((s) => s.platform === active) ?? slots[0]

  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {slots.map((s) => {
          const isActive = s.platform === active
          return (
            <button
              key={s.platform}
              type="button"
              onClick={() => setActive(s.platform)}
              className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/50"
              } ${s.empty ? "opacity-60" : ""}`}
              aria-pressed={isActive}
            >
              <PlatformLogo platform={s.platform} size="sm" />
              <span>{LABELS[s.platform]}</span>
              {s.hint && (
                <span
                  className={`text-[10px] ${
                    isActive ? "text-muted-foreground" : "opacity-70"
                  }`}
                >
                  · {s.hint}
                </span>
              )}
              {s.empty && (
                <span className="ml-0.5 inline-flex items-center rounded-full bg-muted-foreground/15 px-1 py-0 text-[9px] uppercase tracking-wider text-muted-foreground">
                  sem dados
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Renderiza TODOS os slots (cada um com Suspense), mas só o ativo
          fica visível. Trocar de chip é instantâneo. */}
      {slots.map((s) => (
        <div
          key={s.platform}
          hidden={s.platform !== active}
          aria-hidden={s.platform !== active}
        >
          {s.content}
        </div>
      ))}
      {/* Defensive: caso slots tenha conteúdo mas active não bate */}
      {!activeSlot && null}
    </div>
  )
}
