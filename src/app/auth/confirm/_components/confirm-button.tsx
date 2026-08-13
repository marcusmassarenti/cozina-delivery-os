"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { confirmEmail, type ConfirmState } from "../_actions"

const initial: ConfirmState = { ok: false }

export function ConfirmButton({
  tokenHash,
  type,
  next,
  rotulo,
}: {
  tokenHash: string
  type: string
  next: string
  rotulo: string
}) {
  const [state, action] = useActionState(confirmEmail, initial)
  // Link expirado leva a lugares diferentes: quem perdeu a senha pede outra em
  // /esqueci-senha; quem nunca confirmou o cadastro reenvia em /cadastro.
  const ehSenha = type === "recovery" || type === "invite"

  return (
    <form action={action} className="mt-6">
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="next" value={next} />

      {state.message && !state.ok && (
        <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          {state.message}
          <div className="mt-1">
            <Link
              href={ehSenha ? "/esqueci-senha" : "/cadastro"}
              className="font-medium underline"
            >
              {ehSenha ? "Pedir um novo link" : "Criar conta / reenviar"}
            </Link>
          </div>
        </div>
      )}

      <Submit rotulo={rotulo} />
    </form>
  )
}

function Submit({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-brand inline-flex h-11 w-full items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold disabled:opacity-60"
    >
      {pending ? (
        "Validando..."
      ) : (
        <>
          {rotulo}
          <ArrowRight className="size-4" />
        </>
      )}
    </button>
  )
}
