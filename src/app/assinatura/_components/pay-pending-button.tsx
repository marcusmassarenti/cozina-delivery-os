"use client"

import * as React from "react"
import { ArrowRight } from "lucide-react"

import { linkPagamentoPendente } from "../_actions"

export function PayPendingButton() {
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function ir() {
    setPending(true)
    setError(null)
    const res = await linkPagamentoPendente()
    if (res.ok && res.checkoutUrl) {
      window.location.href = res.checkoutUrl
    } else {
      setPending(false)
      setError(res.message ?? "Não deu pra abrir o pagamento.")
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={ir}
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_-12px_oklch(0.65_0.21_35/.65)] transition-all hover:-translate-y-0.5 disabled:opacity-70"
        style={{ background: "oklch(0.65 0.21 35)" }}
      >
        {pending ? "Abrindo pagamento..." : "Ir para o pagamento"}
        {!pending && <ArrowRight className="size-4" />}
      </button>
      {error && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  )
}
