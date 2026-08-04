"use client"

import { useFormStatus } from "react-dom"
import { Eye } from "lucide-react"

import { entrarVerComoAction } from "../_actions"

/**
 * Entra na visão somente-leitura do cliente.
 *
 * É um form (POST) e não um link de propósito: entrar na visão de outro
 * cliente grava auditoria e muda o que a pessoa enxerga em todas as telas. Um
 * GET desses seria acionável por um link colado em qualquer lugar; um POST com
 * Server Action não é.
 */
export function VerComoBotao({
  holdingId,
  holdingName,
}: {
  holdingId: string
  holdingName: string
}) {
  return (
    <form action={entrarVerComoAction}>
      <input type="hidden" name="holdingId" value={holdingId} />
      <Botao nome={holdingName} />
    </form>
  )
}

function Botao({ nome }: { nome: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      title={`Abrir o sistema com os dados de ${nome}, sem poder alterar nada`}
      className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60"
    >
      <Eye className="size-4" />
      {pending ? "Abrindo…" : "Ver como este cliente"}
    </button>
  )
}
