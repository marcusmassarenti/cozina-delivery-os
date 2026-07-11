"use client"

import * as React from "react"
import { Sparkles, Lock } from "lucide-react"

import { saveIaHabilitada } from "../_actions"

export function IaToggle({
  inicial,
  isAi,
}: {
  inicial: boolean
  isAi: boolean
}) {
  const [on, setOn] = React.useState(inicial)
  const [salvando, setSalvando] = React.useState(false)

  async function alternar() {
    if (!isAi || salvando) return
    const novo = !on
    setOn(novo)
    setSalvando(true)
    const r = await saveIaHabilitada(novo)
    if (!r.ok) setOn(!novo) // reverte se falhar
    setSalvando(false)
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-sm font-semibold">Plano de ação por IA</h3>
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              DeliveryOS AI
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            A IA lê os dados da loja e sugere um plano de ação na aba
            Diagnóstico. Gerado sob demanda e com limite diário.
          </p>
        </div>
        {isAi ? (
          <button
            type="button"
            role="switch"
            aria-checked={on}
            onClick={alternar}
            disabled={salvando}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
              on ? "bg-primary" : "bg-muted-foreground/30"
            }`}
          >
            <span
              className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${
                on ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        ) : (
          <span className="flex shrink-0 items-center gap-1 rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
            <Lock className="size-3.5" />
            Plano DeliveryOS AI
          </span>
        )}
      </div>
    </div>
  )
}
