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

export function LinkRow({
  merchantId,
  currentUnitId,
  units,
  holdingSugerido,
}: {
  merchantId: string
  currentUnitId: string | null
  units: UnitOption[]
  /** Cliente deduzido pelo CNPJ do merchant (solicitação de conexão). */
  holdingSugerido?: { id: string; name: string } | null
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
  /* Só as lojas DO CLIENTE do merchant.
   *
   * A lista trazia todas as unidades da base misturadas — o admin não sabia
   * qual loja era de qual dono e vinculava no escuro. E vincular errado aqui
   * mistura o faturamento de dois clientes, o pior erro possível nesta tela.
   *
   * O cliente sai do CNPJ do merchant casado com a solicitação de conexão.
   * Sem dedução possível (merchant sem pedido), mostra todas — lista longa é
   * melhor que seletor vazio. */
  const [verTodas, setVerTodas] = React.useState(false)
  const doCliente = holdingSugerido
    ? units.filter((u) => u.holdingId === holdingSugerido.id)
    : []
  const filtrando = !!holdingSugerido && !verTodas && doCliente.length > 0
  const opcoes = filtrando ? doCliente : units

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

  return (
    <form action={linkAction} className="flex items-center gap-2">
      <input type="hidden" name="merchantId" value={merchantId} />
      <input type="hidden" name="unitId" value={selectedUnit} />
      <Select
        value={selectedUnit}
        onValueChange={(v) => setSelectedUnit(v ?? "")}
      >
        <SelectTrigger className="h-7 w-[200px] text-xs">
          <SelectValue placeholder="Escolher unidade…" />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.code} — {u.name}
              {/* Com a lista aberta pra todos, "01 — JK" não diz de quem é. */}
              {!filtrando && u.holdingName ? (
                <span className="ml-1 text-muted-foreground">
                  · {u.holdingName}
                </span>
              ) : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <LinkBtn />
      {holdingSugerido && doCliente.length > 0 && (
        <button
          type="button"
          onClick={() => setVerTodas((v) => !v)}
          className="whitespace-nowrap text-[10px] text-muted-foreground underline-offset-2 hover:underline"
        >
          {filtrando
            ? `${doCliente.length} de ${holdingSugerido.name} · ver todas`
            : `só ${holdingSugerido.name}`}
        </button>
      )}
      {linkState.error && (
        <span className="text-[10px] text-rose-600">{linkState.error}</span>
      )}
    </form>
  )
}

function LinkBtn() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={pending}>
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
      setResult({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
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
