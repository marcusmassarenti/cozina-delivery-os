"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Check, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { fmtBRL } from "@/lib/format"
import type { PlanId, PlanoOption } from "@/lib/data/assinatura"
import { assinar, type AssinarState } from "../_actions"

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Gerando pagamento..." : label}
    </Button>
  )
}

export function SubscribeForm({
  planos,
  precoCustom,
  customMensalidade,
  activeUnits,
  jaTemCliente,
  defaultNome,
  defaultPlan,
}: {
  planos: PlanoOption[]
  precoCustom: boolean
  customMensalidade: number
  activeUnits: number
  jaTemCliente: boolean
  defaultNome: string
  defaultPlan: PlanId
}) {
  const [state, action] = useActionState<AssinarState, FormData>(assinar, {
    ok: false,
  })
  const [plan, setPlan] = React.useState<PlanId>(defaultPlan)

  React.useEffect(() => {
    if (state.ok && state.checkoutUrl) window.location.href = state.checkoutUrl
  }, [state])

  const inputCls =
    "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"

  const selected = planos.find((p) => p.id === plan)
  const total = precoCustom ? customMensalidade : (selected?.total ?? 0)

  return (
    <form action={action} className="mt-6 space-y-4 text-left">
      {!precoCustom && (
        <>
          <input type="hidden" name="plano" value={plan} />
          <div className="space-y-2">
            {planos.map((p) => {
              const active = p.id === plan
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setPlan(p.id)}
                  className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-colors ${
                    active
                      ? "border-[var(--brand,theme(colors.violet.500))] ring-2 ring-violet-500/30"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <span>
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      {p.id === "pro" && (
                        <Zap className="size-3.5 text-amber-500" />
                      )}
                      {p.label}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {p.desc} · {fmtBRL(p.perUnit)}/loja
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-right">
                      <span className="block text-sm font-semibold tabular-nums">
                        {fmtBRL(p.total)}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        /mês
                      </span>
                    </span>
                    <span
                      className={`flex size-4 items-center justify-center rounded-full border ${
                        active
                          ? "border-violet-500 bg-violet-500 text-white"
                          : "border-muted-foreground/40"
                      }`}
                    >
                      {active && <Check className="size-3" strokeWidth={3} />}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {activeUnits} loja{activeUnits === 1 ? "" : "s"} ativa
            {activeUnits === 1 ? "" : "s"} · o valor acompanha o nº de lojas.
          </p>
        </>
      )}

      {!jaTemCliente && (
        <>
          <div>
            <label htmlFor="nome" className="text-xs font-medium">
              Nome do responsável ou razão social
            </label>
            <input
              id="nome"
              name="nome"
              defaultValue={defaultNome}
              required
              minLength={2}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="cpfCnpj" className="text-xs font-medium">
              CPF ou CNPJ
            </label>
            <input
              id="cpfCnpj"
              name="cpfCnpj"
              required
              inputMode="numeric"
              placeholder="Só os números"
              className={inputCls}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Necessário pra emitir a cobrança (Pix/boleto/nota).
            </p>
          </div>
        </>
      )}

      {state.message && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          {state.message}
        </div>
      )}

      <SubmitBtn
        label={
          jaTemCliente
            ? "Ir para o pagamento"
            : `Assinar por ${fmtBRL(total)}/mês`
        }
      />

      <p className="text-center text-[11px] text-muted-foreground">
        Pagamento seguro via Asaas · Pix, boleto ou cartão · cancele quando
        quiser.
      </p>
    </form>
  )
}
