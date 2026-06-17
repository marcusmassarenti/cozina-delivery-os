"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Play } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { testSales, type TestSalesState } from "../_actions"

const initial: TestSalesState = { ok: false }

export function SalesTester() {
  const [state, formAction] = useActionState(testSales, initial)
  const [orderId, setOrderId] = React.useState("")

  return (
    <div className="rounded-xl border bg-card p-5">
      <form action={formAction} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">Order ID</Label>
          <div className="flex gap-2">
            <Input
              name="orderId"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="UUID do pedido — em sandbox, pegue um da doc do iFood"
              className="font-mono text-xs"
              required
            />
            <SubmitButton />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Pra sandbox, o iFood disponibiliza order ids de teste na documentação.
            Chamada manda <code className="font-mono">x-request-homologation: true</code>{" "}
            quando a env <code className="font-mono">IFOOD_HOMOLOGATION</code> está habilitada.
          </p>
        </div>
      </form>

      {state.status != null && (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Metric label="Status HTTP" value={`${state.status}`} ok={state.ok} />
          <Metric
            label="Duração"
            value={`${state.durationMs ?? 0} ms`}
            ok={!!state.durationMs && state.durationMs < 5000}
          />
          <Metric
            label="Retries"
            value={`${state.retries ?? 0}`}
            ok={(state.retries ?? 0) === 0}
          />
        </div>
      )}

      {state.error && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          <strong>Erro:</strong> {state.error}
        </div>
      )}

      {state.raw && (
        <details className="mt-3" open={!state.ok}>
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            Resposta crua ({state.raw.length} chars)
          </summary>
          <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-muted/40 p-3 text-[11px] leading-relaxed">
            {tryFormat(state.raw)}
          </pre>
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
      {pending ? "Chamando..." : "Disparar"}
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
