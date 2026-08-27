"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Check, Link2, Link2Off, PlayCircle, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import {
  linkMerchantToUnit,
  refreshMerchants,
  unlinkMerchant,
  type LinkMerchantState,
  type RefreshMerchantsState,
} from "../_actions"

type UnitOption = {
  id: string
  code: string
  name: string
  /** Dono da loja. Sem ele o admin escolhia às cegas entre todas as unidades. */
  holdingId?: string
  holdingName?: string
}

export type DonoSugerido = {
  id: string
  name: string
  /** Força da pista: CNPJ completo, raiz do CNPJ, ou razão social. */
  via: "cnpj" | "raiz" | "razao"
}

export function LinkRow({
  merchantId,
  currentUnitId,
  units,
  holdingSugerido,
  holdings = [],
}: {
  merchantId: string
  currentUnitId: string | null
  units: UnitOption[]
  /** Cliente deduzido do merchant (CNPJ, raiz do CNPJ ou razão social). */
  holdingSugerido?: DonoSugerido | null
  /** Todos os clientes — para quando a dedução falha ou está errada. */
  holdings?: { id: string; name: string }[]
}) {
  const [linkState, linkAction] = useActionState<LinkMerchantState, FormData>(
    linkMerchantToUnit,
    { ok: false },
  )
  const [unlinkState, unlinkAction] = useActionState<LinkMerchantState, FormData>(
    unlinkMerchant,
    { ok: false },
  )
  const [selectedUnit, setSelectedUnit] = React.useState<string>(
    currentUnitId ?? "",
  )
  /* O seletor NUNCA mistura clientes. (Marcus, 27/08/26)
   *
   * Antes: sem dono deduzido, `opcoes` caía em `units` — a base inteira —
   * "porque lista longa é melhor que seletor vazio". Não é. Foi assim que a
   * linha de um merchant da DG FOODS ficou com a unidade CR Poços, do
   * Churrasco Royal, escolhida e a um clique de vincular. Misturar o
   * faturamento de dois clientes é o pior erro possível nesta tela, e um
   * seletor vazio é constrangimento; o outro é dano.
   *
   * Agora a pergunta vem antes: primeiro DE QUEM é o merchant, depois qual
   * loja. Com dono deduzido a primeira já vem respondida. */
  const [clienteEscolhido, setClienteEscolhido] = React.useState<string>(
    holdingSugerido?.id ?? "",
  )
  const opcoes = React.useMemo(
    () =>
      clienteEscolhido
        ? units.filter((u) => u.holdingId === clienteEscolhido)
        : [],
    [units, clienteEscolhido],
  )

  /* Trocar de cliente LIMPA a unidade escolhida.
   *
   * Sem isto o `value` do Select sobrevive à troca e some da lista de opções
   * — e o Select, sem item correspondente, desenha o UUID cru no lugar do
   * nome. Era o "5402b5cd-6517-4457-9d16" que aparecia na tela. Feio, mas o
   * problema real é outro: o campo escondido continuava mandando aquele id no
   * submit, então o vínculo errado ia junto sem ninguém ver o nome dele. */
  const trocarCliente = (id: string) => {
    setClienteEscolhido(id)
    setSelectedUnit("")
  }

  /* Cinto de segurança do que efetivamente vai no submit: só passa id que
   * está na lista visível. Se por qualquer caminho o estado divergir, o botão
   * desabilita em vez de vincular no escuro. */
  const unitValida = opcoes.some((u) => u.id === selectedUnit)
  const valorSubmit = unitValida ? selectedUnit : ""

  if (currentUnitId) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
          <Check className="size-3" /> Vinculado
        </span>
        <form action={unlinkAction}>
          <input type="hidden" name="merchantId" value={merchantId} />
          <UnlinkBtn />
        </form>
        {unlinkState.error && (
          <span className="text-[10px] text-rose-600">{unlinkState.error}</span>
        )}
      </div>
    )
  }

  /* flex-wrap + min-w-0: o select tem largura total no celular, e sem permitir
   * quebra ele empurrava o botão e o "1 de N" pra fora do cartão — que é
   * overflow-hidden, então sumiam de vez. */
  return (
    <form
      action={linkAction}
      className="flex w-full min-w-0 flex-wrap items-center gap-2"
    >
      <input type="hidden" name="merchantId" value={merchantId} />
      <input type="hidden" name="unitId" value={valorSubmit} />

      {/* Passo 1 — de quem é. Só aparece quando não deduzimos, ou quando a
          pessoa clica em "trocar": com o dono conhecido, obrigar a confirmar
          o óbvio em 60 linhas é ruído. */}
      {!clienteEscolhido && (
        <select
          value=""
          onChange={(e) => trocarCliente(e.target.value)}
          className="h-7 w-full rounded-md border border-amber-300 bg-background px-2 text-xs outline-none focus:border-ring sm:w-[200px] dark:border-amber-800"
        >
          <option value="">De qual cliente é?</option>
          {holdings.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      )}

      {/* Passo 2 — qual loja dele. */}
      {clienteEscolhido && (
        <>
          <Select
            value={valorSubmit}
            onValueChange={(v) => setSelectedUnit(v ?? "")}
          >
            <SelectTrigger className="h-7 w-full text-xs sm:w-[200px]">
              <SelectValue placeholder="Escolher unidade…" />
            </SelectTrigger>
            <SelectContent>
              {opcoes.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.code} — {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <LinkBtn desabilitado={!valorSubmit} />
        </>
      )}

      {clienteEscolhido && opcoes.length === 0 && (
        <span className="text-[10px] text-amber-700 dark:text-amber-400">
          esse cliente não tem loja livre — cadastre a unidade primeiro
        </span>
      )}

      <button
        type="button"
        onClick={() => trocarCliente("")}
        className={`whitespace-nowrap text-[10px] text-muted-foreground underline-offset-2 hover:underline ${
          clienteEscolhido ? "" : "hidden"
        }`}
      >
        trocar cliente
      </button>

      {linkState.error && (
        <span className="text-[10px] text-rose-600">{linkState.error}</span>
      )}
    </form>
  )
}

function LinkBtn({ desabilitado = false }: { desabilitado?: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      size="sm"
      className="h-7 gap-1 px-2 text-xs"
      disabled={pending || desabilitado}
    >
      <Link2 className="size-3" />
      {pending ? "..." : "Vincular"}
    </Button>
  )
}

function UnlinkBtn() {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      size="sm"
      variant="ghost"
      className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-rose-600"
      disabled={pending}
    >
      <Link2Off className="size-3" />
      {pending ? "..." : "Desvincular"}
    </Button>
  )
}

