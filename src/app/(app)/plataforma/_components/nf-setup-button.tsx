"use client"

import * as React from "react"
import { FileText } from "lucide-react"

import { configurarNfAutomatica } from "../_actions"

/**
 * Liga a emissão automática de NF nas assinaturas que já existem.
 *
 * Assinatura nova já nasce configurada — este botão é pras antigas, e pra
 * reaplicar quando os dados fiscais mudam (código de serviço, alíquota).
 * Idempotente: pode clicar de novo sem estragar nada.
 */
export function NfSetupButton() {
  const [pending, setPending] = React.useState(false)
  const [res, setRes] = React.useState<{
    ok: boolean
    message?: string
  } | null>(null)

  async function onClick() {
    setPending(true)
    setRes(null)
    setRes(await configurarNfAutomatica())
    setPending(false)
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="size-4 text-muted-foreground" />
            Emissão automática de nota fiscal
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Assinatura nova já nasce emitindo sozinha. Use isto pras que já
            existiam, ou depois de mudar o código de serviço / a alíquota.
          </p>
        </div>
        <button
          type="button"
          onClick={onClick}
          disabled={pending}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60"
        >
          {pending ? "Configurando..." : "Aplicar nas assinaturas"}
        </button>
      </div>

      {res && (
        <div
          className={`mt-3 rounded-md border px-3 py-2 text-xs ${
            res.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400"
              : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400"
          }`}
        >
          {res.message}
        </div>
      )}
    </div>
  )
}
