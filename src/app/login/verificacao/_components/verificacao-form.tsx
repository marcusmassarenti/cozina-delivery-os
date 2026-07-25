"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import {
  usarCodigoDeRecuperacao,
  verificarCodigo2FA,
  type DesafioState,
} from "../_actions"

const inicial: DesafioState = { ok: false }

export function VerificacaoForm() {
  const [state, action] = useActionState(verificarCodigo2FA, inicial)
  const [rec, recAction] = useActionState(usarCodigoDeRecuperacao, inicial)
  const [modoRecuperacao, setModo] = React.useState(false)
  const ref = React.useRef<HTMLInputElement>(null)

  // O campo é o único assunto da tela — já entra com o cursor nele.
  React.useEffect(() => {
    ref.current?.focus()
  }, [modoRecuperacao])

  // Quem perdeu o celular precisa de uma saída que não dependa do celular.
  if (modoRecuperacao) {
    return (
      <form action={recAction} className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Digite um dos <b className="text-foreground">códigos de recuperação</b>{" "}
          que você guardou quando ativou a verificação em duas etapas.
        </p>
        <div className="flex flex-col gap-2">
          <label
            htmlFor="rec"
            className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
          >
            Código de recuperação
          </label>
          <Input
            ref={ref}
            id="rec"
            name="code"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="XXXX-XXXX"
            maxLength={9}
            required
            className="h-12 text-center font-mono text-lg tracking-[0.2em] uppercase"
          />
          <p className="text-[11px] text-muted-foreground">
            Um dos 8 códigos que você guardou ao ativar a verificação. Cada um
            funciona uma vez.
          </p>
        </div>

        {rec.error && (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
            {rec.error}
          </p>
        )}

        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
          Ao usar um código de recuperação, a verificação em duas etapas será{" "}
          <b>desativada</b>. Você entra e cadastra o aparelho novo em seguida.
        </div>

        <Botao rotulo="Entrar com o código" />

        <button
          type="button"
          onClick={() => setModo(false)}
          className="text-center text-[11px] text-muted-foreground underline transition-colors hover:text-foreground"
        >
          Voltar e usar o aplicativo
        </button>
      </form>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Abra seu aplicativo autenticador e digite o código de 6 dígitos que
        aparece para o <b className="text-foreground">Delivery OS</b>.
      </p>
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

      <button
        type="button"
        onClick={() => setModo(true)}
        className="text-center text-[11px] text-muted-foreground underline transition-colors hover:text-foreground"
      >
        Perdi o acesso ao aplicativo — usar código de recuperação
      </button>
    </form>
  )
}

function Botao({ rotulo = "Entrar" }: { rotulo?: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="h-11 text-sm font-semibold">
      {pending ? "Verificando..." : rotulo}
      {!pending && <ArrowRight className="ml-1 size-4" />}
    </Button>
  )
}
