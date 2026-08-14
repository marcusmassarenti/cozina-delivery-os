"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"

import { novaProposta } from "../_actions"

/**
 * "Nova proposta": escolhe o cliente e pronto.
 *
 * Não há formulário aqui de propósito — tudo que se pediria já está no
 * cadastro. Pedir de novo seria o mesmo trabalho manual que esta tela existe
 * pra eliminar. O que precisa de decisão humana (desconto, setup, validade) é
 * editado depois, no documento, com o preço já na frente.
 */
export function NovaPropostaBotao({
  clientes,
}: {
  clientes: { id: string; nome: string }[]
}) {
  const router = useRouter()
  const [aberto, setAberto] = React.useState(false)
  const [holdingId, setHoldingId] = React.useState("")
  const [erro, setErro] = React.useState<string | null>(null)
  const [pendente, startTransition] = React.useTransition()

  if (!aberto)
    return (
      <Button size="sm" onClick={() => setAberto(true)}>
        <Plus className="size-4" />
        Nova proposta
      </Button>
    )

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
      <select
        value={holdingId}
        onChange={(e) => setHoldingId(e.target.value)}
        className="min-w-[220px] rounded-md border bg-background px-2 py-1.5 text-xs"
      >
        <option value="">Para qual cliente?</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        disabled={!holdingId || pendente}
        onClick={() => {
          setErro(null)
          startTransition(async () => {
            const fd = new FormData()
            fd.set("holding_id", holdingId)
            const r = await novaProposta({ ok: false }, fd)
            if (r.ok && r.id) router.push(`/propostas/${r.id}`)
            else setErro(r.error ?? "Não deu.")
          })
        }}
      >
        {pendente ? "Criando…" : "Criar"}
      </Button>
      <button
        type="button"
        onClick={() => setAberto(false)}
        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        cancelar
      </button>
      {erro && <span className="text-xs text-rose-600">{erro}</span>}
    </div>
  )
}
