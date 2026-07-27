"use client"

import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { Copy, Check, Undo2 } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"

import {
  atualizarSolicitacaoIfood,
  conferirLojasAutorizadas,
  desfazerStatusIfood,
  type ConferirAutorizadasState,
  type SolicitacaoUpdateState,
} from "../_actions"

export type SolicitacaoAdmin = {
  id: string
  cnpj: string
  status: "pendente" | "solicitada" | "ativa" | "recusada"
  nota: string | null
  holdingName: string
  unitLabel: string | null
  createdAt: string
  /** Quando o cliente apertou "Já aprovei no iFood" (sinal pra vincular). */
  clienteConfirmouAt: string | null
  /** Passo anterior da fila — habilita o Desfazer. */
  statusAnterior: string | null
}

function fmtCnpj(d: string): string {
  return d.length === 14
    ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
    : d
}

function BotaoStatus({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? "..." : rotulo}
    </Button>
  )
}

function CopiarCnpj({ cnpj }: { cnpj: string }) {
  const [copiado, setCopiado] = React.useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(cnpj)
        setCopiado(true)
        setTimeout(() => setCopiado(false), 1500)
      }}
      className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted"
      title="Copiar CNPJ (só dígitos) pra colar no Portal do Desenvolvedor"
    >
      {copiado ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copiado ? "copiado" : "copiar"}
    </button>
  )
}