export function RefreshButton() {
  const [state, action] = useActionState<RefreshMerchantsState, FormData>(
    refreshMerchants,
    { ok: false },
  )
  return (
    <form action={action} className="flex items-center gap-2">
      <RefreshBtn />
      {state.count != null && (
        <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
          {state.count} merchant(s) sincronizado(s)
        </span>
      )}
      {state.error && (
        <span className="text-[11px] text-rose-600">{state.error}</span>
      )}
    </form>
  )
}

function RefreshBtn() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" variant="outline" className="gap-1.5" disabled={pending}>
      <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Sincronizando..." : "Re-puxar da Merchant API"}
    </Button>
  )
}


/** Retorno de /api/integracao/ifood-sync-run. */
type SyncRunResult = {
  ok: boolean
  unitsProcessed?: number
  results?: {
    unitCode: string
    unitName?: string
    holdingName?: string
    pedidos?: {
      competencia: string
      ok?: boolean
      gravados?: number
      error?: string
    }[]
    reconciliation?: {
      competencia: string
      ok?: boolean
      rowCount?: number
      error?: string
      status?: number
      /** Extrato ainda gerando: aguardando, não falhou. */
      pendente?: boolean
    }[]
  }[]
  diagnostico?: string
  error?: string
}

/**
 * Dispara o sync do iFood — só iFood, porque esta é a tela DAS LOJAS DO IFOOD.
 *
 * Cheguei a transformar num "sincroniza tudo" (as 3 APIs), e o Marcus corrigiu:
 * botão que roda 99 e Cardápio Web numa tela de merchants do iFood é contexto
 * errado — quem está aqui veio resolver iFood.
 *
 * O alcance é de TODOS os clientes: a tela é de dono, e o escopo vem do
 * getAccessibleUnitIds da rota (superadmin sem empresa = base inteira).
 */
