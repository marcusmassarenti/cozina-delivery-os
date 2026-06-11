"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { CheckCircle2, RefreshCw, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { PlatformLogo } from "@/components/platform-logo"
import { fmtBRL } from "@/lib/format"

import {
  runNinefood99SyncAll,
  type Ninefood99SyncAllState,
} from "../_actions-ninefood"

const initial: Ninefood99SyncAllState = { ok: false }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="gap-2">
      <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Sincronizando…" : "Sincronizar tudo"}
    </Button>
  )
}

type Row = {
  name: string | null
  liquido: number
  count: number
  items: number | null
  error?: string
}

export function NinefoodSyncCard({
  defaultCompetencia,
}: {
  defaultCompetencia: string
}) {
  const router = useRouter()
  const [state, formAction] = useActionState(runNinefood99SyncAll, initial)

  React.useEffect(() => {
    if (state.financeiro || state.cardapio) router.refresh()
  }, [state, router])

  // Junta financeiro + cardápio por loja
  const byShop = new Map<string, Row>()
  for (const r of state.financeiro ?? []) {
    byShop.set(r.appShopId, {
      name: r.name,
      liquido: r.liquido,
      count: r.count,
      items: null,
      error: r.error,
    })
  }
  for (const r of state.cardapio ?? []) {
    const e = byShop.get(r.appShopId) ?? {
      name: r.name,
      liquido: 0,
      count: 0,
      items: null,
    }
    e.items = r.items
    if (r.error && !e.error) e.error = r.error
    byShop.set(r.appShopId, e)
  }
  const rows = [...byShop.values()]
  const totLiq = rows.reduce((s, r) => s + r.liquido, 0)
  const totLanc = rows.reduce((s, r) => s + r.count, 0)
  const totItems = rows.reduce((s, r) => s + (r.items ?? 0), 0)
  const hasResult = state.financeiro != null || state.cardapio != null

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2.5">
        <PlatformLogo platform="99food" size="md" />
        <div>
          <h2 className="text-sm font-semibold">Sincronizar 99 Food (API)</h2>
          <p className="text-xs text-muted-foreground">
            Financeiro (repasse) + Cardápio das lojas vinculadas, num clique
            só. Idempotente: pode rodar quantas vezes quiser.
          </p>
        </div>
      </div>

      <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Competência (financeiro)
          <input
            type="month"
            name="competencia"
            defaultValue={defaultCompetencia}
            className="rounded-lg border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
        <SubmitButton />
      </form>

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

      {hasResult && rows.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-4 font-medium">Loja</th>
                <th className="py-1 pr-4 text-right font-medium">Lançamentos</th>
                <th className="py-1 pr-4 text-right font-medium">
                  Líquido repasse
                </th>
                <th className="py-1 text-right font-medium">Itens cardápio</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border/60">
                  <td className="py-1.5 pr-4">
                    {r.name ?? "—"}
                    {r.error ? (
                      <span className="ml-2 text-xs text-red-600">
                        {r.error}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">
                    {r.count}
                  </td>
                  <td className="py-1.5 pr-4 text-right font-medium tabular-nums">
                    {fmtBRL(r.liquido)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {r.items ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold">
                <td className="py-1.5 pr-4">Total</td>
                <td className="py-1.5 pr-4 text-right tabular-nums">
                  {totLanc}
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums">
                  {fmtBRL(totLiq)}
                </td>
                <td className="py-1.5 text-right tabular-nums">{totItems}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </div>
  )
}
