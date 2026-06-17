"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Play, Store } from "lucide-react"

import { Button } from "@/components/ui/button"

import { testListMerchants, type TestMerchantsState } from "../_actions"

const initial: TestMerchantsState = { ok: false }

export function MerchantsTester() {
  const [state, formAction] = useActionState(testListMerchants, initial)

  return (
    <div className="rounded-xl border bg-card p-5">
      <form action={formAction} className="flex items-end gap-3">
        <div className="flex-1">
          <p className="text-xs font-medium">Listar merchants liberados pro app</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            GET <code className="font-mono">/merchant/v1.0/merchants</code> →
            UPSERT na cache local <code>ifood_merchants</code>. Daqui a gente
            vincula cada merchant a uma unidade da rede.
          </p>
        </div>
        <SubmitButton />
      </form>

      {state.status != null && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Metric label="Status HTTP" value={`${state.status}`} ok={state.ok} />
          <Metric
            label="Duração"
            value={`${state.durationMs ?? 0} ms`}
            ok={!!state.durationMs && state.durationMs < 8000}
          />
          <Metric
            label="Merchants retornados"
            value={`${state.count ?? 0}`}
            ok={(state.count ?? 0) > 0}
          />
        </div>
      )}

      {state.error && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          <strong>Erro:</strong> {state.error}
        </div>
      )}

      {state.rawSample && (
        <details className="mt-3" open={!state.ok}>
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            Resposta crua
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted/40 p-3 text-[11px] leading-relaxed">
            {tryFormat(state.rawSample)}
          </pre>
        </details>
      )}

      {state.merchants && state.merchants.length > 0 && (
        <details className="mt-3" open>
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            <Store className="-mt-0.5 mr-1 inline size-3.5" />
            {state.merchants.length} merchant(s) retornado(s)
          </summary>
          <div className="mt-2 max-h-96 overflow-auto rounded-md border bg-card">
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 bg-muted/40 text-[9px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Nome</th>
                  <th className="px-2 py-1.5 text-left font-medium">CNPJ</th>
                  <th className="px-2 py-1.5 text-left font-medium">Cidade/UF</th>
                  <th className="px-2 py-1.5 text-left font-medium">ID</th>
                </tr>
              </thead>
              <tbody>
                {state.merchants.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="px-2 py-1 font-medium">{m.name ?? m.corporateName ?? "—"}</td>
                    <td className="px-2 py-1 font-mono text-muted-foreground">
                      {m.documents?.CNPJ?.value ?? "—"}
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">
                      {[m.address?.city, m.address?.state].filter(Boolean).join("/") || "—"}
                    </td>
                    <td className="px-2 py-1 font-mono text-muted-foreground">
                      {m.id.slice(0, 8)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
  ok,
}: {
  label: string
  value: string
  ok: boolean
}) {
  return (
    <div
      className={`rounded-md border p-2.5 ${
        ok
          ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20"
          : "border-rose-200 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/20"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`text-sm font-bold tabular-nums ${
          ok
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-rose-700 dark:text-rose-400"
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="gap-1.5">
      <Play className="size-3.5" />
      {pending ? "Listando..." : "Listar merchants"}
    </Button>
  )
}

function tryFormat(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}
