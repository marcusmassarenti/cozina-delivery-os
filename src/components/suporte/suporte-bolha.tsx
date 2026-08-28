"use client"

import * as React from "react"
import { Loader2, Send, X } from "lucide-react"

import { DeliveryOsMark } from "@/components/delivery-os-logo"
import { anunciarNova, ouvirAbrir } from "@/components/suporte/suporte-canal"
import { CATEGORIAS, type Categoria } from "@/lib/suporte/ajuda"
import {
  abrirConversa,
  enviarMensagem,
  pedirAtendente,
  responderDoCatalogo,
  temRespostaNova,
  type ConversaSuporte,
} from "@/app/(app)/_actions-suporte"

/**
 * Balão de suporte, canto inferior direito.
 *
 * O desenho segue o padrão que o cliente já conhece de outros atendimentos
 * (Asaas, Intercom): cabeçalho na cor da marca, mensagens em balões e as
 * opções como ETIQUETAS dentro da conversa — não uma lista fixa embaixo. A
 * diferença não é estética: etiqueta dentro do fio faz a escolha parecer parte
 * do diálogo, e o histórico depois se lê como uma conversa, não como um menu
 * que alguém navegou.
 *
 * Abre em opções, nunca em campo vazio. Campo em branco transfere pro cliente
 * o trabalho de adivinhar o que dá pra perguntar; a lista mostra.
 *
 * A conversa só é criada quando a pessoa ABRE o balão, não quando a página
 * carrega: senão cada visita abriria um chamado vazio.
 */

