"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { CheckCircle2, Plus, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SeletorBusca } from "@/components/shared/seletor-busca"
import { TIPOS, type Atendimento } from "@/lib/data/atendimentos-tipos"

import {
  abrirAtendimento,
  alternarResolvido,
  registrarPasso,
  type AtendimentoState,
} from "../_actions"

export type LojaSimples = { id: string; code: string; name: string }

const INICIAL: AtendimentoState = { ok: false }

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })

export function AtendimentosView({
  atendimentos,
  lojas,
  mostrandoResolvidos,
}: {
  atendimentos: Atendimento[]
  lojas: LojaSimples[]
  mostrandoResolvidos: boolean
}) {
  const router = useRouter()
  const [busca, setBusca] = React.useState("")
  const [tipo, setTipo] = React.useState("")

  const filtrados = atendimentos.filter((a) => {
    if (tipo && a.tipo !== tipo) return false
    if (!busca.trim()) return true
    const q = busca.trim().toLowerCase()
    return `${a.code} ${a.loja} ${a.titulo}`.toLowerCase().includes(q)
  })

  const abertos = atendimentos.filter((a) => !a.resolvidoEm).length

  return (
    <div className="flex flex-col gap-4">
      <span data-tour="at-abrir">
        <Abrir lojas={lojas} />
      </span>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por loja ou assunto"
          className="h-9 min-w-[200px] flex-1 rounded-md border bg-background px-2.5 text-xs outline-none focus:border-ring sm:max-w-xs"
        />
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
        >
          <option value="">Todos os tipos</option>
          {TIPOS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-md border bg-card px-2.5 py-2 text-xs">
          <input
            type="checkbox"
            checked={mostrandoResolvidos}
            onChange={(e) =>
              router.push(
                `/carteira/atendimentos${e.target.checked ? "?resolvidos=1" : ""}`,
              )
            }
            className="size-3.5"
          />
          Mostrar resolvidos
        </label>
        <span className="text-xs text-muted-foreground">
          {filtrados.length} de {atendimentos.length}
          {mostrandoResolvidos && ` · ${abertos} em aberto`}
        </span>
      </div>

      {filtrados.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          {atendimentos.length === 0
            ? "Nenhum atendimento aberto. Registre o primeiro acima."
            : "Nenhum atendimento com esses filtros."}
        </div>
      ) : (
        <div data-tour="at-lista" className="flex flex-col gap-4">
          {filtrados.map((a) => (
            <Cartao key={a.id} a={a} />
          ))}
        </div>
      )}
    </div>
  )
}

