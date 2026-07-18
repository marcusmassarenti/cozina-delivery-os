"use client"

import * as React from "react"
import { ArrowRight, Sparkles } from "lucide-react"

import { iniciarUpgradeAi } from "../_actions"

/**
 * Confirma o upgrade pro plano AI. Chama a ação (que cria a proração no Asaas)
 * e leva o cliente pro checkout — o cartão já está lembrado, é só confirmar.
 * Se a proração for ínfima, o upgrade é liberado na hora (vai pro Nino).
 */
export function UpgradeButton() {
  const [pending, setPending] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)

  async function confirmar() {
    if (pending) return
    setPending(true)
    setErro(null)
    const r = await iniciarUpgradeAi()
    if (!r.ok) {
      setPending(false)
      setErro(r.message ?? "Não foi possível iniciar o upgrade.")
      return
    }
    if (r.imediato) {
      window.location.href = "/consultor-ia"
      return
    }
    if (r.checkoutUrl) {
      window.location.href = r.checkoutUrl
      return
    }
    setPending(false)
    setErro("Link de pagamento não gerado. Tente de novo.")
  }

  return (
    <div className="space-y-3">
      {erro && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          {erro}
        </div>
      )}
      <button
        type="button"
        onClick={confirmar}
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_12px_30px_-12px_oklch(0.65_0.21_35/.65)] transition-all hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
      >
        {pending ? (
          "Abrindo o pagamento…"
        ) : (
          <>
            <Sparkles className="size-4" />
            Confirmar e liberar o Nino AI
            <ArrowRight className="size-4" />
          </>
        )}
      </button>
      <p className="text-center text-xs text-muted-foreground">
        Seu cartão já está cadastrado — é só confirmar. Pagamento seguro via
        Asaas.
      </p>
    </div>
  )
}
