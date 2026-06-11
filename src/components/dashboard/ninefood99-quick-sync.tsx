"use client"

import { useActionState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Check, RefreshCw } from "lucide-react"

import {
  runNinefood99SyncAll,
  type Ninefood99SyncAllState,
} from "@/app/(app)/importacao/_actions-ninefood"

const initial: Ninefood99SyncAllState = { ok: false }

/**
 * Botão discreto pra sincronizar o 99 (financeiro + cardápio) direto do
 * banner de cobertura do Dashboard. Usa o mês exibido no Dashboard.
 */
export function Ninefood99QuickSync({
  year,
  month,
}: {
  year: number
  month: number
}) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(
    runNinefood99SyncAll,
    initial,
  )

  useEffect(() => {
    if (state.financeiro || state.cardapio) router.refresh()
  }, [state, router])

  const done = state.ok && state.financeiro != null

  return (
    <form action={formAction} className="ml-auto">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />
      <button
        type="submit"
        disabled={pending}
        title="Sincronizar financeiro + cardápio do 99 Food agora"
        className="inline-flex items-center gap-1 rounded-full border border-current/25 px-2 py-0.5 text-[11px] font-medium opacity-70 transition hover:opacity-100 disabled:opacity-50"
      >
        {pending ? (
          <RefreshCw className="size-3 animate-spin" />
        ) : done ? (
          <Check className="size-3" />
        ) : (
          <RefreshCw className="size-3" />
        )}
        {pending ? "Sincronizando 99…" : done ? "99 sincronizado" : "Sincronizar 99"}
      </button>
    </form>
  )
}
