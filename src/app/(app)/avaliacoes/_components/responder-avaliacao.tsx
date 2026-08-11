"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CornerDownRight, Loader2 } from "lucide-react"

import { responderAvaliacaoIfood } from "@/app/(app)/avaliacoes/_actions"
import {
  RESPOSTA_MAX,
  RESPOSTA_MIN,
} from "@/app/(app)/avaliacoes/_resposta-limites"

/**
 * Responder a avaliação do iFood sem sair do painel.
 *
 * Fica fechado por padrão: a tela é uma lista de leitura e um textarea aberto
 * por comentário viraria uma parede de caixas. Abre no clique, no lugar do
 * botão.
 *
 * O contador de caracteres é obrigatório, não enfeite — o iFood recusa fora de
 * 10–300 e devolve um 400 seco, sem dizer o limite. Melhor barrar aqui.
 */
export function ResponderAvaliacao({ avaliacaoId }: { avaliacaoId: string }) {
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState("")
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()
  const router = useRouter()

  const n = texto.trim().length
  const valido = n >= RESPOSTA_MIN && n <= RESPOSTA_MAX

  if (!aberto)
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        data-print="hide"
        className="mt-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-muted"
      >
        <CornerDownRight className="size-3.5" />
        Responder
      </button>
    )

  const enviar = () => {
    setErro(null)
    startTransition(async () => {
      const r = await responderAvaliacaoIfood(avaliacaoId, texto)
      if (!r.ok) {
        setErro(r.message ?? "Não foi possível enviar.")
        return
      }
      setAberto(false)
      // A resposta agora vem do banco; o refresh é o que troca o formulário
      // pelo balão de resposta.
      router.refresh()
    })
  }

  return (
    <div className="mt-2 rounded-lg border bg-muted/30 p-2.5" data-print="hide">
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={3}
        maxLength={RESPOSTA_MAX}
        autoFocus
        placeholder="Responda o cliente. Essa resposta fica pública no iFood."
        className="w-full resize-none rounded-md border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <span
          className={`text-[11px] tabular-nums ${
            n > 0 && !valido ? "text-amber-600" : "text-muted-foreground"
          }`}
        >
          {n}/{RESPOSTA_MAX}
          {n > 0 && n < RESPOSTA_MIN ? ` · mínimo ${RESPOSTA_MIN}` : ""}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setAberto(false)
              setErro(null)
            }}
            disabled={pendente}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={enviar}
            disabled={!valido || pendente}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background disabled:opacity-40"
          >
            {pendente && <Loader2 className="size-3.5 animate-spin" />}
            Enviar
          </button>
        </div>
      </div>
      {erro && (
        <p className="mt-1.5 text-[11px] text-rose-600 dark:text-rose-400">
          {erro}
        </p>
      )}
    </div>
  )
}
