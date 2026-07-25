"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { verificarCodigo2FA, type DesafioState } from "../_actions"

const inicial: DesafioState = { ok: false }

export function VerificacaoForm() {
  const [state, action] = useActionState(verificarCodigo2FA, inicial)
  const ref = React.useRef<HTMLInputElement>(null)

  // O campo é o único assunto da tela — já entra com o cursor nele.
  React.useEffect(() => {
    ref.current?.focus()
  }, [])

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label
          htmlFor="code"
          className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          Código de verificação
        </label>
        <Input
          ref={ref}
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          maxLength={6}
          required
          className="h-12 text-center font-mono text-lg tracking-[0.4em]"
        />
      </div>

      {state.error && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          {state.error}
        </p>
      )}

      <Botao />
    </form>
  )
}

function Botao() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="h-11 text-sm font-semibold">
      {pending ? "Verificando..." : "Entrar"}
      {!pending && <ArrowRight className="ml-1 size-4" />}
    </Button>
  )
}
