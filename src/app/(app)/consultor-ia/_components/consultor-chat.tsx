"use client"

import * as React from "react"
import {
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
  perguntar,
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
]

export function ConsultorChat({
  conversasIniciais,
  restantesIniciais,
  lojas,
  pacote,
}: {
  conversasIniciais: ConversaResumo[]
  restantesIniciais: number
  lojas: Loja[]
  pacote: { preco: number; tamanho: number }
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
  // Diálogos compartilhados (renomear / vincular).
  const [renomeando, setRenomeando] = React.useState<ConversaResumo | null>(null)
  const [vinculando, setVinculando] = React.useState<ConversaResumo | null>(null)
  // Compra do pacote (Fase 2).
  const [comprando, setComprando] = React.useState(false)
  const [avisoCompra, setAvisoCompra] = React.useState<string | null>(null)
  const fimRef = React.useRef<HTMLDivElement>(null)

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
  }, [messages, pending])

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
    const r = await perguntar(ativaId, novo)
    setPending(false)
    if (r.ok) {
      setMessages([...novo, { role: "assistant", content: r.resposta }])
      setRestantes((n) => Math.max(0, n - 1))
      setConversas((atual) => {
        const anterior = atual.find((c) => c.id === r.conversaId)
        const semEla = atual.filter((c) => c.id !== r.conversaId)
        return ordenar([
          {
            id: r.conversaId,
            titulo: r.titulo,
            atualizadaEm: new Date().toISOString(),
            favorita: anterior?.favorita ?? false,
            unitId: anterior?.unitId ?? null,
          },
          ...semEla,
        ])
      })
      setAtivaId(r.conversaId)
    } else {
      setMessages(messages)
      setInput(pergunta)
      if (r.bloqueado) setBloqueado(true)
      else setErro(r.mensagem)
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
        <div className="flex shrink-0 items-center justify-between gap-2 border-b pb-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">
              {conversaAtiva ? conversaAtiva.titulo : "Nova conversa"}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <Store className="size-2.5" />
              {lojaNome(conversaAtiva?.unitId ?? null)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
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
            {/* Comprar antes de acabar: só aparece quando a cota está baixa. */}
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
          </div>
        </div>
        {avisoCompra && (
          <p className="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400">
            {avisoCompra}
          </p>
        )}

        {bloqueado ? (
          <div className="rounded-xl border bg-card p-6 text-center">
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
            <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border bg-card p-4">
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
                    Eu respondo com os números reais das suas lojas.
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
              <div className="shrink-0 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
                {erro}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                void enviar(input)
              }}
              className="flex shrink-0 items-end gap-2"
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
