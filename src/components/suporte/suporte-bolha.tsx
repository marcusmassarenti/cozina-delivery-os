"use client"

import * as React from "react"
import { Headset, Loader2, MessageCircle, Send, User, X } from "lucide-react"

import { DeliveryOsMark } from "@/components/delivery-os-logo"
import {
  abrirConversa,
  enviarMensagem,
  pedirAtendente,
  temRespostaNova,
  type ConversaSuporte,
} from "@/app/(app)/_actions-suporte"

/**
 * Balão de suporte, canto inferior direito — o mesmo lugar onde todo mundo já
 * procura ajuda.
 *
 * A conversa só é criada quando a pessoa ABRE o balão, não quando a página
 * carrega: senão cada visita abriria um chamado vazio e a fila da equipe
 * encheria de conversa sem pergunta.
 */
export function SuporteBolha() {
  const [aberto, setAberto] = React.useState(false)
  const [conversa, setConversa] = React.useState<ConversaSuporte | null>(null)
  const [texto, setTexto] = React.useState("")
  const [carregando, setCarregando] = React.useState(false)
  const [enviando, setEnviando] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)
  const fim = React.useRef<HTMLDivElement>(null)

  const [temNova, setTemNova] = React.useState(false)

  /**
   * Selo de resposta nova no balão fechado.
   *
   * Confere ao montar e ao voltar pra aba — não em intervalo. Aba aberta e
   * esquecida a tarde inteira custaria CPU na Vercel pra perguntar a mesma
   * coisa; o momento em que a pessoa VOLTA é quando a resposta importa.
   */
  React.useEffect(() => {
    if (aberto) return
    const conferir = () => {
      if (document.visibilityState === "visible") {
        void temRespostaNova().then(setTemNova)
      }
    }
    conferir()
    document.addEventListener("visibilitychange", conferir)
    return () => document.removeEventListener("visibilitychange", conferir)
  }, [aberto])

  // O aviso (push ou e-mail) leva pra cá com ?suporte=1 — abrir o sistema e
  // ainda ter que procurar o balão desfaz metade do favor.
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get("suporte") === "1") {
      setAberto(true)
    }
  }, [])

  React.useEffect(() => {
    if (!aberto || conversa) return
    setCarregando(true)
    abrirConversa()
      .then((c) => setConversa(c))
      .finally(() => setCarregando(false))
  }, [aberto, conversa])

  React.useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" })
  }, [conversa?.mensagens.length, enviando])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const msg = texto.trim()
    if (!msg || !conversa || enviando) return
    setTexto("")
    setErro(null)
    setEnviando(true)
    // Otimista: a mensagem aparece na hora. A resposta da IA leva alguns
    // segundos, e ver o próprio texto sumir nesse meio-tempo dá a impressão
    // de que não enviou.
    setConversa({
      ...conversa,
      mensagens: [
        ...conversa.mensagens,
        { id: `tmp-${Date.now()}`, autor: "cliente", texto: msg, criadaEm: new Date().toISOString() },
      ],
    })
    const r = await enviarMensagem(conversa.id, msg)
    setEnviando(false)
    if (!r.ok) {
      setErro(r.erro ?? "Não consegui enviar.")
      setTexto(msg)
      return
    }
    if (r.conversa) setConversa(r.conversa)
  }

  async function chamarGente() {
    if (!conversa || enviando) return
    setEnviando(true)
    const r = await pedirAtendente(conversa.id)
    setEnviando(false)
    if (r.conversa) setConversa(r.conversa)
  }

  const comHumano =
    conversa?.status === "aguardando_humano" || conversa?.status === "com_humano"

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label={temNova ? "Abrir suporte (resposta nova)" : "Abrir suporte"}
        className="btn-brand fixed bottom-5 right-5 z-50 flex size-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105"
      >
        <MessageCircle className="size-6" />
        {temNova && (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-rose-500 ring-2 ring-background">
            <span className="size-1.5 rounded-full bg-white" />
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex h-[560px] max-h-[calc(100vh-3rem)] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
      <header className="flex items-center gap-2 border-b bg-muted/40 px-4 py-3">
        <DeliveryOsMark className="size-7" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Suporte</p>
          <p className="text-[11px] text-muted-foreground">
            {comHumano ? "Alguém da equipe vai responder aqui" : "Resposta na hora"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAberto(false)}
          aria-label="Fechar"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {carregando && (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!carregando && conversa?.mensagens.length === 0 && (
          <div className="py-4 text-center">
            <p className="text-sm font-medium">Como posso ajudar?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Eu enxergo suas lojas e conexões agora — pergunte à vontade.
            </p>
            <div className="mt-3 flex flex-col gap-1.5">
              {[
                "Minhas lojas estão conectadas?",
                "Até que dia entrou faturamento?",
                "Por que uma loja não conecta?",
              ].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTexto(s)}
                  className="rounded-lg border px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {conversa?.mensagens.map((m) => (
          <div
            key={m.id}
            className={`flex gap-2 ${m.autor === "cliente" ? "justify-end" : ""}`}
          >
            {m.autor !== "cliente" && (
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
                {m.autor === "equipe" ? (
                  <Headset className="size-3.5" />
                ) : (
                  <DeliveryOsMark className="size-4" />
                )}
              </span>
            )}
            <div
              className={`max-w-[78%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                m.autor === "cliente"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}
            >
              {/* Deixa explícito quando é gente. O cliente muda o que escreve
                  conforme sabe se está falando com pessoa ou com máquina. */}
              {m.autor === "equipe" && (
                <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider opacity-60">
                  Equipe Delivery OS
                </span>
              )}
              {m.texto}
            </div>
            {m.autor === "cliente" && (
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
                <User className="size-3.5" />
              </span>
            )}
          </div>
        ))}

        {enviando && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            conferindo seus dados...
          </div>
        )}
        <div ref={fim} />
      </div>

      {erro && (
        <p className="border-t bg-rose-50 px-4 py-1.5 text-[11px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-400">
          {erro}
        </p>
      )}

      {conversa?.status === "aguardando_humano" && (
        <p className="border-t bg-sky-50 px-4 py-1.5 text-[11px] text-sky-800 dark:bg-sky-950/30 dark:text-sky-300">
          Na fila da equipe. Pode fechar o chat — a gente te avisa.
        </p>
      )}

      <form onSubmit={enviar} className="flex items-end gap-2 border-t p-2.5">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void enviar(e as unknown as React.FormEvent)
            }
          }}
          rows={1}
          placeholder="Escreva sua dúvida..."
          className="max-h-24 min-h-[38px] flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground focus:border-ring"
        />
        <button
          type="submit"
          disabled={!texto.trim() || enviando}
          className="btn-brand flex size-[38px] shrink-0 items-center justify-center rounded-lg disabled:opacity-40"
          aria-label="Enviar"
        >
          <Send className="size-4" />
        </button>
      </form>

      {!comHumano && conversa && (
        <button
          type="button"
          onClick={chamarGente}
          disabled={enviando}
          className="border-t px-4 py-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          Prefiro falar com uma pessoa
        </button>
      )}
    </div>
  )
}
