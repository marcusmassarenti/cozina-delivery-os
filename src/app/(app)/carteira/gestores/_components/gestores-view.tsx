"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { AlertTriangle, Plus, Search, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { fmtBRL, fmtNum } from "@/lib/format"
import type { GestorNoRanking } from "@/lib/data/carteira"

import { atribuirLoja, criarGestor, type GestorState } from "../_actions"

const MEDALHA = ["🥇", "🥈", "🥉"]

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
  const [busca, setBusca] = React.useState("")
  /* Canceladas ENTRAM por padrão: é a régua do portal, a mesma do resto do
     sistema (bruto = a cesta que passou pelo balcão). O botão existe pra
     responder "e quanto virou venda de verdade?", não pra escolher número. */
  const [comCanceladas, setComCanceladas] = React.useState(true)

  const valor = React.useCallback(
    (g: GestorNoRanking) => (comCanceladas ? g.bruto : g.bruto - g.canceladas),
    [comCanceladas],
  )

  const ordenados = React.useMemo(
    () => [...gestores].sort((a, b) => valor(b) - valor(a)),
    [gestores, valor],
  )
  const filtrados = React.useMemo(() => {
    const q = busca.trim().toLowerCase()
    return q ? ordenados.filter((g) => g.nome.toLowerCase().includes(q)) : ordenados
  }, [ordenados, busca])

  const total = ordenados.reduce((s, g) => s + valor(g), 0)
  const semGestor = lojas.filter((l) => !l.gestorId)
  const canceladas = gestores.reduce((s, g) => s + g.canceladas, 0)

  return (
    <div className="flex flex-col gap-4">
      <Resumo
        gestores={gestores}
        lojas={lojas}
        total={total}
        periodo={periodo}
        comCanceladas={comCanceladas}
      />

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
        <>
          <Podio gestores={ordenados} valor={valor} />

          <Comparativo gestores={ordenados} valor={valor} />

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar gestor"
                className="h-9 w-full rounded-md border bg-background pl-8 pr-2 text-xs outline-none focus:border-ring"
              />
            </div>
            <label
              data-tour="gestores-canceladas"
              className="flex cursor-pointer items-center gap-1.5 rounded-md border bg-card px-2.5 py-2 text-xs"
              title={
                canceladas > 0
                  ? "Cancelado só é informado pelo iFood — 99, Keeta e Cardápio Web não mandam esse número."
                  : "Nenhum cancelamento informado no período."
              }
            >
              <input
                type="checkbox"
                checked={comCanceladas}
                onChange={(e) => setComCanceladas(e.target.checked)}
                className="size-3.5"
              />
              Incluir canceladas
              {canceladas > 0 && (
                <span className="text-muted-foreground tabular-nums">
                  ({fmtBRL(canceladas)})
                </span>
              )}
            </label>
            {busca && (
              <span className="text-xs text-muted-foreground">
                {filtrados.length} de {gestores.length}
              </span>
            )}
          </div>

          {!comCanceladas && (
            /* Dito na tela, não só no código: só o iFood informa cancelamento,
               então este número NÃO é "venda válida da rede". Rotular assim
               seria inventar precisão que os outros canais não deram. */
            <p className="-mt-1 text-[11px] text-muted-foreground">
              Sem as canceladas do iFood. As outras plataformas não informam
              cancelamento, então o número delas continua inteiro.
            </p>
          )}

          {filtrados.length === 0 ? (
            <p className="rounded-xl border border-dashed bg-card px-4 py-8 text-center text-sm text-muted-foreground">
              Nenhum gestor com esse nome.
            </p>
          ) : (
            filtrados.map((g) => (
              <CardGestor
                key={g.id}
                gestor={g}
                posicao={ordenados.indexOf(g) + 1}
                valor={valor(g)}
                fatia={total > 0 ? (valor(g) / total) * 100 : 0}
                lojas={lojas}
                periodo={periodo}
              />
            ))
          )}
        </>
      )}
    </div>
  )
}

