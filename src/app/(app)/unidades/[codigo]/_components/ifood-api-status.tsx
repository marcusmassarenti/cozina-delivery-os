"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { Clock, ExternalLink, Plug, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"

import {
  solicitarAtivacaoIfood,
  type SolicitacaoIfoodState,
} from "../../_actions-ifood-ativacao"

/** Situação da conexão iFood-via-API desta unidade, resolvida no servidor. */
export type IfoodApiEstado =
  | { tipo: "conectada" }
  | { tipo: "pendente" }
  | { tipo: "solicitada" }
  | { tipo: "recusada"; nota: string | null }
  | { tipo: "nenhuma" }

const PORTAL_PARCEIRO_APPS = "https://portal.ifood.com.br/apps"

function fmtCnpj(d: string): string {
  const s = d.replace(/\D/g, "")
  return s.length === 14
    ? `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`
    : d
}

function BotaoSolicitar() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      <Plug className="size-3.5" />
      {pending ? "Enviando..." : "Solicitar conexão"}
    </Button>
  )
}

/**
 * Faixa de status da conexão iFood via API, no cabeçalho da unidade.
 *
 * O pedido nasce AQUI (contextual à loja) — saiu da tela de importação de
 * propósito, pra não poluir quem só quer subir relatório. Cada estado diz
 * de quem é a próxima ação; no "solicitada" o link abre direto a tela de
 * aplicativos do Portal do Parceiro, onde o Proprietário aprova.
 */
export function IfoodApiStatus({
  unitId,
  unitCnpj,
  estado,
  podeSolicitar,
}: {
  unitId: string
  unitCnpj: string | null
  estado: IfoodApiEstado
  podeSolicitar: boolean
}) {
  const router = useRouter()
  const [aberto, setAberto] = React.useState(false)
  const [state, action] = useActionState<SolicitacaoIfoodState, FormData>(
    solicitarAtivacaoIfood,
    { ok: false },
  )

  // Padrão do projeto: sucesso → refresh pra faixa trocar de estado.
  React.useEffect(() => {
    if (state.ok) router.refresh()
  }, [state.ok, router])

  // "conectada" e o convite de conectar moram no CADASTRO (Editar unidade)
  // — pedido do Marcus: banner permanente poluía a página. A faixa aqui é
  // só pros estados transitórios, e some sozinha quando a conexão fecha.
  if (estado.tipo === "conectada" || estado.tipo === "nenhuma") return null

  if (estado.tipo === "pendente") {
    return (
      <Faixa tom="amber">
        <Clock className="size-3.5 shrink-0" />
        <span>
          <b>Conexão iFood em análise</b> — recebemos seu pedido e vamos
          solicitar a conexão ao iFood. Você acompanha aqui.
        </span>
      </Faixa>
    )
  }

  if (estado.tipo === "solicitada") {
    return (
      <Faixa tom="sky">
        <Clock className="size-3.5 shrink-0" />
        <span>
          <b>Falta você aprovar no iFood:</b> o Proprietário da loja precisa
          aceitar a solicitação do app Delivery OS no Portal do Parceiro.
        </span>
        <a
          href={PORTAL_PARCEIRO_APPS}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-md border border-sky-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-sky-800 transition-colors hover:bg-sky-100 dark:border-sky-800 dark:bg-transparent dark:text-sky-300 dark:hover:bg-sky-950/40"
        >
          Abrir Portal do Parceiro
          <ExternalLink className="size-3" />
        </a>
      </Faixa>
    )
  }

  if (estado.tipo === "recusada") {
    return (
      <Faixa tom="rose">
        <XCircle className="size-3.5 shrink-0" />
        <span>
          <b>Não foi possível conectar o iFood.</b>{" "}
          {estado.nota ?? "Confira o CNPJ e solicite de novo."}
        </span>
        {podeSolicitar && (
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            className="ml-auto shrink-0 rounded-md border border-rose-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-800 transition-colors hover:bg-rose-100 dark:border-rose-800 dark:bg-transparent dark:text-rose-300 dark:hover:bg-rose-950/40"
          >
            Solicitar de novo
          </button>
        )}
        {aberto && (
          <FormSolicitar unitId={unitId} unitCnpj={unitCnpj} action={action} state={state} />
        )}
      </Faixa>
    )
  }

  return null
}

function FormSolicitar({
  unitId,
  unitCnpj,
  action,
  state,
}: {
  unitId: string
  unitCnpj: string | null
  action: (formData: FormData) => void
  state: SolicitacaoIfoodState
}) {
  return (
    <form
      action={action}
      className="ml-auto flex shrink-0 flex-wrap items-center gap-2"
    >
      <input type="hidden" name="unit_id" value={unitId} />
      <input
        name="cnpj"
        required
        inputMode="numeric"
        defaultValue={unitCnpj ? fmtCnpj(unitCnpj) : ""}
        placeholder="CNPJ da loja no iFood"
        className="h-8 w-44 rounded-md border bg-background px-2 text-[11px] outline-none focus:ring-2 focus:ring-ring"
      />
      <BotaoSolicitar />
      {state.message && !state.ok && (
        <span className="w-full text-[11px] text-amber-700 dark:text-amber-400">
          {state.message}
        </span>
      )}
    </form>
  )
}

function Faixa({
  tom,
  children,
}: {
  tom: "emerald" | "amber" | "sky" | "rose" | "neutra"
  children: React.ReactNode
}) {
  const classes: Record<string, string> = {
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400",
    amber:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400",
    sky: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-400",
    rose: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400",
    neutra: "border bg-card text-foreground",
  }
  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-xs ${classes[tom]}`}
    >
      {children}
    </div>
  )
}
