"use client"

import * as React from "react"
import {
  ChevronLeft,
  ChevronRight,
  Headset,
  Loader2,
  MessageCircle,
  Send,
  User,
  X,
} from "lucide-react"

import { DeliveryOsMark } from "@/components/delivery-os-logo"
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
 * Balão de suporte, canto inferior direito — o mesmo lugar onde todo mundo já
 * procura ajuda.
 *
 * Abre numa LISTA DE CATEGORIAS, não num campo de texto em branco. Campo vazio
 * transfere pro cliente o trabalho de adivinhar o que dá pra perguntar; a
 * lista mostra. E cada resposta clicada é escrita por gente — as que dependem
 * da conta continuam vindo do banco, com o nome das lojas e as datas.
 *
 * O campo de texto continua existindo, no fim, pro que a lista não cobre. Só
 * que ele não tenta responder: vai direto pra fila da equipe.
 *
 * A conversa só é criada quando a pessoa ABRE o balão, não quando a página
 * carrega: senão cada visita abriria um chamado vazio.
 */
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

  async function clicarPergunta(perguntaId: string, titulo: string) {
    if (!conversa || enviando) return
    setErro(null)
    setEnviando(true)
    setCategoria(null)
    // Otimista: a pergunta aparece na hora. A resposta com dado da conta leva
    // um instante, e a tela parada nesse meio-tempo lê como clique perdido.
    setConversa({
      ...conversa,
      mensagens: [
        ...conversa.mensagens,
        {
          id: `tmp-${Date.now()}`,
          autor: "cliente",
          texto: titulo,
          criadaEm: new Date().toISOString(),
        },
      ],
    })
    const r = await responderDoCatalogo(conversa.id, perguntaId)
    setEnviando(false)
    if (!r.ok) return setErro(r.erro ?? "Não consegui buscar a resposta.")
    if (r.conversa) setConversa(r.conversa)
  }

  /**
   * Não recebe evento de propósito: quem chama decide se precisa de
   * `preventDefault`. A versão anterior fazia o atalho de teclado chamar isto
   * passando o evento de TECLADO com um cast pra evento de formulário — não
   * quebrava na prática, mas é o tipo de mentira de tipo que só se paga quando
   * alguém confia nela.
   */
  async function enviar() {
    const msg = texto.trim()
    if (!msg || !conversa || enviando) return
    setTexto("")
    setErro(null)
    setEnviando(true)
    setCategoria(null)
    setConversa({
      ...conversa,
      mensagens: [
        ...conversa.mensagens,
        {
          id: `tmp-${Date.now()}`,
          autor: "cliente",
          texto: msg,
          criadaEm: new Date().toISOString(),
        },
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

  async function chamarPessoa() {
    if (!conversa || enviando) return
    setEnviando(true)
    setCategoria(null)
    const r = await pedirAtendente(conversa.id)
    setEnviando(false)
    if (r.conversa) setConversa(r.conversa)
  }

  const naFila = conversa?.status === "aguardando_humano"
  const comHumano = naFila || conversa?.status === "com_humano"
  const vazia = !conversa || conversa.mensagens.length === 0

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
            {comHumano
              ? "Alguém da equipe vai responder aqui"
              : "Central de ajuda"}
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

        {!carregando && vazia && !categoria && (
          <p className="pb-1 pt-2 text-center text-xs text-muted-foreground">
            Escolha um assunto. As respostas sobre a sua conta vêm com os dados
            reais das suas lojas.
          </p>
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
            buscando a resposta...
          </div>
        )}
        <div ref={fim} />
      </div>

      {/* Catálogo. Some quando a conversa já é de gente: oferecer resposta
          pronta a quem está esperando um humano lê como enrolação. */}
      {!carregando && !comHumano && (
        <div className="border-t bg-muted/20 px-3 py-2.5">
          {!categoria ? (
            <div className="flex flex-col gap-1">
              {CATEGORIAS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoria(c)}
                  className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-left transition-colors hover:bg-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium leading-tight">
                      {c.titulo}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {c.resumo}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setCategoria(null)}
                className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="size-3.5" />
                {categoria.titulo}
              </button>
              {categoria.perguntas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => void clicarPergunta(p.id, p.titulo)}
                  className="rounded-lg border bg-card px-2.5 py-2 text-left text-[13px] leading-snug transition-colors hover:bg-muted"
                >
                  {p.titulo}
                </button>
              ))}
            </div>
          )}

          {/* Sempre visível: a saída pra gente não pode depender de achar a
              categoria certa primeiro. */}
          <button
            type="button"
            onClick={() => void chamarPessoa()}
            className="mt-1.5 w-full rounded-lg px-2 py-1.5 text-[11px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
          >
            Não achei o que preciso — falar com uma pessoa
          </button>
        </div>
      )}

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
        className="flex items-end gap-2 border-t p-2.5"
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
          placeholder={
            comHumano ? "Escreva pra equipe..." : "Ou escreva sua dúvida..."
          }
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
    </div>
  )
}