function CardGestor({
  gestor: g,
  posicao,
  valor,
  fatia,
  lojas,
  periodo,
}: {
  gestor: GestorNoRanking
  posicao: number
  valor: number
  fatia: number
  lojas: LojaDaCarteira[]
  periodo: string
}) {
  const [aberto, setAberto] = React.useState(false)
  const minhas = lojas.filter((l) => l.gestorId === g.id)

  return (
    <div
      data-tour="gestores-lista"
      className={`rounded-xl border bg-card ${
        posicao === 1 ? "border-amber-300 dark:border-amber-700" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        {/* Medalha nos três primeiros, número nos outros — a mesma régua da
            tela do Comercial, pra as duas competições da agência se lerem
            igual. */}
        <span
          className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold tabular-nums ${
            posicao <= 3
              ? "bg-transparent text-base"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {posicao <= 3 ? MEDALHA[posicao - 1] : posicao}
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

        <Metrica rotulo={periodo} valor={fmtBRL(valor)} destaque />
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
          <div
            className={`h-full ${posicao === 1 ? "bg-amber-500" : "bg-primary"}`}
            style={{ width: `${fatia}%` }}
          />
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

/**
 * Os números do topo — o que a agência olha antes de olhar gestor nenhum.
 *
 * Vem ANTES do ranking de propósito: "quanto a carteira toda fez" é a
 * pergunta que enquadra "quem fez quanto". Sem isso, o primeiro colocado
 * parece grande ou pequeno sem régua nenhuma.
 */
function Resumo({
  gestores,
  lojas,
  total,
  periodo,
  comCanceladas,
}: {
  gestores: GestorNoRanking[]
  lojas: LojaDaCarteira[]
  total: number
  periodo: string
  comCanceladas: boolean
}) {
  const ativos = gestores.filter((g) => g.ativo).length
  const comCarteira = gestores.filter((g) => g.lojas > 0).length
  const emCarteira = lojas.filter((l) => l.gestorId).length
  const pendentes = gestores.reduce((s, g) => s + g.semanasPendentes, 0)

  return (
    <div data-tour="gestores-kpis" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi
        rotulo={`Faturamento · ${periodo}`}
        valor={fmtBRL(total)}
        nota={comCanceladas ? "com canceladas" : "sem as canceladas do iFood"}
        destaque
      />
      <Kpi
        rotulo="Gestores"
        valor={fmtNum(ativos)}
        /* Gestor ativo SEM carteira é o alarme silencioso desta tela: ele
           existe na folha e não aparece em ranking nenhum. */
        nota={
          ativos - comCarteira > 0
            ? `${ativos - comCarteira} sem nenhuma loja`
            : "todos com carteira"
        }
        alerta={ativos - comCarteira > 0}
      />
      <Kpi
        rotulo="Lojas em carteira"
        valor={`${emCarteira}/${lojas.length}`}
        nota={
          lojas.length - emCarteira > 0
            ? `${lojas.length - emCarteira} sem gestor`
            : "todas atribuídas"
        }
        alerta={lojas.length - emCarteira > 0}
      />
      <Kpi
        rotulo="Semanas em aberto"
        valor={fmtNum(pendentes)}
        nota={pendentes > 0 ? "comentário não escrito" : "tudo em dia"}
        alerta={pendentes > 0}
      />
    </div>
  )
}

function Kpi({
  rotulo,
  valor,
  nota,
  destaque,
  alerta,
}: {
  rotulo: string
  valor: string
  nota: string
  destaque?: boolean
  alerta?: boolean
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border bg-card px-4 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </span>
      <span
        className={`tabular-nums ${destaque ? "text-xl font-semibold" : "text-lg font-semibold"}`}
      >
        {valor}
      </span>
      <span
        className={`text-[11px] ${alerta ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
      >
        {nota}
      </span>
    </div>
  )
}

/**
 * Comparativo entre gestores.
 *
 * Barra proporcional ao MAIOR, não ao total: com seis gestores a fatia de
 * cada um vira um toco de 16% e o gráfico deixa de comparar qualquer coisa.
 * Contra o líder, a diferença entre o segundo e o terceiro se enxerga.
 */
function Comparativo({
  gestores,
  valor,
}: {
  gestores: GestorNoRanking[]
  valor: (g: GestorNoRanking) => number
}) {
  const maior = Math.max(...gestores.map(valor), 0)
  if (maior <= 0) return null

  return (
    <div data-tour="gestores-comparativo" className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Comparativo
      </p>
      {gestores.map((g) => {
        const v = valor(g)
        return (
          <div key={g.id} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-xs" title={g.nome}>
              {g.nome}
            </span>
            <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
              <div
                className="h-full rounded bg-primary transition-[width]"
                style={{ width: `${(v / maior) * 100}%` }}
              />
            </div>
            <span className="w-28 shrink-0 text-right text-xs font-medium tabular-nums">
              {fmtBRL(v)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Pódio dos três primeiros.
 *
 * Repete números que já estão no ranking logo abaixo, e é de propósito: o
 * ranking responde "onde eu estou", o pódio responde "quem ganhou" — e a
 * segunda é a pergunta que faz a tela ser aberta na segunda-feira. Mesmo
 * desenho da tela do Comercial, porque é a mesma competição em outra moeda.
 */
function Podio({
  gestores,
  valor,
}: {
  gestores: GestorNoRanking[]
  valor: (g: GestorNoRanking) => number
}) {
  const tres = gestores.filter((g) => valor(g) > 0).slice(0, 3)
  if (tres.length === 0) return null

  const cores = [
    "border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/20",
    "border-slate-300 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-900/30",
    "border-orange-300 bg-orange-50/40 dark:border-orange-800 dark:bg-orange-950/20",
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {tres.map((g, i) => (
        <div
          key={g.id}
          className={`flex flex-col gap-0.5 rounded-xl border px-4 py-3 ${cores[i]}`}
        >
          <span className="text-lg leading-none">{MEDALHA[i]}</span>
          <span className="mt-1 truncate text-sm font-semibold">{g.nome}</span>
          <span className="text-xl font-semibold tabular-nums">
            {fmtBRL(valor(g))}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {g.lojasAtivas}/{g.lojas} loja{g.lojas === 1 ? "" : "s"} ·{" "}
            {fmtNum(g.pedidos)} pedidos
          </span>
        </div>
      ))}
    </div>
  )
}
