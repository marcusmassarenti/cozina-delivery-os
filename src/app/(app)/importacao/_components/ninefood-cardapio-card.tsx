"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { CheckCircle2, RefreshCw, UtensilsCrossed, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"

import {
  runNinefood99Cardapio,
  type Ninefood99CardapioState,
} from "../_actions-ninefood"

const initial: Ninefood99CardapioState = { ok: false }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} variant="outline" className="gap-2">
      <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Sincronizando…" : "Sincronizar cardápio"}
    </Button>
  )
}

export function NinefoodCardapioCard() {
  const router = useRouter()
  const [state, formAction] = useActionState(runNinefood99Cardapio, initial)

  React.useEffect(() => {
    if (state.results) router.refresh()
  }, [state, router])

  const results = state.results ?? []
  const totalItens = results.reduce((s, r) => s + r.items, 0)
  const totalIndisp = results.reduce((s, r) => s + r.indisponiveis, 0)

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2.5">
        <div className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <UtensilsCrossed className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Sincronizar Cardápio — 99 Food (API)</h2>
          <p className="text-xs text-muted-foreground">
            Puxa o menu atual de cada loja vinculada (itens, preço,
            disponibilidade) — snapshot do momento.
          </p>
        </div>
        <form action={formAction}>
          <SubmitButton />
        </form>
      </div>

      {state.message ? (
        <p
          className={`mt-3 flex items-center gap-2 text-sm ${
            state.ok ? "text-emerald-600" : "text-red-600"
          }`}
        >
          {state.ok ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <XCircle className="size-4" />
          )}
          {state.message}
        </p>
      ) : null}

      {results.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-4 font-medium">Loja</th>
                <th className="py-1 pr-4 text-right font-medium">Itens</th>
                <th className="py-1 text-right font-medium">Indisponíveis</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.appShopId} className="border-t border-border/60">
                  <td className="py-1.5 pr-4">
                    {r.name ?? r.appShopId}
                    {r.error ? (
                      <span className="ml-2 text-xs text-red-600">{r.error}</span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">{r.items}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {r.indisponiveis > 0 ? (
                      <span className="font-medium text-amber-600">
                        {r.indisponiveis}
                      </span>
                    ) : (
                      r.indisponiveis
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold">
                <td className="py-1.5 pr-4">Total</td>
                <td className="py-1.5 pr-4 text-right tabular-nums">{totalItens}</td>
                <td className="py-1.5 text-right tabular-nums">{totalIndisp}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </div>
  )
}
