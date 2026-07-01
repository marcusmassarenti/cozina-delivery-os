"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"
import { fmtBRL } from "@/lib/format"
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
  mensalidade,
  jaTemCliente,
  defaultNome,
}: {
  mensalidade: number
  jaTemCliente: boolean
  defaultNome: string
}) {
  const [state, action] = useActionState<AssinarState, FormData>(assinar, {
    ok: false,
  })

  // Deu certo → manda o cliente pra página de pagamento do Asaas.
  React.useEffect(() => {
    if (state.ok && state.checkoutUrl) window.location.href = state.checkoutUrl
  }, [state])

  const inputCls =
    "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"

  return (
    <form action={action} className="mt-6 space-y-4 text-left">
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
            : `Assinar por ${fmtBRL(mensalidade)}/mês`
        }
      />

      <p className="text-center text-[11px] text-muted-foreground">
        Pagamento seguro via Asaas · Pix, boleto ou cartão · cancele quando
        quiser.
      </p>
    </form>
  )
}
