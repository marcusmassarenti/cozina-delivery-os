"use client"

import * as React from "react"

import {
  PlatformLogo,
  rotuloPlataforma,
  type PlatformId,
} from "@/components/platform-logo"
import { TruncateTip } from "@/components/ui/truncate-tip"

const LABELS: Record<PlatformId, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
  cardapioweb: "Cardápio Web",
}

export type PlatformTabbedSlot = {
  platform: PlatformId
  /** Marca como sem dado — chip fica mais apagado */
  empty?: boolean
  /** Conteúdo renderizado quando essa plataforma está ativa */
  content: React.ReactNode
}

/**
 * Card de dashboard com switcher de plataforma no header.
 *
 * Renderiza um card padrão (border, bg-card, p-5) com:
 * - Esquerda: ícone opcional + título
 * - Direita: mini chips com logo de cada plataforma, clicáveis pra trocar
 *
 * Todos os contents são renderizados no servidor, só o ativo fica visível
 * (hidden nas demais). Troca de plataforma é instantânea no client.
 *
 * Default plataforma: 1ª com dado (`empty: false`); fallback 1ª da lista.
 *
 * IMPORTANTE: `icon` é React.ReactNode (não LucideIcon) porque este é Client
 * Component e Server Components não podem passar Function/Class via props.
 * Caller deve pre-renderizar: `icon={<AlertTriangle className="size-4 text-amber-600" />}`
 */
export function PlatformTabbedCard({
  title,
  icon,
  slots,
}: {
  title: React.ReactNode
  icon?: React.ReactNode
  slots: PlatformTabbedSlot[]
}) {
  const firstWithData = slots.find((s) => !s.empty)
  const [active, setActive] = React.useState<PlatformId>(
    firstWithData?.platform ?? slots[0]?.platform ?? "ifood",
  )

  if (slots.length === 0) return null

  return (
    // min-w-0: como item de grid/flex, o card nasce com min-width:auto e não
    // encolhe abaixo do próprio conteúdo — os títulos truncate/line-clamp
    // esticavam a coluna inteira e empurravam o dashboard pra fora da tela.
    <div className="min-w-0 rounded-xl border bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          {typeof title === "string" ? (
            <TruncateTip
              as="h3"
              text={title}
              className="truncate text-sm font-semibold"
            />
          ) : (
            <h3 className="truncate text-sm font-semibold">{title}</h3>
          )}
        </div>
        {slots.length === 1 ? (
          // Plataforma única — só mostra a logo (sem switcher)
          <PlatformLogo platform={slots[0].platform} size="sm" />
        ) : (
          <div data-plat-tabs className="flex shrink-0 items-center gap-0.5">
            {slots.map((s) => {
              const isActive = s.platform === active
              return (
                <button
                  key={s.platform}
                  type="button"
                  onClick={() => setActive(s.platform)}
                  className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                    isActive
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-transparent text-muted-foreground hover:bg-muted/50"
                  } ${s.empty ? "opacity-60" : ""}`}
                  aria-pressed={isActive}
                  title={LABELS[s.platform] + (s.empty ? " — sem dados" : "")}
                >
                  <PlatformLogo platform={s.platform} size="sm" />
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* data-plat-slot: no PDF do dashboard as abas escondidas voltam a
          aparecer, empilhadas e rotuladas. Sem isso o relatório sairia só
          com a plataforma que estava selecionada na tela. */}
      {slots.map((s) => (
        <div
          key={s.platform}
          data-plat-slot={s.platform}
          data-plat-label={rotuloPlataforma(s.platform)}
          // `data-plat-inativo` em vez do atributo `hidden`: o Tailwind v4
          // aplica `[hidden]{display:none !important}` em @layer base, e entre
          // dois !important o layer declarado ANTES vence — então nem o print
          // conseguia reexibir a aba. Com atributo próprio, as duas regras
          // (esconder na tela, mostrar no PDF) ficam do nosso lado.
          data-plat-inativo={s.platform !== active ? "" : undefined}
          aria-hidden={s.platform !== active}
        >
          {s.content}
        </div>
      ))}
    </div>
  )
}