function Cartao({ a }: { a: Atendimento }) {
  const [aberto, setAberto] = React.useState(false)
  const resolvido = a.resolvidoEm !== null

  return (
    <div
      className={`rounded-xl border bg-card ${resolvido ? "opacity-70" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {a.tipoLabel}
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-sm font-medium">{a.titulo}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            #{a.code} {a.loja}
          </span>
        </span>
        <span
          className={`text-xs tabular-nums ${
            resolvido
              ? "text-emerald-600 dark:text-emerald-400"
              : a.dias > 7
                ? "text-amber-700 dark:text-amber-400"
                : "text-muted-foreground"
          }`}
        >
          {resolvido
            ? `resolvido em ${a.dias}d`
            : a.dias === 0
              ? "aberto hoje"
              : `${a.dias}d em aberto`}
        </span>
        <span className="text-xs text-muted-foreground">
          {a.passos.length} passo{a.passos.length === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={() => setAberto((x) => !x)}
          className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {aberto ? "fechar" : "ver histórico"}
        </button>
        <Resolver id={a.id} resolvido={resolvido} />
      </div>

      {aberto && (
        <div className="border-t px-4 py-3">
          {a.passos.length === 0 ? (
            <p className="mb-3 text-xs text-muted-foreground">
              Nenhum passo registrado ainda.
            </p>
          ) : (
            <ol className="mb-3 flex flex-col gap-2">
              {a.passos.map((p) => (
                <li key={p.id} className="flex gap-2 text-xs">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                  <span className="min-w-0">
                    <span className="whitespace-pre-wrap">{p.texto}</span>
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      {p.autorNome ? `${p.autorNome} · ` : ""}
                      {quando(p.criadoEm)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          <NovoPasso atendimentoId={a.id} />
          {/* Dito na tela porque muda como a pessoa escreve: sabendo que não
              dá pra editar, ela escreve o passo certo da primeira vez. */}
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            O histórico não se edita. Errou? Escreva um passo novo corrigindo.
          </p>
        </div>
      )}
    </div>
  )
}

function Abrir({ lojas }: { lojas: LojaSimples[] }) {
  const [state, action] = useActionState(abrirAtendimento, INICIAL)
  const [mostrar, setMostrar] = React.useState(false)
  const router = useRouter()
  const ref = React.useRef<HTMLFormElement>(null)

  React.useEffect(() => {
    if (state.ok) {
      ref.current?.reset()
      setMostrar(false)
      router.refresh()
    }
  }, [state.ok, router])

  if (!mostrar) {
    return (
      <div>
        <Button size="sm" onClick={() => setMostrar(true)}>
          <Plus className="size-3.5" /> Abrir atendimento
        </Button>
      </div>
    )
  }

  return (
    <form
      ref={ref}
      action={action}
      className="flex flex-col gap-2 rounded-xl border bg-card p-3"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <SeletorBusca
          name="unitId"
          opcoes={lojas.map((l) => ({ id: l.id, rotulo: l.name, detalhe: l.code }))}
          placeholder="Escolha a loja…"
          vazio={null}
          obrigatorio
        />
        <select
          name="tipo"
          defaultValue="cardapio"
          className="h-9 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
        >
          {TIPOS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <input
        name="titulo"
        required
        placeholder="O que está sendo feito (ex.: revisar fotos do cardápio)"
        className="h-9 rounded-md border bg-background px-2.5 text-xs outline-none focus:border-ring"
      />
      <textarea
        name="passo"
        rows={2}
        placeholder="Primeiro passo (opcional)"
        className="rounded-md border bg-background px-2.5 py-2 text-xs outline-none focus:border-ring"
      />
      {state.error && (
        <p className="text-[11px] text-rose-600">{state.error}</p>
      )}
      <div className="flex gap-2">
        <Enviar rotulo="Abrir" />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setMostrar(false)}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}

function NovoPasso({ atendimentoId }: { atendimentoId: string }) {
  const [state, action] = useActionState(registrarPasso, INICIAL)
  const router = useRouter()
  const ref = React.useRef<HTMLFormElement>(null)

  React.useEffect(() => {
    if (state.ok) {
      ref.current?.reset()
      router.refresh()
    }
  }, [state.ok, router])

  return (
    <form ref={ref} action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="atendimentoId" value={atendimentoId} />
      <textarea
        name="texto"
        rows={2}
        required
        placeholder="Registrar um passo…"
        className="rounded-md border bg-background px-2.5 py-2 text-xs outline-none focus:border-ring"
      />
      {state.error && <p className="text-[11px] text-rose-600">{state.error}</p>}
      <div>
        <Enviar rotulo="Registrar" />
      </div>
    </form>
  )
}

function Resolver({ id, resolvido }: { id: string; resolvido: boolean }) {
  const [state, action] = useActionState(alternarResolvido, INICIAL)
  const router = useRouter()
  React.useEffect(() => {
    if (state.ok) router.refresh()
  }, [state.ok, router])

  return (
    <form action={action}>
      <input type="hidden" name="atendimentoId" value={id} />
      <input type="hidden" name="resolver" value={resolvido ? "0" : "1"} />
      <BotaoResolver resolvido={resolvido} />
    </form>
  )
}

function BotaoResolver({ resolvido }: { resolvido: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-muted disabled:opacity-60"
    >
      {resolvido ? (
        <>
          <RotateCcw className="size-3" /> Reabrir
        </>
      ) : (
        <>
          <CheckCircle2 className="size-3" /> Resolver
        </>
      )}
    </button>
  )
}

function Enviar({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando…" : rotulo}
    </Button>
  )
}
