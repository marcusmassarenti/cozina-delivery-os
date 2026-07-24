"use client"

import * as React from "react"
import Link from "next/link"
import {
  Gift,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Star,
  Store,
  Trash2,
} from "lucide-react"

import {
  abrirConversa,
  renomear,
  favoritar,
  vincular,
  excluir,
  comprar,
} from "../_actions"
import type { ChatTurn } from "@/lib/anthropic/client"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

export type ConversaResumo = {
  id: string
  titulo: string
  atualizadaEm: string
  favorita: boolean
  unitId: string | null
}

type Loja = { id: string; code: string; name: string }

const SUGESTOES = [
  "Como está meu faturamento este mês?",
  "Qual loja vende mais?",
  "Meu cancelamento está alto?",
  "Compare o ticket médio das minhas lojas",
  "Como importo um relatório?",
]

export function ConsultorChat({
  conversasIniciais,
  restantesIniciais,
  lojas,
  pacote,
  nome,
  degustacao,
  cotaTotal,
}: {
  conversasIniciais: ConversaResumo[]
  restantesIniciais: number
  lojas: Loja[]
  pacote: { preco: number; tamanho: number }
  nome: string
  /** Cortesia "por conta da casa" ativa (Essencial/Pro) + até quando. */
  degustacao: { ativa: boolean; ate: string | null }
  /** Cota total do período (na cortesia = a enxuta; senão 50×lojas). */
  cotaTotal: number
}) {
  const [conversas, setConversas] = React.useState(conversasIniciais)
  const [ativaId, setAtivaId] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<ChatTurn[]>([])
  const [input, setInput] = React.useState("")
  const [pending, setPending] = React.useState(false)
  // Streaming: `buscando` = o Nino disparou a busca na web (mostra "Pesquisando
  // na web…" pela realidade). `streamingText` = a resposta chegando palavra a
  // palavra (null quando não está respondendo).
  const [buscando, setBuscando] = React.useState(false)
  // O Nino pediu um cálculo de período ao servidor — sinal real, não palpite.
  const [calculando, setCalculando] = React.useState(false)
  const [streamingText, setStreamingText] = React.useState<string | null>(null)
  const [carregando, setCarregando] = React.useState(false)
  const [erro, setErro] = React.useState<string | null>(null)
  const [restantes, setRestantes] = React.useState(restantesIniciais)
  const [bloqueado, setBloqueado] = React.useState(restantesIniciais <= 0)
  // Diálogos compartilhados (renomear / vincular).
  const [renomeando, setRenomeando] = React.useState<ConversaResumo | null>(null)
  const [vinculando, setVinculando] = React.useState<ConversaResumo | null>(null)
  // Compra do pacote (Fase 2).
  const [comprando, setComprando] = React.useState(false)
  const [avisoCompra, setAvisoCompra] = React.useState<string | null>(null)
  const fimRef = React.useRef<HTMLDivElement>(null)
  const taRef = React.useRef<HTMLTextAreaElement>(null)
  // Depois que o Nino termina de responder, devolve o foco pro campo — pronto
  // pra continuar a conversa / responder o que ele perguntou.
  const antesPending = React.useRef(false)
  React.useEffect(() => {
    if (antesPending.current && !pending) taRef.current?.focus()
    antesPending.current = pending
  }, [pending])
  // Saudação por horário — lida do cliente via useSyncExternalStore (no server
  // fica "Olá"; no cliente vira Bom dia/Boa tarde/Boa noite). Sem setState em
  // effect e sem mismatch de hidratação.
  const saudacao = React.useSyncExternalStore(
    () => () => {},
    () => {
      const h = new Date().getHours()
      return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"
    },
    () => "Olá",
  )

  const precoStr = pacote.preco.toFixed(2).replace(".", ",")

  async function comprarPacote() {
    if (comprando) return
    if (
      !confirm(
        `Comprar ${pacote.tamanho} perguntas por R$ ${precoStr}? Você finaliza o pagamento numa página segura do Asaas, no seu cartão.`,
      )
    )
      return
    setComprando(true)
    setAvisoCompra(null)
    const r = await comprar()
    setComprando(false)
    if (r.ok) {
      window.open(r.checkoutUrl, "_blank", "noopener")
      setAvisoCompra(
        "Abrimos o checkout numa nova aba. Depois de pagar, recarregue esta página — as perguntas entram em segundos.",
      )
    } else {
      setErro(r.mensagem)
    }
  }

  const lojaNome = React.useCallback(
    (unitId: string | null) =>
      unitId ? (lojas.find((l) => l.id === unitId)?.name ?? "Loja") : "Grupo",
    [lojas],
  )

  React.useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, pending, streamingText])

  function patchConversa(id: string, patch: Partial<ConversaResumo>) {
    setConversas((atual) =>
      ordenar(atual.map((c) => (c.id === id ? { ...c, ...patch } : c))),
    )
  }

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
    setBuscando(false)
    setCalculando(false)
    setStreamingText("")

    let acc = ""
    type DoneEvt = { conversaId: string; titulo: string }
    let feito: DoneEvt | null = null
    let erroEvt: { motivo?: string; mensagem: string } | null = null

    try {
      const res = await fetch("/consultor-ia/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversaId: ativaId, messages: novo }),
      })
      if (!res.ok || !res.body) throw new Error("stream")
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let nl: number
        // NDJSON: um evento por linha.
        while ((nl = buf.indexOf("\n")) >= 0) {
          const linha = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!linha) continue
          let evt: {
            type: string
            text?: string
            conversaId?: string
            titulo?: string
            motivo?: string
            mensagem?: string
          }
          try {
            evt = JSON.parse(linha)
          } catch {
            continue
          }
          if (evt.type === "searching") {
            setBuscando(true)
          } else if (evt.type === "consultando") {
            setCalculando(true)
          } else if (evt.type === "text") {
            acc += evt.text ?? ""
            setStreamingText(acc)
          } else if (evt.type === "done") {
            feito = { conversaId: evt.conversaId!, titulo: evt.titulo! }
          } else if (evt.type === "error") {
            erroEvt = { motivo: evt.motivo, mensagem: evt.mensagem ?? "Erro." }
          }
        }
      }
    } catch {
      erroEvt = { mensagem: "Falha de conexão. Tente de novo." }
    }

    setPending(false)
    setBuscando(false)
    setCalculando(false)
    setStreamingText(null)

    if (feito) {
      setMessages([...novo, { role: "assistant", content: acc }])
      setRestantes((n) => Math.max(0, n - 1))
      const dados = feito as DoneEvt
      setConversas((atual) => {
        const anterior = atual.find((c) => c.id === dados.conversaId)
        const semEla = atual.filter((c) => c.id !== dados.conversaId)
        return ordenar([
          {
            id: dados.conversaId,
            titulo: dados.titulo,
            atualizadaEm: new Date().toISOString(),
            favorita: anterior?.favorita ?? false,
            unitId: anterior?.unitId ?? null,
          },
          ...semEla,
        ])
      })
      setAtivaId(dados.conversaId)
    } else {
      setMessages(messages)
      setInput(pergunta)
      if (erroEvt?.motivo === "cota") setBloqueado(true)
      else setErro(erroEvt?.mensagem ?? "Não consegui responder agora.")
    }
  }

  async function toggleFavorita(c: ConversaResumo) {
    patchConversa(c.id, { favorita: !c.favorita })
    await favoritar(c.id, !c.favorita)
  }

  async function salvarRenome(id: string, titulo: string) {
    const limpo = titulo.trim()
    setRenomeando(null)
    if (!limpo) return
    patchConversa(id, { titulo: limpo })
    await renomear(id, limpo)
  }

  async function salvarVinculo(id: string, unitId: string | null) {
    setVinculando(null)
    patchConversa(id, { unitId })
    await vincular(id, unitId)
  }

  async function removerConversa(c: ConversaResumo) {
    if (!confirm(`Excluir a conversa "${c.titulo}"? Não dá pra desfazer.`)) return
    setConversas((atual) => atual.filter((x) => x.id !== c.id))
    if (ativaId === c.id) novaConversa()
    await excluir(c.id)
  }

  const favoritas = conversas.filter((c) => c.favorita)
  const recentes = conversas.filter((c) => !c.favorita)
  const conversaAtiva = conversas.find((c) => c.id === ativaId) ?? null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
      {/* Lateral: conversas */}
      <aside className="flex min-h-0 flex-col md:w-60 md:shrink-0">
        <button
          type="button"
          onClick={novaConversa}
          className="mb-2 flex w-full shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          <Plus className="size-4" />
          Nova conversa
        </button>

        {conversas.length === 0 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            Suas conversas aparecem aqui.
          </p>
        ) : (
          <div className="flex max-h-40 flex-col gap-3 overflow-y-auto md:max-h-none md:flex-1">
            {favoritas.length > 0 && (
              <ListaSecao
                titulo="Favoritas"
                conversas={favoritas}
                ativaId={ativaId}
                lojaNome={lojaNome}
                onAbrir={abrir}
                onFavoritar={toggleFavorita}
                onRenomear={setRenomeando}
                onVincular={setVinculando}
                onExcluir={removerConversa}
              />
            )}
            <ListaSecao
              titulo={favoritas.length > 0 ? "Recentes" : undefined}
              conversas={recentes}
              ativaId={ativaId}
              lojaNome={lojaNome}
              onAbrir={abrir}
              onFavoritar={toggleFavorita}
              onRenomear={setRenomeando}
              onVincular={setVinculando}
              onExcluir={removerConversa}
            />
          </div>
        )}
      </aside>

      {/* Chat */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        {/* Cabeçalho: qual conversa (como o breadcrumb do Claude) + cota */}
        <div className="mx-auto flex w-full max-w-5xl shrink-0 items-center justify-between gap-2 border-b pb-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold tracking-tight">
              {conversaAtiva ? conversaAtiva.titulo : "Nova conversa"}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <Store className="size-2.5" />
              {lojaNome(conversaAtiva?.unitId ?? null)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {degustacao.ativa ? (
              /* Cortesia "por conta da casa": mostra usadas de total + prazo,
                 e puxa upgrade em vez de vender pacote (o cliente não é AI). */
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <Gift className="size-2.5" />
                  Por conta da casa
                </span>
                <span className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground tabular-nums">
                    {Math.max(0, cotaTotal - restantes)}
                  </span>
                  <span className="tabular-nums"> de {cotaTotal}</span>
                  {degustacao.ate && (
                    <span className="hidden sm:inline">
                      {" · até "}
                      {new Date(degustacao.ate).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </span>
                  )}
                </span>
                <Link
                  href="/assinatura?plano=ai"
                  className="rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Assinar o AI
                </Link>
              </>
            ) : (
              <>
                <span className="text-xs text-muted-foreground">
                  {restantes > 0 ? (
                    <>
                      <span className="font-semibold text-foreground tabular-nums">
                        {restantes}
                      </span>{" "}
                      restante{restantes === 1 ? "" : "s"}
                    </>
                  ) : (
                    "Últimas do mês"
                  )}
                </span>
                {/* Comprar antes de acabar: só quando a cota está baixa. */}
                {restantes <= 10 && !bloqueado && (
                  <button
                    type="button"
                    onClick={comprarPacote}
                    disabled={comprando}
                    className="rounded-md border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-muted disabled:opacity-60"
                  >
                    {comprando ? "…" : `+${pacote.tamanho} · R$ ${precoStr}`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        {avisoCompra && (
          <p className="mx-auto w-full max-w-5xl shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400">
            {avisoCompra}
          </p>
        )}

        {bloqueado && degustacao.ativa ? (
          /* Cota da cortesia esgotada → convida a assinar o plano AI. */
          <div className="mx-auto mt-6 w-full max-w-md rounded-xl border bg-card p-6 text-center">
            <Gift className="mx-auto size-8 text-emerald-600 dark:text-emerald-400" />
            <p className="mt-3 text-sm font-semibold">
              Você usou toda a cortesia do Nino 🎁
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Curtiu? Assine o plano <b>DeliveryOS AI</b> e tenha o Nino sem
              limite de cortesia — com a cota cheia do plano.
            </p>
            <Link
              href="/assinatura?plano=ai"
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Sparkles className="size-4" />
              Assinar o DeliveryOS AI
            </Link>
          </div>
        ) : bloqueado ? (
          <div className="mx-auto mt-6 w-full max-w-md rounded-xl border bg-card p-6 text-center">
            <Sparkles className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-semibold">
              Suas perguntas do mês acabaram
            </p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Elas voltam na virada do mês. Ou compre um pacote de{" "}
              {pacote.tamanho} perguntas extras agora — os créditos não expiram.
            </p>
            <button
              type="button"
              onClick={comprarPacote}
              disabled={comprando}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              <Sparkles className="size-4" />
              {comprando
                ? "Abrindo checkout…"
                : `Comprar +${pacote.tamanho} · R$ ${precoStr}`}
            </button>
            {avisoCompra && (
              <p className="mx-auto mt-3 max-w-sm text-xs text-emerald-700 dark:text-emerald-400">
                {avisoCompra}
              </p>
            )}
            {erro && (
              <p className="mx-auto mt-3 max-w-sm text-xs text-rose-600 dark:text-rose-400">
                {erro}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-1">
                {carregando ? (
                  <p className="m-auto text-center text-sm text-muted-foreground">
                    Carregando conversa…
                  </p>
                ) : messages.length === 0 ? (
                  <div className="my-auto text-center">
                    <Sparkles className="mx-auto size-9 text-primary" />
                    <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
                      {saudacao}, {nome} 👋
                    </h2>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      Pergunte sobre a sua operação (com os números reais das
                      suas lojas) ou tire dúvidas de como usar o sistema.
                    </p>
                    <div className="mx-auto mt-5 flex max-w-lg flex-wrap justify-center gap-2">
                      {SUGESTOES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => enviar(s)}
                          className="rounded-full border px-3.5 py-2 text-sm font-medium transition-colors hover:bg-muted"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 py-4">
                    {messages.map((m, i) => (
                      <div
                        key={i}
                        className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                            m.role === "user"
                              ? "whitespace-pre-wrap bg-primary text-primary-foreground"
                              : "bg-muted"
                          }`}
                        >
                          {m.role === "user" ? (
                            m.content
                          ) : (
                            <RichResposta texto={m.content} />
                          )}
                        </div>
                      </div>
                    ))}
                    {/* Enquanto ainda não chegou texto, mostra o "pensando"
                        (que vira "Pesquisando na web…" quando ele de fato
                        busca). Assim que o texto começa, ele aparece palavra a
                        palavra numa bolha, igual o Claude. */}
                    {pending && !streamingText && (
                      <PensandoBolha
                        key={
                          calculando ? "calculo" : buscando ? "web" : "pensando"
                        }
                        pergunta={messages[messages.length - 1]?.content ?? ""}
                        buscando={buscando}
                        calculando={calculando}
                      />
                    )}
                    {pending && streamingText && (
                      <div className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl bg-muted px-3.5 py-2 text-sm">
                          <RichResposta texto={streamingText} />
                        </div>
                      </div>
                    )}
                    {/* Depois que ele responde, um atalho pra puxar mais. */}
                    {!pending &&
                      !carregando &&
                      messages[messages.length - 1]?.role === "assistant" && (
                        <div className="flex justify-start">
                          <button
                            type="button"
                            onClick={() => enviar("Pode continuar e detalhar mais.")}
                            className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <Plus className="size-3" />
                            Continuar
                          </button>
                        </div>
                      )}
                    <div ref={fimRef} />
                  </div>
                )}
              </div>
            </div>

            {erro && (
              <div className="mx-auto w-full max-w-5xl shrink-0 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
                {erro}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                void enviar(input)
              }}
              className="mx-auto flex w-full max-w-5xl shrink-0 items-end gap-2"
            >
              <textarea
                ref={taRef}
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

      {/* Diálogo: renomear */}
      <RenomearDialog
        conversa={renomeando}
        onClose={() => setRenomeando(null)}
        onSalvar={salvarRenome}
      />
      {/* Diálogo: vincular a loja/grupo */}
      <VincularDialog
        conversa={vinculando}
        lojas={lojas}
        onClose={() => setVinculando(null)}
        onSalvar={salvarVinculo}
      />
    </div>
  )
}

/** Estados que o Nino "passa" enquanto pensa (só efeito, dá sensação de vivo).
 *  Dois roteiros: perguntas sobre a conta ("interno") e perguntas de mercado
 *  ("mercado"), onde ele mostra que está PESQUISANDO fora — igual o Claude. */
const FASES_INTERNO = [
  "Pensando…",
  "Lendo os seus números…",
  "Cruzando as lojas…",
  "Montando a resposta…",
  "Quase lá…",
]
const FASES_MERCADO = [
  "Entendendo a pergunta…",
  "Pesquisando na web…",
  "Lendo o que encontrei…",
  "Cruzando com os seus números…",
  "Montando a resposta…",
]
/** Roteiro quando o Nino pediu ao servidor o total de um período (sinal real).
 *  Ele não está "pensando": está esperando a soma exata voltar do banco. */
const FASES_CALCULANDO = [
  "Somando o período pedido…",
  "Conferindo loja por loja…",
  "Montando a resposta…",
]
/** Roteiro quando a busca web JÁ disparou de verdade (sinal do servidor). */
const FASES_BUSCANDO = [
  "Pesquisando na web…",
  "Lendo as fontes…",
  "Cruzando com os seus números…",
  "Montando a resposta…",
]

/** Sinais de que a pergunta é sobre o MERCADO/setor (dado externo), não sobre
 *  os números da própria conta — aí o roteiro vira "pesquisando na web". É um
 *  palpite pelo texto da pergunta (o Nino só decide buscar na hora); por isso o
 *  roteiro de mercado fala "pesquisando", nunca "cruzando as lojas". */
const RE_MERCADO =
  /\b(mercad\w*|setor\w*|segmento|categoria|concorr\w+|competidor\w*|tend[êe]nci\w*|benchmark\w*|refer[êe]nci\w*|m[ée]dia\s+do\s+setor|panorama|cen[áa]rio|novidad\w*|not[íi]ci\w*|sazonal\w*|demanda|inflaç\w*|fornecedor\w*|pre[çc]o\s+de\s+mercado|pesquis\w+|busca\w*\s+na\s+web|l[áa]\s+fora|fora\s+(das?|da)\s+(minha|nossa|loja)|outras?\s+lojas|no\s+brasil|no\s+mercado|como\s+est[áa]\s+o\s+setor)\b/i

/** "Pensando" discreto: só a estrelinha girando de um lado pro outro + o estado
 *  atual, sem bolha nem pontinhos. O roteiro se adapta: se a busca web já
 *  disparou (sinal real do servidor), fala "Pesquisando na web…"; senão é um
 *  palpite pelo texto que a realidade sobrescreve (a key `buscando` remonta). */
function PensandoBolha({
  pergunta,
  buscando,
  calculando,
}: {
  pergunta: string
  buscando: boolean
  calculando: boolean
}) {
  const fases = calculando
    ? FASES_CALCULANDO
    : buscando
      ? FASES_BUSCANDO
      : RE_MERCADO.test(pergunta)
        ? FASES_MERCADO
        : FASES_INTERNO
  const [i, setI] = React.useState(0)
  React.useEffect(() => {
    const id = setInterval(
      () => setI((x) => Math.min(x + 1, fases.length - 1)),
      1800,
    )
    return () => clearInterval(id)
  }, [fases.length])
  return (
    <div className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground/80">
      <Sparkles className="nino-wobble size-3.5 text-primary/80" />
      <span>{fases[i]}</span>
    </div>
  )
}

/** Renderiza a resposta do Nino com markdown leve — **negrito**, títulos
 *  (## ou linha em negrito), divisória (---), listas com hífen e TABELAS (| .. |)
 *  — no estilo do Claude. Rede de segurança: mesmo se o modelo mandar uma
 *  tabela ou um ##, sai bonito (não cru). Tolera markdown incompleto (streaming). */
function RichResposta({ texto }: { texto: string }) {
  const blocos: React.ReactNode[] = []
  let bullets: string[] = []
  let tabela: string[] = []

  const fecharBullets = () => {
    if (bullets.length === 0) return
    const itens = [...bullets]
    bullets = []
    blocos.push(
      <ul
        key={`ul-${blocos.length}`}
        className="flex list-disc flex-col gap-1 pl-5 marker:text-muted-foreground/70"
      >
        {itens.map((b, i) => (
          <li key={i}>{inlineNegrito(b)}</li>
        ))}
      </ul>,
    )
  }

  const fecharTabela = () => {
    if (tabela.length === 0) return
    const linhas = tabela
    tabela = []
    const parseRow = (r: string) =>
      r.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim())
    const ehSeparador = (cells: string[]) =>
      cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c))
    const rows = linhas.map(parseRow).filter((cells) => !ehSeparador(cells))
    if (rows.length === 0) return
    const [header, ...body] = rows
    blocos.push(
      <div key={`tbl-${blocos.length}`} className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-border/70">
              {header.map((c, i) => (
                <th
                  key={i}
                  className="px-2 py-1 text-left font-semibold text-foreground"
                >
                  {inlineNegrito(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri} className="border-b border-border/40 last:border-0">
                {row.map((c, ci) => (
                  <td key={ci} className="px-2 py-1 align-top tabular-nums">
                    {inlineNegrito(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    )
  }

  const tituloSecao = (conteudo: React.ReactNode) =>
    blocos.push(
      <p
        key={`h-${blocos.length}`}
        className="font-semibold tracking-tight text-foreground"
      >
        {conteudo}
      </p>,
    )

  for (const linha of texto.split("\n")) {
    const t = linha.trim()
    if (!t) {
      fecharBullets()
      fecharTabela()
      continue
    }
    // Linha de tabela: | ... | (acumula; renderiza quando a tabela acabar).
    if (/^\|.*\|$/.test(t)) {
      fecharBullets()
      tabela.push(t)
      continue
    }
    // Qualquer outra linha encerra a tabela em aberto.
    fecharTabela()
    // Divisória (---, ***, ___).
    if (/^([-*_])\1{2,}$/.test(t)) {
      fecharBullets()
      blocos.push(
        <hr key={`hr-${blocos.length}`} className="my-0.5 border-border/70" />,
      )
      continue
    }
    // Título markdown (#, ##, ###…) → vira título de seção (sem os #).
    const heading = t.match(/^#{1,6}\s+(.+?)\s*$/)
    if (heading) {
      fecharBullets()
      tituloSecao(inlineNegrito(heading[1].replace(/:$/, "")))
      continue
    }
    // Item de lista.
    if (/^[-•]\s+/.test(t)) {
      bullets.push(t.replace(/^[-•]\s+/, ""))
      continue
    }
    fecharBullets()
    // Linha inteira em negrito → título de seção.
    const titulo = t.match(/^\*\*(.+?)\*\*:?$/)
    if (titulo) {
      tituloSecao(titulo[1])
      continue
    }
    blocos.push(
      <p key={`p-${blocos.length}`} className="whitespace-pre-wrap">
        {inlineNegrito(t)}
      </p>,
    )
  }
  fecharBullets()
  fecharTabela()

  return <div className="flex flex-col gap-2">{blocos}</div>
}

/** Parser inline mínimo: transforma **trecho** em negrito. */
function inlineNegrito(s: string): React.ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((parte, i) => {
    const m = parte.match(/^\*\*([^*]+)\*\*$/)
    return m ? (
      <strong key={i} className="font-semibold text-foreground">
        {m[1]}
      </strong>
    ) : (
      <React.Fragment key={i}>{parte}</React.Fragment>
    )
  })
}

/** Ordena: favoritas primeiro, depois mais recentes. */
function ordenar(cs: ConversaResumo[]): ConversaResumo[] {
  return [...cs].sort((a, b) => {
    if (a.favorita !== b.favorita) return a.favorita ? -1 : 1
    return b.atualizadaEm.localeCompare(a.atualizadaEm)
  })
}

function ListaSecao({
  titulo,
  conversas,
  ativaId,
  lojaNome,
  onAbrir,
  onFavoritar,
  onRenomear,
  onVincular,
  onExcluir,
}: {
  titulo?: string
  conversas: ConversaResumo[]
  ativaId: string | null
  lojaNome: (unitId: string | null) => string
  onAbrir: (id: string) => void
  onFavoritar: (c: ConversaResumo) => void
  onRenomear: (c: ConversaResumo) => void
  onVincular: (c: ConversaResumo) => void
  onExcluir: (c: ConversaResumo) => void
}) {
  if (conversas.length === 0) return null
  return (
    <div>
      {titulo && (
        <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {titulo}
        </p>
      )}
      <div className="flex flex-col gap-0.5">
        {conversas.map((c) => (
          <div
            key={c.id}
            className={`group flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors ${
              c.id === ativaId ? "bg-muted" : "hover:bg-muted/60"
            }`}
          >
            <button
              type="button"
              onClick={() => onFavoritar(c)}
              title={c.favorita ? "Desfavoritar" : "Favoritar"}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-amber-500"
            >
              <Star
                className={`size-3.5 ${c.favorita ? "fill-amber-400 text-amber-400" : ""}`}
              />
            </button>
            <button
              type="button"
              onClick={() => onAbrir(c.id)}
              className="min-w-0 flex-1 text-left"
            >
              <span
                className={`block truncate text-xs ${
                  c.id === ativaId ? "font-medium text-foreground" : "text-foreground/80"
                }`}
                title={c.titulo}
              >
                {c.titulo}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Store className="size-2.5" />
                {lojaNome(c.unitId)}
              </span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    title="Opções"
                    className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-background group-hover:opacity-100 data-[popup-open]:opacity-100"
                  >
                    <MoreHorizontal className="size-3.5" />
                  </button>
                }
              />
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => onRenomear(c)}>
                  <Pencil className="size-3.5" />
                  Renomear
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onVincular(c)}>
                  <Store className="size-3.5" />
                  Vincular a…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onExcluir(c)}
                  className="text-rose-600 dark:text-rose-400"
                >
                  <Trash2 className="size-3.5" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>
    </div>
  )
}

function RenomearDialog({
  conversa,
  onClose,
  onSalvar,
}: {
  conversa: ConversaResumo | null
  onClose: () => void
  onSalvar: (id: string, titulo: string) => void
}) {
  return (
    <Dialog open={!!conversa} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Renomear conversa</DialogTitle>
        </DialogHeader>
        {/* key remonta o form por conversa → o defaultValue reinicia sozinho,
            sem precisar de effect + setState. */}
        {conversa && (
          <RenomearForm
            key={conversa.id}
            tituloInicial={conversa.titulo}
            onCancelar={onClose}
            onSalvar={(t) => onSalvar(conversa.id, t)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function RenomearForm({
  tituloInicial,
  onCancelar,
  onSalvar,
}: {
  tituloInicial: string
  onCancelar: () => void
  onSalvar: (titulo: string) => void
}) {
  const ref = React.useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={ref}
        defaultValue={tituloInicial}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSalvar(ref.current?.value ?? "")
        }}
        maxLength={80}
        autoFocus
        className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="button" onClick={() => onSalvar(ref.current?.value ?? "")}>
          Salvar
        </Button>
      </DialogFooter>
    </>
  )
}

function VincularDialog({
  conversa,
  lojas,
  onClose,
  onSalvar,
}: {
  conversa: ConversaResumo | null
  lojas: Loja[]
  onClose: () => void
  onSalvar: (id: string, unitId: string | null) => void
}) {
  return (
    <Dialog open={!!conversa} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Vincular conversa</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Marque se esta conversa é sobre uma loja específica ou sobre o grupo.
        </p>
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          <OpcaoVinculo
            ativo={conversa?.unitId == null}
            label="Grupo (toda a rede)"
            onClick={() => conversa && onSalvar(conversa.id, null)}
          />
          {lojas.map((l) => (
            <OpcaoVinculo
              key={l.id}
              ativo={conversa?.unitId === l.id}
              label={`${l.name} · #${l.code}`}
              onClick={() => conversa && onSalvar(conversa.id, l.id)}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function OpcaoVinculo({
  ativo,
  label,
  onClick,
}: {
  ativo: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
        ativo ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted"
      }`}
    >
      <Store className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}
