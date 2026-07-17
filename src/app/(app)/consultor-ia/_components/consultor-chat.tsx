"use client"

import * as React from "react"
import { Plus, Send, Sparkles } from "lucide-react"

import { perguntar, abrirConversa } from "../_actions"
import type { ChatTurn } from "@/lib/anthropic/client"

export type ConversaResumo = {
  id: string
  titulo: string
  atualizadaEm: string
}

const SUGESTOES = [
  "Como está meu faturamento este mês?",
  "Qual loja vende mais?",
  "Meu cancelamento está alto?",
  "Compare o ticket médio das minhas lojas",
]

/**
 * Consultor IA: lista de conversas (lateral, como o Claude) + o chat. As
 * conversas ficam salvas por usuário; a lista atualiza ao vivo quando uma
 * conversa nova é criada. O contador de cota vive aqui pra cair sem recarregar.
 */
export function ConsultorChat({
  conversasIniciais,
  restantesIniciais,
}: {
  conversasIniciais: ConversaResumo[]
  restantesIniciais: number
}) {
  const [conversas, setConversas] = React.useState(conversasIniciais)
  const [ativaId, setAtivaId] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<ChatTurn[]>([])
  const [input, setInput] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [carregando, setCarregando] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)
  const [restantes, setRestantes] = React.useState(restantesIniciais)
  const [bloqueado, setBloqueado] = React.useState(restantesIniciais <= 0)
  const fimRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, pending])

  function novaConversa() {
    setAtivaId(null)
    setMessages([])
    setErro(null)
  }

  async function abrir(id: string) {
    if (id === ativaId || pending) return
    setCarregando(true)
    setErro(null)
    setAtivaId(id)
    const msgs = await abrirConversa(id)
    setMessages(msgs)
    setCarregando(false)
  }

  async function enviar(texto: string) {
    const pergunta = texto.trim()
    if (!pergunta || pending || bloqueado) return
    setErro(null)
    setInput("")
    const novo: ChatTurn[] = [...messages, { role: "user", content: pergunta }]
    setMessages(novo)
    setPending(true)
    const r = await perguntar(ativaId, novo)
    setPending(false)
    if (r.ok) {
      setMessages([...novo, { role: "assistant", content: r.resposta }])
      setRestantes((n) => Math.max(0, n - 1))
      // Conversa nova → entra no topo da lista. Existente → sobe pro topo.
      setConversas((atual) => {
        const semEla = atual.filter((c) => c.id !== r.conversaId)
        return [
          {
            id: r.conversaId,
            titulo: r.titulo,
            atualizadaEm: new Date().toISOString(),
          },
          ...semEla,
        ]
      })
      setAtivaId(r.conversaId)
    } else {
      setMessages(messages)
      setInput(pergunta)
      if (r.bloqueado) setBloqueado(true)
      else setErro(r.mensagem)
    }
  }

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      {/* Lateral: conversas */}
      <aside className="md:w-56 md:shrink-0">
        <button
          type="button"
          onClick={novaConversa}
          className="mb-2 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          <Plus className="size-4" />
          Nova conversa
        </button>
        <div className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
          {conversas.length === 0 ? (
            <p className="px-1 py-2 text-xs text-muted-foreground">
              Suas conversas aparecem aqui.
            </p>
          ) : (
            conversas.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => abrir(c.id)}
                title={c.titulo}
                className={`shrink-0 truncate rounded-md px-2.5 py-2 text-left text-xs transition-colors md:w-full ${
                  c.id === ativaId
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {c.titulo}
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Chat */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
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

        {bloqueado ? (
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
        ) : (
          <>
            {/* Conversa */}
            <div className="min-h-[280px] rounded-xl border bg-card p-4">
              {carregando ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Carregando conversa…
                </p>
              ) : messages.length === 0 ? (
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
          </>
        )}
      </div>
    </div>
  )
}