/** Uma linha da fila com as transições de status possíveis. */
function Linha({ s }: { s: SolicitacaoAdmin }) {
  const [state, action] = useActionState<SolicitacaoUpdateState, FormData>(
    atualizarSolicitacaoIfood,
    { ok: false },
  )

  // Recusada não tem "próximo status", mas precisa do Desfazer — senão o
  // bloco de ações inteiro some e o clique errado fica sem volta.
  const podeDesfazer = Boolean(s.statusAnterior) || s.status === "recusada"

  const proximas: Array<{ status: string; rotulo: string }> =
    s.status === "pendente"
      ? [
          { status: "solicitada", rotulo: "Marquei como solicitada" },
          { status: "recusada", rotulo: "Recusar" },
        ]
      : s.status === "solicitada"
        ? [
            { status: "ativa", rotulo: "Loja vinculada — ativar" },
            { status: "recusada", rotulo: "Recusar" },
          ]
        : []

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold">{s.holdingName}</span>
        <span className="tabular-nums">{fmtCnpj(s.cnpj)}</span>
        <CopiarCnpj cnpj={s.cnpj} />
        {s.unitLabel && (
          <span className="text-muted-foreground">{s.unitLabel}</span>
        )}
        {s.status === "solicitada" && s.clienteConfirmouAt && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
            ✋ cliente confirmou
          </span>
        )}
        <span
          className={`${s.status === "solicitada" && s.clienteConfirmouAt ? "" : "ml-auto"} rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`}
        >
          {s.status}
        </span>
      </div>

      {(proximas.length > 0 || podeDesfazer) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {proximas.map((p) => (
            <form key={p.status} action={action}>
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="status" value={p.status} />
              {p.status === "recusada" && (
                <input
                  type="hidden"
                  name="nota"
                  value="Não foi possível localizar a loja com esse CNPJ — confira o CNPJ cadastrado no iFood e solicite de novo."
                />
              )}
              <BotaoStatus rotulo={p.rotulo} />
            </form>
          ))}
          {/* Recusada sempre pode voltar; sem histórico, volta pro início. */}
          {podeDesfazer && (
            <BotaoDesfazer id={s.id} para={s.statusAnterior ?? "pendente"} />
          )}
          {s.status === "pendente" && (
            <span className="text-[11px] text-muted-foreground">
              → Portal do Desenvolvedor · Meus Apps · Permissões · buscar pelo
              CNPJ
            </span>
          )}
          {s.status === "solicitada" && (
            <span
              className={`text-[11px] ${s.clienteConfirmouAt ? "font-medium text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}
            >
              {s.clienteConfirmouAt
                ? 'O cliente avisou que já aprovou — use "Já autorizei — conferir e vincular" no topo.'
                : "Aguardando o Proprietário aprovar no Portal do Parceiro (propaga em ~10 min; a loja aparece na lista abaixo)"}
            </span>
          )}
        </div>
      )}

      {state.error && (
        <p className="mt-1 text-[11px] text-rose-600">{state.error}</p>
      )}
    </div>
  )
}

/**
 * Volta a solicitação pro passo anterior da fila.
 *
 * "Recusar" fica colado em "Loja vinculada — ativar", e o clique errado não é
 * cosmético: recusada some do aviso da home do cliente, então ele deixa de ser
 * lembrado de aprovar no Portal do Parceiro e a conexão morre calada.
 */
function BotaoDesfazer({ id, para }: { id: string; para: string }) {
  const [state, action] = useActionState<SolicitacaoUpdateState, FormData>(
    desfazerStatusIfood,
    { ok: false },
  )
  return (
    <form action={action} className="inline-flex items-center gap-1.5">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title={`Volta para "${para}"`}
      >
        <Undo2 className="size-3" />
        Desfazer
      </button>
      {state.error && (
        <span className="text-[11px] text-rose-600">{state.error}</span>
      )}
    </form>
  )
}

/**
 * "Já autorizei — conferir e vincular": vai buscar os merchants no iFood e
 * casa com as solicitações abertas, de uma vez.
 *
 * Substitui o vai-e-vem de descer na tabela e vincular loja por loja. Depois
 * que o cliente aprova no Portal do Parceiro a loja demora alguns minutos pra
 * aparecer no nosso GET /merchants — até aqui, a única forma de fechar o ciclo
 * antes do cron da madrugada era manual.
 */
function BotaoConferir() {
  const [state, action] = useActionState<ConferirAutorizadasState, FormData>(
    conferirLojasAutorizadas,
    { ok: false },
  )
  const nada =
    state.ok &&
    (state.vinculadas?.length ?? 0) === 0 &&
    (state.pendentes?.length ?? 0) === 0

  return (
    <div className="mt-3 rounded-lg border border-dashed p-3">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <BotaoConferirSubmit />
        <span className="text-[11px] text-muted-foreground">
          Depois que o cliente aprova no Portal do Parceiro, a loja leva alguns
          minutos pra aparecer aqui. Este botão vai buscar e vincula sozinho.
        </span>
      </form>

      {state.error && (
        <p className="mt-2 text-[11px] text-rose-600">{state.error}</p>
      )}

      {state.ok && (state.vinculadas?.length ?? 0) > 0 && (
        <div className="mt-2 rounded-md bg-emerald-50 p-2 dark:bg-emerald-950/30">
          <p className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-400">
            {state.vinculadas!.length} loja
            {state.vinculadas!.length > 1 ? "s" : ""} vinculada
            {state.vinculadas!.length > 1 ? "s" : ""} e ativada
            {state.vinculadas!.length > 1 ? "s" : ""}:
          </p>
          <ul className="mt-1 space-y-0.5">
            {state.vinculadas!.map((v) => (
              <li
                key={v.code}
                className="text-[11px] text-emerald-700 dark:text-emerald-400"
              >
                #{v.code} {v.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.ok && (state.pendentes?.length ?? 0) > 0 && (
        <div className="mt-2 rounded-md bg-amber-50 p-2 dark:bg-amber-950/30">
          <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-400">
            Estas ficaram de fora — resolva na tabela abaixo:
          </p>
          <ul className="mt-1 space-y-0.5">
            {state.pendentes!.map((a) => (
              <li
                key={a.name}
                className="text-[11px] text-amber-700 dark:text-amber-400"
              >
                {a.name} — {a.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}

      {nada && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Nenhuma loja nova apareceu ainda
          {typeof state.merchantsVistos === "number"
            ? ` (${state.merchantsVistos} autorizadas no app)`
            : ""}
          . Se o cliente acabou de aprovar, espere uns minutos e clique de novo.
        </p>
      )}
    </div>
  )
}

function BotaoConferirSubmit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Conferindo no iFood..." : "Já autorizei — conferir e vincular"}
    </Button>
  )
}

export function SolicitacoesPanel({
  solicitacoes,
}: {
  solicitacoes: SolicitacaoAdmin[]
}) {
  // Loja já ativa = jornada concluída → sai da fila (continua visível como
  // "Vinculado" na tabela de merchants abaixo). A fila mostra só o que ainda
  // precisa de ação: pendente, solicitada e recusada.
  const naFila = solicitacoes.filter((s) => s.status !== "ativa")
  if (naFila.length === 0) return null
  const abertas = naFila.filter(
    (s) => s.status === "pendente" || s.status === "solicitada",
  )
  return (
    <div className="rounded-xl border bg-card p-5">
      <h2 className="text-sm font-semibold">
        Solicitações de conexão dos clientes
        {abertas.length > 0 && (
          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
            {abertas.length} aguardando
          </span>
        )}
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Pedidos feitos pelos clientes na tela de importação. Fluxo: copiar o
        CNPJ → solicitar no Portal do Desenvolvedor → marcar como solicitada →
        quando o cliente aprovar e a loja aparecer aqui, vincular à unidade e
        ativar. Loja conectada sai desta lista (fica como <b>Vinculado</b> na
        tabela abaixo).
      </p>
      {abertas.length > 0 && <BotaoConferir />}
      <div className="mt-3 space-y-2">
        {naFila.map((s) => (
          <Linha key={s.id} s={s} />
        ))}
      </div>
    </div>
  )
}
