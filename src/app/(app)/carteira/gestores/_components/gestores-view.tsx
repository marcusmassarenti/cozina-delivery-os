"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { AlertTriangle, Plus, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { fmtBRL, fmtNum } from "@/lib/format"
import type { GestorNoRanking } from "@/lib/data/carteira"

import { atribuirLoja, criarGestor, type GestorState } from "../_actions"

export type LojaDaCarteira = {
  id: string
  code: string
  name: string
  gestorId: string | null
  ativa: boolean
}

/**
 * Ranking de gestores e atribuição de lojas.
 *
 * A tela existe pra responder duas perguntas que a agência faz toda semana:
 * "quem cuida do quê" e "quanto cada um traz". A segunda vira bonificação —
 * foi o motivo declarado dela existir no painel que a DG Foods construiu.
 */
export function GestoresView({
  gestores,
  lojas,
  periodo,
}: {
  gestores: GestorNoRanking[]
  lojas: LojaDaCarteira[]
  periodo: string
}) {
  const total = gestores.reduce((s, g) => s + g.bruto, 0)
  const semGestor = lojas.filter((l) => !l.gestorId)

  return (
    <div className="flex flex-col gap-4">
      <NovoGestor />

      {semGestor.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50/60 px-3 py-2 text-xs dark:border-amber-900/50 dark:bg-amber-950/25">
          <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
          <span className="text-amber-900 dark:text-amber-300">
            <strong>{semGestor.length}</strong>{" "}
            {semGestor.length === 1 ? "loja está" : "lojas estão"} sem gestor —{" "}
            {semGestor.length === 1 ? "ela não entra" : "elas não entram"} em
            ranking nenhum.
          </span>
        </div>
      )}

      {gestores.length === 0 ? (
        <p className="rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          Nenhum gestor cadastrado. Comece criando um acima.
        </p>
      ) : (
        gestores.map((g, i) => (
          <CardGestor
            key={g.id}
            gestor={g}
            posicao={i + 1}
            fatia={total > 0 ? (g.bruto / total) * 100 : 0}
            lojas={lojas}
            periodo={periodo}
          />
        ))
      )}
    </div>
  )
}

function CardGestor({
  gestor: g,
  posicao,
  fatia,
  lojas,
  periodo,
}: {
  gestor: GestorNoRanking
  posicao: number
  fatia: number
  lojas: LojaDaCarteira[]
  periodo: string
}) {
  const [aberto, setAberto] = React.useState(false)
  const minhas = lojas.filter((l) => l.gestorId === g.id)

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold tabular-nums text-muted-foreground">
          {posicao}
        </span>
        <span className="flex min-w-[150px] flex-1 items-center gap-2">
          <UserRound className="size-4 text-muted-foreground" />
          <span className="font-medium">{g.nome}</span>
          {!g.ativo && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
              inativo
            </span>
          )}
        </span>

        <Metrica rotulo={periodo} valor={fmtBRL(g.bruto)} destaque />
        <Metrica rotulo="lojas" valor={`${g.lojasAtivas}/${g.lojas}`} />
        <Metrica rotulo="pedidos" valor={fmtNum(g.pedidos)} />
        <Metrica
          rotulo="em carteira"
          valor={g.diasMedios === null ? "—" : `${meses(g.diasMedios)}`}
        />
        {/* Semanas pendentes mede o TRABALHO, não o resultado: um gestor pode
            estar num mês bom e não ter escrito comentário nenhum. */}
        <Metrica
          rotulo="semanas em aberto"
          valor={fmtNum(g.semanasPendentes)}
          alerta={g.semanasPendentes > 0}
        />

        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {aberto ? "fechar" : "ver carteira"}
        </button>
      </div>

      {fatia > 0 && (
        <div className="mx-4 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${fatia}%` }} />
        </div>
      )}

      {aberto && (
        <div className="mt-3 border-t px-4 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {minhas.length === 0
              ? "Sem lojas na carteira"
              : `${minhas.length} loja${minhas.length > 1 ? "s" : ""}`}
          </p>
          <ul className="mb-3 flex flex-col gap-1">
            {minhas.map((l) => (
              <li key={l.id} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-muted-foreground">#{l.code}</span>{" "}
                  {l.name}
                  {!l.ativa && (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      (inativa)
                    </span>
                  )}
                </span>
                <FormLoja unitId={l.id} gestorId="" rotulo="tirar" />
              </li>
            ))}
          </ul>
          <AdicionarLoja gestorId={g.id} lojas={lojas} />
        </div>
      )}
    </div>
  )
}

