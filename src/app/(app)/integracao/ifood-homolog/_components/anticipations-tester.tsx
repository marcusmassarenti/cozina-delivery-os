"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Play } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { fmtBRL } from "@/lib/format"

import { testAnticipations, type TestAnticipationsState } from "../_actions"

const initial: TestAnticipationsState = { ok: false }

export function AnticipationsTester() {
  const [state, formAction] = useActionState(testAnticipations, initial)
  const def = defaultWindow()
  const [merchantId, setMerchantId] = React.useState("")
  const [beginDate, setBeginDate] = React.useState(def.begin)
  const [endDate, setEndDate] = React.useState(def.end)

  return (
    <div className="rounded-xl border bg-card p-5">
      <form action={formAction} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Merchant ID</Label>
            <Input
              name="merchantId"
              value={merchantId}
              onChange={(e) => setMerchantId(e.target.value)}
              placeholder="UUID da loja"
              className="font-mono text-xs"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Begin Date</Label>
            <Input
              name="beginDate"
              type="date"
              value={beginDate}
              onChange={(e) => setBeginDate(e.target.value)}
              className="font-mono text-xs"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">End Date</Label>
            <Input
              name="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="font-mono text-xs"
              required
            />
          </div>
          <div className="flex items-end">
            <SubmitButton />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          GET{" "}
          <code className="font-mono">
            /financial/v3.0/merchants/{`{id}`}/anticipations?beginCalculationDate=…&endCalculationDate=…
          </code>{" "}
          → antecipações (planos D+1 e D+7) com taxa, valor original e
          antecipado.
        </p>
      </form>

      {state.status != null && (
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Metric label="Status HTTP" value={`${state.status}`} ok={state.ok} />
          <Metric
            label="Balance"
            value={fmtBRL(state.balance ?? 0)}
            ok={(state.balance ?? 0) >= 0}
          />
          <Metric
            label="Antecipações"
            value={`${state.metrics?.countItems ?? 0}`}
            ok={(state.metrics?.countItems ?? 0) > 0}
          />
          <Metric
            label="Duração"
            value={`${state.durationMs ?? 0} ms`}
            ok={!!state.durationMs && state.durationMs < 8000}
          />
        </div>
      )}

      {state.metrics && (state.metrics.countItems ?? 0) > 0 && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-xs dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <p className="font-semibold text-emerald-900 dark:text-emerald-300">
            Totais do período
          </p>
          <ul className="mt-1 space-y-0.5 text-emerald-800 dark:text-emerald-400/90">
            <li>Valor original (sem antecipação): <strong>{fmtBRL(state.metrics.sumOriginal)}</strong></li>
            <li>Taxa cobrada: <strong>{fmtBRL(state.metrics.sumFee)}</strong></li>
            <li>Antecipado (líquido recebido): <strong>{fmtBRL(state.metrics.sumAnticipated)}</strong></li>
          </ul>
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

      {state.items && state.items.length > 0 && (
        <details className="mt-3" open>
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            Primeiras {state.items.length} antecipações
          </summary>
          <div className="mt-2 max-h-96 overflow-auto rounded-md border bg-card">
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 bg-muted/40 text-[9px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Tipo</th>
                  <th className="px-2 py-1.5 text-right font-medium">Original</th>
                  <th className="px-2 py-1.5 text-right font-medium">Taxa</th>
                  <th className="px-2 py-1.5 text-right font-medium">Antecipado</th>
                  <th className="px-2 py-1.5 text-left font-medium">Status</th>
                  <th className="px-2 py-1.5 text-left font-medium">Data orig.</th>
                  <th className="px-2 py-1.5 text-left font-medium">Data antec.</th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((it, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-2 py-1 font-mono text-muted-foreground">
                      {(it.type ?? "—").replace("REPASSE_ANTECIPADO_", "")}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {fmtBRL(Number(it.originalPaymentAmount ?? 0))}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-rose-600">
                      {fmtBRL(Number(it.feeAmount ?? 0))}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-emerald-700">
                      {fmtBRL(Number(it.anticipatedPaymentAmount ?? 0))}
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">
                      {it.status ?? "—"}
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">
                      {it.originalPaymentDate ?? "—"}
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">
                      {it.anticipatedPaymentDate ?? "—"}
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
      {pending ? "Buscando..." : "Disparar"}
    </Button>
  )
}

function defaultWindow(): { begin: string; end: string } {
  const end = new Date()
  end.setDate(end.getDate() - 1)
  const begin = new Date(end)
  begin.setDate(begin.getDate() - 13)
  return { begin: ymd(begin), end: ymd(end) }
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function tryFormat(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}
