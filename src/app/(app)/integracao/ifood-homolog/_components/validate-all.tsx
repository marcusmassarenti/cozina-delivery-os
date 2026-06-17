"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Check, PlayCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { validateAll, type ValidateAllState } from "../_actions"

const initial: ValidateAllState = {}

/**
 * Painel "Validar Tudo" — o auditor clica 1 botão e vê os 6 endpoints
 * sequencialmente. Cada linha vira ✓ ou ✗ com status + duração.
 *
 * Apresenta com pré-preenchimento do merchantId quando há um na cache local
 * (passado por prop pelo Server Component pai).
 */
export function ValidateAll({ defaultMerchantId }: { defaultMerchantId?: string }) {
  const [state, formAction] = useActionState(validateAll, initial)
  const [merchantId, setMerchantId] = React.useState(defaultMerchantId ?? "")

  return (
    <div className="rounded-xl border-2 border-orange-200 bg-orange-50/40 p-5 dark:border-orange-900/40 dark:bg-orange-950/20">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-orange-500 p-2 text-white">
          <PlayCircle className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold tracking-tight">
            Validar Tudo · demonstração ponta-a-ponta
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Dispara os 6 endpoints da Merchant API em sequência (Sales,
            Reconciliation, Financial Events, Merchants, Settlements,
            Anticipations) e mostra o resultado consolidado. Use isso na
            reunião de homologação.
          </p>
        </div>
      </div>

      <form action={formAction} className="mt-4 flex items-end gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label className="text-xs font-medium">Merchant ID do iFood</Label>
          <Input
            name="merchantId"
            value={merchantId}
            onChange={(e) => setMerchantId(e.target.value)}
            placeholder="UUID da loja"
            className="font-mono text-xs"
            required
          />
        </div>
        <SubmitButton />
      </form>

      {state.error && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          <strong>Erro:</strong> {state.error}
        </div>
      )}

      {state.steps && state.steps.length > 0 && (
        <>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Resultado
              </p>
              <p
                className={`text-2xl font-bold tabular-nums ${
                  (state.okCount ?? 0) === (state.totalCount ?? 0)
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-rose-700 dark:text-rose-400"
                }`}
              >
                {state.okCount}/{state.totalCount} ✓
              </p>
            </div>
            <div className="text-right text-[10px] text-muted-foreground">
              <p>
                <strong className="text-foreground">Disparado em:</strong>{" "}
                {state.ranAt
                  ? new Date(state.ranAt).toLocaleString("pt-BR")
                  : "—"}
              </p>
              <p>
                <strong className="text-foreground">Merchant:</strong>{" "}
                <code className="font-mono">{state.merchantId}</code>
              </p>
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-lg border bg-card">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-center font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Etapa</th>
                  <th className="px-3 py-2 text-center font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">ms</th>
                  <th className="px-3 py-2 text-left font-medium">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {state.steps.map((s, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-flex size-5 items-center justify-center rounded-full ${
                          s.ok
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                            : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                        }`}
                      >
                        {s.ok ? <Check className="size-3" /> : <X className="size-3" />}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium">{s.label}</p>
                      <p className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                        {s.endpoint}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
                          s.status === 200
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
                            : s.status === 404
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                              : "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400"
                        }`}
                      >
                        {s.status ?? "ERR"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {s.durationMs ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {s.detail ?? s.error ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      disabled={pending}
      className="h-9 gap-1.5 bg-orange-500 px-4 text-white hover:bg-orange-600"
    >
      <PlayCircle className="size-4" />
      {pending ? "Validando..." : "Validar Tudo"}
    </Button>
  )
}
