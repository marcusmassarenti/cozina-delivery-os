"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import Link from "next/link"
import { ArrowRight, MailCheck } from "lucide-react"

import { confirmEmail, type ConfirmState } from "../_actions"

const initial: ConfirmState = { ok: false }

export function ConfirmButton({
  tokenHash,
  type,
}: {
  tokenHash: string
  type: string
}) {
  const [state, action] = useActionState(confirmEmail, initial)

  return (
    <form action={action} className="mt-6">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />

      {state.message && !state.ok && (
        <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          {state.message}
          <div className="mt-1">
            <Link href="/cadastro" className="font-medium underline">
              Criar conta / reenviar
            </Link>
          </div>
        </div>
      )}

      <Submit />
    </form>
  )
}

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-brand inline-flex h-11 w-full items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold disabled:opacity-60"
    >
      {pending ? (
        "Confirmando..."
      ) : (
        <>
          Confirmar meu e-mail
          <ArrowRight className="size-4" />
        </>
      )}
    </button>
  )
}
