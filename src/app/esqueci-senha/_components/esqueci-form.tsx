"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { ArrowRight, CheckCircle2, Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { requestReset, type ResetState } from "../_actions"

const initial: ResetState = { ok: false }

export function EsqueciForm() {
  const [state, formAction] = useActionState(requestReset, initial)

  if (state.sent) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-5 text-center dark:border-emerald-900/40 dark:bg-emerald-950/30">
        <CheckCircle2 className="size-6 text-emerald-600 dark:text-emerald-400" />
        <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
          Link enviado!
        </p>
        <p className="text-xs text-emerald-700 dark:text-emerald-400">
          Se houver uma conta com esse e-mail, você vai receber um link pra criar
          uma nova senha. Confira também a caixa de spam.
        </p>
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label
          htmlFor="email"
          className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          Email
        </Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="seu@email.com"
            autoComplete="email"
            required
            className="h-11 pl-9"
          />
        </div>
      </div>

      {state.message && !state.ok && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          {state.message}
        </div>
      )}

      <SubmitButton />
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="h-11 text-sm font-semibold">
      {pending ? "Enviando..." : "Enviar link de recuperação"}
      {!pending && <ArrowRight className="ml-1 size-4" />}
    </Button>
  )
}