/** Etiqueta clicável — o "chip" das opções. */
function Etiqueta({
  children,
  onClick,
  destaque,
}: {
  children: React.ReactNode
  onClick: () => void
  destaque?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium leading-tight transition-colors ${
        destaque
          ? "border-border text-muted-foreground hover:bg-muted"
          : "border-primary/40 text-primary hover:bg-primary/10"
      }`}
    >
      {children}
    </button>
  )
}

export function SuporteBolha() {
  const [aberto, setAberto] = React.useState(false)
  const [conversa, setConversa] = React.useState<ConversaSuporte | null>(null)
  const [categoria, setCategoria] = React.useState<Categoria | null>(null)
  const [texto, setTexto] = React.useState("")
  const [carregando, setCarregando] = React.useState(false)
  const [enviando, setEnviando] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)
  const [temNova, setTemNova] = React.useState(false)
  const fim = React.useRef<HTMLDivElement>(null)

  /**
   * Selo de resposta nova — hoje mostrado no item do menu.
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
  }, [conversa?.mensagens.length, enviando, categoria])

  function otimista(txt: string) {
    setConversa((c) =>
      c
        ? {
            ...c,
            mensagens: [
              ...c.mensagens,
              {
                id: `tmp-${c.mensagens.length}`,
                autor: "cliente",
                texto: txt,
                criadaEm: new Date().toISOString(),
              },
            ],
          }
        : c,
    )
  }

  async function clicarPergunta(perguntaId: string, titulo: string) {
    if (!conversa || enviando) return
    setErro(null)
    setEnviando(true)
    otimista(titulo)
    const r = await responderDoCatalogo(conversa.id, perguntaId)
    setEnviando(false)
    if (!r.ok) return setErro(r.erro ?? "Não consegui buscar a resposta.")
    if (r.conversa) setConversa(r.conversa)
  }

  /**
   * Não recebe evento de propósito: quem chama decide se precisa de
   * `preventDefault`. Passar o evento de teclado com um cast pra evento de
   * formulário é o tipo de mentira de tipo que só se paga quando alguém
   * confia nela.
   */
  async function enviar() {
    const msg = texto.trim()
    if (!msg || !conversa || enviando) return
    setTexto("")
    setErro(null)
    setEnviando(true)
    setCategoria(null)
    otimista(msg)
    const r = await enviarMensagem(conversa.id, msg)
    setEnviando(false)
    if (!r.ok) {
      setErro(r.erro ?? "Não consegui enviar.")
      setTexto(msg)
      return
    }
    if (r.conversa) setConversa(r.conversa)
  }

  async function chamarPessoa() {
    if (!conversa || enviando) return
    setEnviando(true)
    setCategoria(null)
    const r = await pedirAtendente(conversa.id)
    setEnviando(false)
    if (r.conversa) setConversa(r.conversa)
  }

  /* A entrada agora é o item do menu; aqui só se escuta o pedido de abrir. */
  React.useEffect(() => ouvirAbrir(() => setAberto(true)), [])
  React.useEffect(() => anunciarNova(temNova), [temNova])

  const naFila = conversa?.status === "aguardando_humano"
  const comHumano = naFila || conversa?.status === "com_humano"
  const msgs = conversa?.mensagens ?? []

  /* FECHADO NÃO DESENHA NADA.
   *
   * O botão flutuante virou item do menu lateral — ver `suporte-canal`. Um
   * chamariz que fica por cima do conteúdo em toda tela cobra o preço o tempo
   * todo pra entregar um atalho que se usa uma vez por semana. */
  if (!aberto) return null

  // --------------------------------------------------------------- aberto
  return (
    <div
      data-print="hide"
      className="fixed bottom-5 right-5 z-50 flex h-[600px] max-h-[calc(100vh-2.5rem)] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl"
    >
      <header className="flex items-center gap-2.5 bg-primary px-4 py-3.5 text-primary-foreground">
        <DeliveryOsMark className="size-6 shrink-0" />
        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">
          Entre em contato
        </p>
        <button
          type="button"
          onClick={() => setAberto(false)}
          aria-label="Fechar"
          className="rounded-md p-1 opacity-80 transition-opacity hover:opacity-100"
        >
          <X className="size-4.5" />
        </button>
      </header>

      <div className="flex-1 space-y-2.5 overflow-y-auto bg-background px-3.5 py-3">
        {carregando && (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!carregando && (
          <p className="pb-1 text-center text-[11px] text-muted-foreground">
            {new Date().toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}

        {/* Saudação. Não é mensagem gravada: é a moldura da tela, e gravá-la
            encheria a fila da equipe de conversa sem pergunta nenhuma. */}
        {!carregando && (
          <div className="flex gap-2">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary">
              <DeliveryOsMark className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-[11px] text-muted-foreground">
                Delivery OS
              </p>
              <div className="w-fit max-w-[85%] rounded-lg bg-muted px-3 py-2 text-[13px] leading-relaxed">
                Olá! Bem-vindo ao atendimento do Delivery OS.
              </div>
              <div className="mt-1 w-fit max-w-[85%] rounded-lg bg-muted px-3 py-2 text-[13px] leading-relaxed">
                Pra te atender melhor, escolha abaixo sobre o que você quer
                falar. As respostas sobre a sua conta vêm com os dados reais das
                suas lojas.
              </div>
            </div>
          </div>
        )}

        {msgs.map((m) =>
          m.autor === "cliente" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[80%] whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-[13px] leading-relaxed text-primary-foreground">
                {m.texto}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex gap-2">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary">
                <DeliveryOsMark className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[11px] text-muted-foreground">
                  {/* A origem tem que ser literal: o cliente muda o que
                      escreve conforme sabe se fala com pessoa ou com sistema. */}
                  {m.autor === "equipe" ? "Equipe Delivery OS" : "Delivery OS"}
                </p>
                <div className="w-fit max-w-[85%] whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-[13px] leading-relaxed">
                  {m.texto}
                </div>
              </div>
            </div>
          ),
        )}

        {enviando && (
          <div className="flex items-center gap-2 pl-9 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            buscando...
          </div>
        )}

        {/* Etiquetas dentro do fio da conversa. Somem quando o chamado já é de
            gente: oferecer resposta pronta a quem espera um humano lê como
            enrolação. */}
        {!carregando && !comHumano && !enviando && (
          <div className="pt-1">
            <p className="mb-1.5 text-[11px] text-muted-foreground">
              {categoria ? categoria.titulo : "Agora mesmo"}
            </p>
            <div className="flex flex-wrap justify-end gap-1.5">
              {categoria ? (
                <>
                  {categoria.perguntas.map((p) => (
                    <Etiqueta
                      key={p.id}
                      onClick={() => void clicarPergunta(p.id, p.titulo)}
                    >
                      {p.titulo}
                    </Etiqueta>
                  ))}
                  <Etiqueta destaque onClick={() => setCategoria(null)}>
                    ← Outros assuntos
                  </Etiqueta>
                </>
              ) : (
                <>
                  {CATEGORIAS.map((c) => (
                    <Etiqueta key={c.id} onClick={() => setCategoria(c)}>
                      {c.titulo}
                    </Etiqueta>
                  ))}
                  <Etiqueta destaque onClick={() => void chamarPessoa()}>
                    Falar com uma pessoa
                  </Etiqueta>
                </>
              )}
            </div>
          </div>
        )}

        <div ref={fim} />
      </div>

      {erro && (
        <p className="border-t bg-rose-50 px-4 py-1.5 text-[11px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-400">
          {erro}
        </p>
      )}

      {naFila && (
        <p className="border-t bg-sky-50 px-4 py-1.5 text-[11px] text-sky-800 dark:bg-sky-950/30 dark:text-sky-300">
          Na fila da equipe. Pode fechar o chat — a gente te avisa.
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void enviar()
        }}
        className="flex items-end gap-2 border-t bg-card p-2.5"
      >
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void enviar()
            }
          }}
          rows={1}
          placeholder="Digite uma mensagem"
          className="max-h-24 min-h-[40px] flex-1 resize-none rounded-full border-2 border-primary/30 bg-background px-4 py-2 text-[13px] outline-none placeholder:text-muted-foreground focus:border-primary"
        />
        <button
          type="submit"
          disabled={!texto.trim() || enviando}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
          aria-label="Enviar"
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  )
}