export function RunSyncButton() {
  const [pending, setPending] = React.useState(false)
  const [result, setResult] = React.useState<SyncRunResult | null>(null)

  async function run() {
    setPending(true)
    setResult(null)
    try {
      // `todos` = base inteira, não só as lojas da minha empresa. Esta tela é
      // de dono; o escopo por tenant vale nas telas de operação.
      const r = await fetch("/api/integracao/ifood-sync-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ todos: true }),
      })
      // Timeout vem como HTML/texto, não JSON — ler cru antes de parsear
      // evita "Unexpected token '<'" na cara de quem clicou.
      const txt = await r.text()
      try {
        setResult(JSON.parse(txt) as SyncRunResult)
      } catch {
        setResult({
          ok: false,
          error:
            r.status === 504 || r.status === 500
              ? "A sincronização passou do tempo e foi interrompida. O que já rodou está salvo."
              : `Não foi possível concluir (erro ${r.status}).`,
        })
      }
    } catch (e) {
      /* Falha de REDE, não do servidor. No celular é o caso comum: a
       * sincronização pode levar minutos, e o Safari corta a conexão bem antes
       * (mais ainda se a tela apagar ou a aba for pro fundo). A mensagem crua
       * dele é "Load failed", que não diz nada e faz parecer que a
       * sincronização não aconteceu — quando ela segue rodando no servidor até
       * o fim, porque a função não morre junto com a conexão.
       *
       * O texto precisa dizer as duas coisas: que o trabalho continua, e que o
       * resultado se confere atualizando a tela. */
      const cru = e instanceof Error ? e.message : String(e)
      setResult({
        ok: false,
        error:
          "A conexão caiu antes da resposta chegar — comum no celular, porque a sincronização leva alguns minutos. " +
          "Ela continua rodando no servidor: espere um pouco e atualize a tela pra ver o resultado. " +
          `(${cru})`,
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1.5"
        disabled={pending}
        onClick={run}
      >
        <PlayCircle className={`size-3.5 ${pending ? "animate-pulse" : ""}`} />
        {pending ? "Sincronizando iFood…" : "Sincronizar iFood (todos)"}
      </Button>

      {result && (
        /* Antes: coluna estreita com uma linha por LOJA, texto quebrando em 3
           linhas e a lista descendo a tela inteira. Agora é um resumo por
           PLATAFORMA — que é o que interessa numa ação que roda pra base toda.
           Detalhe por loja continua no painel de cada cliente. */
        <div
          className={`rounded-md border p-3 text-xs ${
            result.ok
              ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20"
              : "border-rose-200 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/20"
          }`}
        >
          {result.error ? (
            <p className="font-medium text-rose-700 dark:text-rose-400">
              {result.error}
            </p>
          ) : (
            <>
              {/* Resumo compacto. A versão anterior listava UMA LINHA POR
                  LOJA numa coluna estreita: com 60+ lojas, texto quebrando em
                  três linhas e a lista descendo a tela toda. O que interessa
                  numa ação que roda pra base inteira é quantas passaram e
                  QUAIS falharam — o detalhe fica no painel de cada cliente. */}
              <p className="font-medium">
                {result.unitsProcessed ?? 0} loja(s) sincronizada(s)
              </p>
              {(() => {
                /* "Aguardando o iFood gerar" NÃO é falha — não pode entrar
                   na contagem de erro. Alarme que inclui espera normal treina
                   a pessoa a ignorar o alarme, e a loja recém-conectada cai
                   nesse caso todo dia até o extrato existir. */
                // Aceita linha de conciliação OU de pedidos: só a primeira
                // tem `pendente`, e checar por presença evita duplicar o tipo.
                const pendente = (c: unknown) =>
                  (c as { pendente?: boolean }).pendente === true
                const comFalha = (result.results ?? []).filter((u) =>
                  [
                    ...(u.reconciliation ?? []),
                    ...(u.pedidos ?? []),
                  ].some((c) => c.ok === false && !pendente(c)),
                )
                const aguardando = (result.results ?? []).filter((u) =>
                  (u.reconciliation ?? []).some(pendente),
                )
                const linhas = (result.results ?? []).reduce(
                  (t, u) =>
                    t +
                    (u.reconciliation ?? []).reduce(
                      (x, c) => x + (c.rowCount ?? 0),
                      0,
                    ),
                  0,
                )
                return (
                  <>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {linhas.toLocaleString("pt-BR")} linha(s) de conciliação
                      gravadas
                    </p>
                    {aguardando.length > 0 ? (
                      <p className="mt-1.5 text-[11px] text-sky-700 dark:text-sky-400">
                        {aguardando.length} loja(s) com extrato ainda sendo
                        gerado pelo iFood — entram na próxima sincronização.
                      </p>
                    ) : null}
                    {comFalha.length > 0 ? (
                      <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 dark:border-amber-900/40 dark:bg-amber-950/30">
                        <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-400">
                          {comFalha.length} loja(s) com erro:
                        </p>
                        {/* COM O MOTIVO, e dizendo o que ainda assim entrou.
                            Só o nome da loja fazia parecer que ela não puxou
                            nada — quando basta UMA competência falhar pra
                            marcar a loja inteira. A Le Petit apareceu aqui no
                            mesmo sync em que gravou 2.240 lançamentos. */}
                        <ul className="mt-1 space-y-1 text-[11px] text-amber-800 dark:text-amber-400">
                          {comFalha.slice(0, 8).map((u, i) => {
                            const ruins = [
                              ...(u.reconciliation ?? []).map((c) => ({
                                o: "conciliação",
                                ...c,
                              })),
                              ...(u.pedidos ?? []).map((c) => ({
                                o: "pedidos",
                                ...c,
                              })),
                            ].filter((c) => c.ok === false && !pendente(c))
                            const okCount =
                              (u.reconciliation ?? []).filter(
                                (c) => c.ok !== false,
                              ).length +
                              (u.pedidos ?? []).filter((c) => c.ok !== false)
                                .length
                            return (
                              <li key={i}>
                                <span className="font-medium">
                                  {u.unitCode} · {u.unitName ?? "—"}
                                  {u.holdingName ? ` · ${u.holdingName}` : ""}
                                </span>
                                {ruins.map((c, k) => (
                                  <span key={k} className="block pl-3 opacity-90">
                                    {c.o} {c.competencia}:{" "}
                                    {c.error ??
                                      ("status" in c && c.status
                                        ? `HTTP ${c.status}`
                                        : "falhou sem mensagem")}
                                  </span>
                                ))}
                                {okCount > 0 ? (
                                  <span className="block pl-3 opacity-70">
                                    o resto do período entrou normalmente
                                  </span>
                                ) : null}
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    ) : null}
                  </>
                )
              })()}
            </>
          )}
        </div>
      )}
    </div>
  )
}
