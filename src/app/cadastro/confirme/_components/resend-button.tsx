"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { RefreshCw } from "lucide-react"

import { resendConfirmation } from "../../_actions"

const initial = { ok: false as boolean, message: undefined as string | undefined }

export function ResendButton({ email }: { email: string }) {
  const [state, action] = useActionState(resendConfirmation, initial)
  return (
    <form action={action} className="mt-5">
      <input type="hidden" name="email" value={email} />
      {state.message && (
        <p
          className={`mb-2 text-xs ${
            state.ok
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          }`}
        >
          {state.message}
        </p>
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
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
    >
      <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Reenviando..." : "Não chegou? Reenviar e-mail"}
    </button>
  )
}
