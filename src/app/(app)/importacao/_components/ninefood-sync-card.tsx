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
  runNinefood99Sync,
  type Ninefood99SyncState,
} from "../_actions-ninefood"

const initial: Ninefood99SyncState = { ok: false }

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="gap-2">
      <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Sincronizando…" : "Sincronizar agora"}
    </Button>
  )
}

export function NinefoodSyncCard({
  defaultCompetencia,
}: {
  defaultCompetencia: string
}) {
  const router = useRouter()
  const [state, formAction] = useActionState(runNinefood99Sync, initial)

  React.useEffect(() => {
    if (state.results) router.refresh()
  }, [state, router])

  const results = state.results ?? []
  const total = results.reduce(
    (acc, r) => ({
      count: acc.count + r.count,
      bruto: acc.bruto + r.bruto,
      liquido: acc.liquido + r.liquido,
    }),
    { count: 0, bruto: 0, liquido: 0 },
  )

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2.5">
        <PlatformLogo platform="99food" size="md" />
        <div>
          <h2 className="text-sm font-semibold">
            Sincronizar Financeiro — 99 Food (API)
          </h2>
          <p className="text-xs text-muted-foreground">
            Puxa o extrato (repasse) das lojas vinculadas direto da API — sem
            planilha. Idempotente: pode rodar quantas vezes quiser.
          </p>
        </div>
      </div>

      <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Competência
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

      {results.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 pr-4 font-medium">Loja</th>
                <th className="py-1 pr-4 text-right font-medium">Lançamentos</th>
                <th className="py-1 pr-4 text-right font-medium">Valor pedidos</th>
                <th className="py-1 text-right font-medium">Líquido repasse</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.appShopId} className="border-t border-border/60">
                  <td className="py-1.5 pr-4">
                    {r.name ?? r.appShopId}
                    {r.unitCreated ? (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        unidade criada
                      </span>
                    ) : null}
                    {r.error ? (
                      <span className="ml-2 text-xs text-red-600">
                        {r.error}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">
                    {r.count}
                  </td>
                  <td className="py-1.5 pr-4 text-right tabular-nums">
                    {fmtBRL(r.bruto)}
                  </td>
                  <td className="py-1.5 text-right font-medium tabular-nums">
                    {fmtBRL(r.liquido)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold">
                <td className="py-1.5 pr-4">Total</td>
                <td className="py-1.5 pr-4 text-right tabular-nums">
                  {total.count}
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums">
                  {fmtBRL(total.bruto)}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {fmtBRL(total.liquido)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </div>
  )
}
