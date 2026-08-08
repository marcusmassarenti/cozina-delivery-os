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


/** Retorno de /api/integracao/sync-tudo (as 3 APIs, todos os clientes). */
type SyncTudoResult = {
  ok: boolean
  duracaoSeg?: number
  blocos?: Record<string, { ok: boolean; resumo: string; erro?: string }>
  error?: string
}

/**
 * Dispara o sync de TODAS as integrações por API, de TODOS os clientes.
 *
 * Antes era só o iFood. Com 4 plataformas e vários clientes, rodar uma de cada
 * vez pelo painel de cada empresa não escalava — o cron de madrugada era o
 * único lugar onde as três rodavam juntas.
 */
export function RunSyncButton() {
  const [pending, setPending] = React.useState(false)
  const [result, setResult] = React.useState<SyncTudoResult | null>(null)

  async function run() {
    setPending(true)
    setResult(null)
    try {
      const r = await fetch("/api/integracao/sync-tudo", { method: "POST" })
      // Timeout vem como HTML/texto, não JSON — ler cru antes de parsear
      // evita "Unexpected token '<'" na cara de quem clicou.
      const txt = await r.text()
      try {
        setResult(JSON.parse(txt) as SyncTudoResult)
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
        {pending
          ? "Sincronizando todas as APIs…"
          : "Sincronizar todas as APIs"}
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
              <p className="font-medium">
                {result.ok ? "Sincronizado" : "Concluído com falhas"}
                {result.duracaoSeg != null ? (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    · {result.duracaoSeg}s
                  </span>
                ) : null}
              </p>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
                {Object.entries(result.blocos ?? {}).map(([nome, b]) => (
                  <div
                    key={nome}
                    className="rounded-md border bg-card px-2.5 py-2"
                  >
                    <p className="flex items-center gap-1.5 font-semibold">
                      <span
                        className={
                          b.ok
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-rose-600 dark:text-rose-400"
                        }
                      >
                        {b.ok ? "✓" : "✗"}
                      </span>
                      {nome}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {b.resumo}
                    </p>
                    {b.erro ? (
                      <p className="mt-0.5 break-words text-[11px] text-rose-600 dark:text-rose-400">
                        {b.erro}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
