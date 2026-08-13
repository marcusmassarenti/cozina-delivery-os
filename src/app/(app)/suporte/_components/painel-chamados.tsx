"use client"

import * as React from "react"
import {
  CheckCircle2,
  Headset,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  Store,
  User,
} from "lucide-react"

import { DeliveryOsMark } from "@/components/delivery-os-logo"
import {
  abrirChamado,
  devolverParaIa,
  listarChamados,
  resolverChamado,
  responderChamado,
  type ChamadoDetalhe,
  type ChamadoResumo,
} from "../_actions"

const ROTULO: Record<ChamadoResumo["status"], string> = {
  aguardando_humano: "Esperando você",
  com_humano: "Com você",
  ia: "Com a IA",
  resolvida: "Resolvida",
}
const COR: Record<ChamadoResumo["status"], string> = {
  aguardando_humano:
    "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  com_humano: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  ia: "bg-muted text-muted-foreground",
  resolvida:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
}

function quando(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000)
  if (min < 1) return "agora"
  if (min < 60) return `${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}

export function PainelChamados({ inicial }: { inicial: ChamadoResumo[] }) {
  const [fila, setFila] = React.useState(inicial)
  const [verResolvidas, setVerResolvidas] = React.useState(false)
  const [sel, setSel] = React.useState<ChamadoDetalhe | null>(null)
  const [carregando, setCarregando] = React.useState(false)
  const [resposta, setResposta] = React.useState("")
  const [enviando, setEnviando] = React.useState(false)
  const fim = React.useRef<HTMLDivElement>(null)

  const recarregar = React.useCallback(async () => {
    setFila(await listarChamados(verResolvidas))
  }, [verResolvidas])

  React.useEffect(() => {
    void recarregar()
  }, [recarregar])

  // A fila se atualiza sozinha a cada 30s. Sem isso, quem deixa a tela aberta
  // não vê o chamado novo entrar — e a demora vira culpa do sistema.
  React.useEffect(() => {
    const t = setInterval(() => void recarregar(), 30_000)
    return () => clearInterval(t)
  }, [recarregar])

  React.useEffect(() => {
    fim.current?.scrollIntoView()
  }, [sel?.mensagens.length])

  async function abrir(id: string) {
    setCarregando(true)
    setResposta("")
    setSel(await abrirChamado(id))
    setCarregando(false)
    void recarregar()
  }

  /**
   * Envia e já mostra. Reabrir o chamado só pra ver a própria frase custaria o
   * raio-x inteiro de novo (segundos) — e nesse intervalo a tela fica como se
   * nada tivesse sido enviado, que é quando a pessoa clica duas vezes.
   */
  async function responder() {
    const msg = resposta.trim()
    if (!msg || !sel || enviando) return
    setEnviando(true)
    const r = await responderChamado(sel.id, msg)
    setEnviando(false)
    if (!r.ok) return
    setResposta("")
    setSel((s) =>
      s && s.id === sel.id
        ? {
            ...s,
            status: "com_humano",
            mensagens: [
              ...s.mensagens,
              {
                id: `local-${s.mensagens.length}`,
                autor: "equipe",
                texto: msg,
                criadaEm: new Date().toISOString(),
              },
            ],
          }
        : s,
    )
    void recarregar()
  }

  const esperando = fila.filter((c) => c.status === "aguardando_humano").length
  const abertos = fila.filter((c) => c.status !== "resolvida").length
  // "Nada na fila" só quando não há NADA aberto. Com um chamado na tela e o
  // título dizendo que está vazio, o título é que fica errado.
  const titulo =
    esperando > 0
      ? `${esperando} esperando você`
      : abertos > 0
        ? `${abertos} em aberto`
        : "Nada na fila"

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      {/* Fila */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {titulo}
          </p>
          <button
            type="button"
            onClick={() => setVerResolvidas((v) => !v)}
            className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {verResolvidas ? "esconder resolvidas" : "ver resolvidas"}
          </button>
        </div>

        <div className="flex max-h-[calc(100vh-13rem)] flex-col gap-1.5 overflow-y-auto pr-1">
          {fila.length === 0 && (
            <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              Nenhum chamado aberto.
            </p>
          )}
          {fila.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => void abrir(c.id)}
              className={`rounded-lg border p-2.5 text-left transition-colors hover:bg-muted ${
                sel?.id === c.id ? "border-primary bg-primary/5" : "bg-card"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {c.empresa}
                </span>
                {c.naoLida && c.status !== "resolvida" && (
                  <span className="size-2 shrink-0 rounded-full bg-rose-500" />
                )}
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {quando(c.ultimaMsgEm)}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                {c.ultimoAutor === "cliente" ? "" : "↩ "}
                {c.ultimoTexto ?? "(sem mensagem)"}
              </p>
              <span
                className={`mt-1.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium ${COR[c.status]}`}
              >
                {ROTULO[c.status]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Conversa + raio-x */}
      <div className="flex min-h-[520px] flex-col rounded-xl border bg-card">
        {carregando && (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!carregando && !sel && (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 p-8 text-center">
            <Headset className="size-7 text-muted-foreground" />
            <p className="text-sm font-medium">Escolha um chamado</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Você vê a conversa e, ao lado, o estado real da conta do cliente —
              sem precisar perguntar de volta.
            </p>
          </div>
        )}

        {!carregando && sel && (
          <>
            <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
              <Store className="size-4 text-muted-foreground" />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                {sel.empresa}
              </p>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${COR[sel.status]}`}
              >
                {ROTULO[sel.status]}
              </span>
              {sel.status !== "resolvida" && (
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      await resolverChamado(sel.id)
                      setSel(await abrirChamado(sel.id))
                      void recarregar()
                    }}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-muted"
                  >
                    <CheckCircle2 className="size-3.5" /> Resolver
                  </button>
                  {sel.status === "com_humano" && (
                    <button
                      type="button"
                      onClick={async () => {
                        await devolverParaIa(sel.id)
                        setSel(await abrirChamado(sel.id))
                        void recarregar()
                      }}
                      title="Devolve o atendimento pra IA"
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted"
                    >
                      <RotateCcw className="size-3.5" /> Devolver à IA
                    </button>
                  )}
                </>
              )}
            </header>

            {/* Raio-x: o que dispensa perguntar "qual loja?" de volta. */}
            {sel.raioX && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1 font-medium text-foreground">
                  <Sparkles className="size-3" /> Estado agora
                </span>
                <span>plano {sel.raioX.plano ?? "trial"}</span>
                <span>· cobrança {sel.raioX.cobranca.status}</span>
                <span>
                  · {sel.raioX.lojas.ativas}/{sel.raioX.lojas.total} lojas ativas
                </span>
                <span>· {sel.raioX.lojas.conectadasIfood} no iFood por API</span>
                {sel.raioX.detalhe.some((d) => d.aguardandoIfood) && (
                  <span className="text-amber-700 dark:text-amber-400">
                    ·{" "}
                    {sel.raioX.detalhe.filter((d) => d.aguardandoIfood).length}{" "}
                    aguardando o iFood
                  </span>
                )}
                {sel.raioX.revogadas.length > 0 && (
                  <span className="font-medium text-rose-700 dark:text-rose-400">
                    · {sel.raioX.revogadas.length} revogada(s)
                  </span>
                )}
              </div>
            )}

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {sel.mensagens.map((m) => (
                <div
                  key={m.id}
                  className={`flex gap-2 ${m.autor === "equipe" ? "justify-end" : ""}`}
                >
                  {m.autor !== "equipe" && (
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
                      {m.autor === "cliente" ? (
                        <User className="size-3.5" />
                      ) : (
                        <DeliveryOsMark className="size-4" />
                      )}
                    </span>
                  )}
                  <div
                    className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                      m.autor === "equipe"
                        ? "bg-primary text-primary-foreground"
                        : m.autor === "cliente"
                          ? "border bg-background"
                          : "bg-muted"
                    }`}
                  >
                    {/* A origem tem que ser literal. "Ajuda" é resposta pronta
                        do catálogo; "IA" só existe no histórico de antes da
                        virada. Rotular errado esconde justamente a informação
                        que importa quando uma resposta sai errada. */}
                    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider opacity-60">
                      {m.autor === "cliente"
                        ? "Cliente"
                        : m.autor === "ajuda"
                          ? "Ajuda"
                          : m.autor === "ia"
                            ? "IA"
                            : "Você"}{" "}
                      · {quando(m.criadaEm)}
                    </span>
                    {m.texto}
                  </div>
                </div>
              ))}
              <div ref={fim} />
            </div>

            {sel.status !== "resolvida" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void responder()
                }}
                className="flex items-end gap-2 border-t p-2.5"
              >
                <textarea
                  value={resposta}
                  onChange={(e) => setResposta(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      void responder()
                    }
                  }}
                  rows={2}
                  placeholder="Responder ao cliente...  (⌘+Enter envia)"
                  className="max-h-32 min-h-[52px] flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-[13px] outline-none placeholder:text-muted-foreground focus:border-ring"
                />
                <button
                  type="submit"
                  disabled={!resposta.trim() || enviando}
                  className="btn-brand flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-lg disabled:opacity-40"
                  aria-label="Enviar"
                >
                  {enviando ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}
