"use client"

import * as React from "react"
import { Send, Sparkles } from "lucide-react"

import { perguntar } from "../_actions"
import type { ChatTurn } from "@/lib/anthropic/client"

const SUGESTOES = [
  "Como está meu faturamento este mês?",
  "Qual loja vende mais?",
  "Meu cancelamento está alto?",
  "Compare o ticket médio das minhas lojas",
]

/**
 * Chat do Consultor IA + contador de cota. Mantém a conversa no estado (some
 * ao sair — sem histórico persistido nesta fase). Quando a cota acaba, o
 * servidor devolve `bloqueado` e a tela troca pro card de comprar +100.
 *
 * O contador (restantes) vive aqui pra atualizar ao vivo a cada resposta, sem
 * recarregar a página.
 */
export function ConsultorChat({
  restantesIniciais,
}: {
  restantesIniciais: number
}) {
  const [messages, setMessages] = React.useState<ChatTurn[]>([])
  const [input, setInput] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)
  const [restantes, setRestantes] = React.useState(restantesIniciais)
  const [bloqueado, setBloqueado] = React.useState(restantesIniciais <= 0)
  const fimRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, pending])

  async function enviar(texto: string) {
    const pergunta = texto.trim()
    if (!pergunta || pending || bloqueado) return
    setErro(null)
    setInput("")
    const novo: ChatTurn[] = [...messages, { role: "user", content: pergunta }]
    setMessages(novo)
    setPending(true)
    const r = await perguntar(novo)
    setPending(false)
    if (r.ok) {
      setMessages([...novo, { role: "assistant", content: r.resposta }])
      setRestantes((n) => Math.max(0, n - 1))
    } else {
      // Tira a pergunta que não foi respondida de volta.
      setMessages(messages)
      setInput(pergunta)
      if (r.bloqueado) setBloqueado(true)
      else setErro(r.mensagem)
    }
  }

  if (bloqueado) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center">
        <Sparkles className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-semibold">
          Suas perguntas do mês acabaram
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Elas voltam na virada do mês. Em breve você vai poder comprar um
          pacote de perguntas extras direto por aqui.
        </p>
        <button
          type="button"
          disabled
          className="mt-4 inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium opacity-60"
        >
          Comprar +100 perguntas · em breve
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Contador de cota */}
      <p className="text-xs text-muted-foreground">
        {restantes > 0 ? (
          <>
            <span className="font-semibold text-foreground tabular-nums">
              {restantes}
            </span>{" "}
            pergunta{restantes === 1 ? "" : "s"} restante
            {restantes === 1 ? "" : "s"} este mês
          </>
        ) : (
          "Últimas perguntas do mês"
        )}
      </p>

      {/* Conversa */}
      <div className="min-h-[240px] rounded-xl border bg-card p-4">
        {messages.length === 0 ? (
          <div className="py-6 text-center">
            <Sparkles className="mx-auto size-7 text-primary" />
            <p className="mt-2 text-sm font-medium">
              Pergunte sobre a sua operação
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Eu respondo com os números reais das suas lojas neste mês.
            </p>
            <div className="mx-auto mt-4 flex max-w-md flex-wrap justify-center gap-2">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => enviar(s)}
                  className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {pending && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-muted px-3.5 py-2 text-sm text-muted-foreground">
                  Pensando…
                </div>
              </div>
            )}
            <div ref={fimRef} />
          </div>
        )}
      </div>

      {erro && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          {erro}
        </div>
      )}

      {/* Caixa de pergunta */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void enviar(input)
        }}
        className="flex items-end gap-2"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void enviar(input)
            }
          }}
          rows={1}
          placeholder="Escreva sua pergunta…"
          disabled={pending}
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-lg border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={pending || !input.trim()}
          className="inline-flex h-[42px] shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  )
}
