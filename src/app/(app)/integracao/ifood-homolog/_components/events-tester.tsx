"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Play } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { fmtBRL } from "@/lib/format"

import { testFinancialEvents, type TestEventsState } from "../_actions"

const initial: TestEventsState = { ok: false }

export function EventsTester() {
  const [state, formAction] = useActionState(testFinancialEvents, initial)
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
              placeholder="UUID da loja no iFood"
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
            /financial/v3.0/merchants/{`{merchantId}`}/financial-events?beginDate=…&endDate=…&page=N&size=100
          </code>{" "}
          → itera paginação (até <code>hasNextPage=false</code>) → calcula
          repasse líquido (<code>Σ amount.value</code> onde{" "}
          <code>hasTransferImpact=true</code>).
        </p>
      </form>

      {state.firstStatus != null && (
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Metric label="Status HTTP" value={`${state.firstStatus}`} ok={state.ok} />
          <Metric
            label="Páginas"
            value={`${state.pagesFetched ?? 0}`}
            ok={(state.pagesFetched ?? 0) > 0}
          />
          <Metric
            label="Total eventos"
            value={`${state.totalEvents ?? 0}`}
            ok={(state.totalEvents ?? 0) >= 0}
          />
          <Metric
            label="Duração total"
            value={`${state.durationMs ?? 0} ms`}
            ok={!!state.durationMs && state.durationMs < 30000}
          />
        </div>
      )}

      {state.countImpact && (
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 text-xs dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <p className="font-semibold text-emerald-900 dark:text-emerald-300">
            Métricas de homologação
          </p>
          <ul className="mt-1.5 space-y-0.5 text-emerald-800 dark:text-emerald-400/90">
            <li>
              Eventos com <strong>hasTransferImpact = true</strong>:{" "}
              <strong>{state.countImpact.true}</strong>
              {" · "}
              repasse líquido (Σ amount.value):{" "}
              <strong>{fmtBRL(state.netTransfer ?? 0)}</strong>
            </li>
            <li>
              Eventos com <strong>hasTransferImpact = false</strong> (apenas
              informativos): <strong>{state.countImpact.false}</strong>
            </li>
          </ul>
        </div>
      )}

      {state.error && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          <strong>Erro:</strong> {state.error}
        </div>
      )}

      {state.rawSample && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            Resposta crua da página 1
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted/40 p-3 text-[11px] leading-relaxed">
            {tryFormat(state.rawSample)}
          </pre>
        </details>
      )}

      {state.sample && state.sample.length > 0 && (
        <details className="mt-3" open>
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
            Primeiros {state.sample.length} eventos
          </summary>
          <div className="mt-2 max-h-96 overflow-auto rounded-md border bg-card">
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 bg-muted/40 text-[9px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Name</th>
                  <th className="px-2 py-1.5 text-left font-medium">Trigger</th>
                  <th className="px-2 py-1.5 text-right font-medium">Valor</th>
                  <th className="px-2 py-1.5 text-center font-medium">Impacto</th>
                  <th className="px-2 py-1.5 text-left font-medium">Repasse</th>
                  <th className="px-2 py-1.5 text-left font-medium">Order</th>
                </tr>
              </thead>
              <tbody>
                {state.sample.map((ev, i) => {
                  const v = Number(ev.amount?.value ?? 0)
                  return (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1 font-mono">{ev.name}</td>
                      <td className="px-2 py-1 text-muted-foreground">
                        {ev.trigger}
                      </td>
                      <td
                        className={`px-2 py-1 text-right tabular-nums ${
                          v < 0 ? "text-rose-600" : "text-emerald-700"
                        }`}
                      >
                        {fmtBRL(v)}
                      </td>
                      <td className="px-2 py-1 text-center">
                        {ev.hasTransferImpact ? "✓" : "—"}
                      </td>
                      <td className="px-2 py-1 text-muted-foreground">
                        {ev.settlement?.expectedDate ?? "—"}
                      </td>
                      <td className="px-2 py-1 font-mono text-muted-foreground">
                        {ev.reference?.id?.slice(0, 8) ?? "—"}
                      </td>
                    </tr>
                  )
                })}
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

/** Janela default: últimos 7 dias (até D-1). */
function defaultWindow(): { begin: string; end: string } {
  const end = new Date()
  end.setDate(end.getDate() - 1)
  const begin = new Date(end)
  begin.setDate(begin.getDate() - 6)
  return {
    begin: ymd(begin),
    end: ymd(end),
  }
}

function ymd(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function tryFormat(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}