/** 75 dias vira "2 meses e 15 dias" — dia solto acima de um mês não se lê. */
function meses(dias: number): string {
  if (dias < 30) return `${dias}d`
  const m = Math.floor(dias / 30)
  const d = dias % 30
  return d === 0 ? `${m} ${m === 1 ? "mês" : "meses"}` : `${m}m ${d}d`
}

function Metrica({
  rotulo,
  valor,
  destaque,
  alerta,
}: {
  rotulo: string
  valor: string
  destaque?: boolean
  alerta?: boolean
}) {
  return (
    <span className="flex min-w-[76px] flex-col">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </span>
      <span
        className={`tabular-nums ${destaque ? "text-sm font-semibold" : "text-xs"} ${
          alerta ? "text-amber-700 dark:text-amber-400" : ""
        }`}
      >
        {valor}
      </span>
    </span>
  )
}

function AdicionarLoja({
  gestorId,
  lojas,
}: {
  gestorId: string
  lojas: LojaDaCarteira[]
}) {
  const [escolhida, setEscolhida] = React.useState("")
  const livres = lojas.filter((l) => !l.gestorId)
  if (livres.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Todas as lojas já têm gestor.
      </p>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={escolhida}
        onChange={(e) => setEscolhida(e.target.value)}
        className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring sm:max-w-[280px]"
      >
        <option value="">Adicionar loja à carteira…</option>
        {livres.map((l) => (
          <option key={l.id} value={l.id}>
            {l.code} — {l.name}
          </option>
        ))}
      </select>
      {escolhida && (
        <FormLoja unitId={escolhida} gestorId={gestorId} rotulo="adicionar" />
      )}
    </div>
  )
}

function FormLoja({
  unitId,
  gestorId,
  rotulo,
}: {
  unitId: string
  gestorId: string
  rotulo: string
}) {
  const [estado, acao] = useActionState<GestorState, FormData>(atribuirLoja, {
    ok: false,
  })
  return (
    <form action={acao} className="inline-flex items-center gap-1">
      <input type="hidden" name="unitId" value={unitId} />
      <input type="hidden" name="gestorId" value={gestorId} />
      <BotaoInline rotulo={rotulo} />
      {estado.error && (
        <span className="text-[10px] text-rose-600">{estado.error}</span>
      )}
    </form>
  )
}

function BotaoInline({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded border px-2 py-1 text-[10px] font-medium transition-colors hover:bg-muted disabled:opacity-50"
    >
      {pending ? "…" : rotulo}
    </button>
  )
}

function NovoGestor() {
  const [estado, acao] = useActionState<GestorState, FormData>(criarGestor, {
    ok: false,
  })
  const ref = React.useRef<HTMLFormElement>(null)
  React.useEffect(() => {
    if (estado.ok) ref.current?.reset()
  }, [estado.ok])

  return (
    <form
      ref={ref}
      action={acao}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2"
    >
      <input
        name="nome"
        placeholder="Nome do gestor"
        className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring sm:max-w-[260px]"
      />
      <NovoBtn />
      {estado.error && (
        <span className="text-xs text-rose-600">{estado.error}</span>
      )}
      {estado.ok && estado.message && (
        <span className="text-xs text-emerald-700 dark:text-emerald-400">
          {estado.message}
        </span>
      )}
    </form>
  )
}

function NovoBtn() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" className="h-8 gap-1 text-xs" disabled={pending}>
      <Plus className="size-3" />
      {pending ? "…" : "Criar gestor"}
    </Button>
  )
}
