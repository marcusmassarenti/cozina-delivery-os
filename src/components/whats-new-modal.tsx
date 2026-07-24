"use client"

import { useState } from "react"
import Link from "next/link"
import { Bug, Sparkles, Wrench, X, type LucideIcon } from "lucide-react"

import { CHANGELOG, anuncioPendente, type ChangeKind } from "@/lib/changelog"
import { markVersionSeen } from "@/components/whats-new-actions"

const KIND_ICON: Record<ChangeKind, LucideIcon> = {
  novo: Sparkles,
  melhoria: Wrench,
  correcao: Bug,
}
const KIND_CLS: Record<ChangeKind, string> = {
  novo: "text-primary",
  melhoria: "text-sky-600",
  correcao: "text-rose-600",
}

/**
 * Aviso de "Novidades" ao entrar: mostra a última versão lançada quando o
 * usuário ainda não a viu.
 *
 * O "já vi" é do USUÁRIO, no banco (profiles.last_seen_version → chega aqui
 * como `lastSeenVersion`). Antes era localStorage, que é por navegador: o
 * aviso voltava em outro device/navegador e sempre que o browser limpava os
 * dados do site. Como o valor já vem do servidor no render, não precisa de
 * effect nem de storage local.
 *
 * Só aparece pra quem já passou do onboarding — usuário novo vê o tour antes.
 */
export function WhatsNewModal({
  onboarded,
  lastSeenVersion,
}: {
  onboarded: boolean
  lastSeenVersion: string | null
}) {
  const [dismissed, setDismissed] = useState(false)
  // Só a versão que traz mudança ESTRUTURAL interrompe (ver anuncioPendente).
  // Versão só de correção entra na tela de Novidades, mas não abre pop-up.
  const latest = anuncioPendente(lastSeenVersion)

  if (!latest || !onboarded || dismissed) return null

  function dismiss() {
    setDismissed(true) // some na hora
    // Marca a versão MAIS NOVA como vista, não a anunciada: as correções que
    // vieram depois dela também já estão dadas por lidas.
    void markVersionSeen(CHANGELOG[0]!.version)
  }

  const items = latest.areas.flatMap((a) => a.items).slice(0, 5)

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4"
      onClick={dismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border bg-card shadow-2xl"
      >
        <div className="relative bg-primary/10 px-5 py-4">
          <button
            type="button"
            onClick={dismiss}
            aria-label="Fechar"
            className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
          >
            <X className="size-4" />
          </button>
          <div className="flex items-center gap-3 pr-6">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Sparkles className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Novidade no sistema!</span>
                <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                  v{latest.version}
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">{latest.title}</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4">
          {latest.summary && (
            <p className="text-sm leading-relaxed text-muted-foreground">{latest.summary}</p>
          )}
          <ul className="mt-3 space-y-2">
            {items.map((item, i) => {
              const Icon = KIND_ICON[item.kind]
              return (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Icon className={`mt-0.5 size-4 shrink-0 ${KIND_CLS[item.kind]}`} />
                  <span>{item.title}</span>
                </li>
              )
            })}
          </ul>
          <div className="mt-5 flex items-center justify-end gap-2">
            <Link
              href="/novidades"
              onClick={dismiss}
              className="rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              Ver todas
            </Link>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Entendi
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
