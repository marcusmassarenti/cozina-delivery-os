"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import {
  CheckCircle2,
  Clock,
  Plug,
  TriangleAlert,
  XCircle,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PlatformLogo } from "@/components/platform-logo"

import {
  solicitarAtivacaoIfood,
  type SolicitacaoIfoodState,
} from "../_actions-ifood-ativacao"

export type SolicitacaoIfood = {
  id: string
  cnpj: string
  status: "pendente" | "solicitada" | "ativa" | "recusada"
  nota: string | null
  unitLabel: string | null
  createdAt: string
}

type UnitOption = { id: string; code: string; name: string }

function fmtCnpj(d: string): string {
  return d.length === 14
    ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
    : d
}

const STATUS_UI: Record<
  SolicitacaoIfood["status"],
  { rotulo: string; classe: string; icone: React.ReactNode; dica?: string }
> = {
  pendente: {
    rotulo: "Em análise",
    classe: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
    icone: <Clock className="size-3" />,
    dica: "Recebemos seu pedido — vamos solicitar a conexão ao iFood.",
  },
  solicitada: {
    rotulo: "Aprove no iFood",
    classe: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-400",
    icone: <TriangleAlert className="size-3" />,
    dica: "Solicitação enviada! Agora o PROPRIETÁRIO da loja precisa aprovar no Portal do Parceiro do iFood (a solicitação aparece lá).",
  },
  ativa: {
    rotulo: "Conectada",
    classe:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
    icone: <CheckCircle2 className="size-3" />,
  },
  recusada: {
    rotulo: "Não foi possível",
    classe: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400",
    icone: <XCircle className="size-3" />,
  },
}

function BotaoSolicitar() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} size="sm">
      <Plug className="size-4" />
      {pending ? "Enviando..." : "Solicitar conexão"}
    </Button>
  )
}

/**
 * Card "Conectar iFood via API" — o cliente pede a conexão informando o
 * CNPJ; a fila aparece pro admin da plataforma, que faz a solicitação no
 * Portal do Desenvolvedor. O status guia o cliente no passo dele
 * (principalmente o "aprove no Portal do Parceiro").
 */
export function IfoodConnectCard({
  units,
  solicitacoes,
}: {
  units: UnitOption[]
  solicitacoes: SolicitacaoIfood[]
}) {
  const [state, action] = useActionState<SolicitacaoIfoodState, FormData>(
    solicitarAtivacaoIfood,
    { ok: false },
  )
  const [unitId, setUnitId] = React.useState<string>("")

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2">
        <PlatformLogo platform="ifood" className="size-5" />
        <h2 className="text-sm font-semibold">
          Conectar iFood via API (sem importação manual)
        </h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Informe o CNPJ da loja no iFood e a gente conecta: o financeiro passa
        a entrar sozinho, todos os dias. Você só aprova a solicitação no seu
        Portal do Parceiro quando ela chegar lá.
      </p>

      <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-44">
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
            Unidade (opcional)
          </label>
          <Select value={unitId} onValueChange={(v) => setUnitId(v ?? "")}>
            <SelectTrigger className="h-9 w-full text-xs">
              <SelectValue placeholder="Selecionar unidade" />
            </SelectTrigger>
            <SelectContent>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.code} · {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" name="unit_id" value={unitId} />
        </div>
        <div className="min-w-52">
          <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
            CNPJ da loja no iFood
          </label>
          <input
            name="cnpj"
            required
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            className="h-9 w-full rounded-md border bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <BotaoSolicitar />
      </form>

      {state.message && (
        <p
          className={`mt-2 text-xs ${
            state.ok
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-amber-700 dark:text-amber-400"
          }`}
        >
          {state.message}
        </p>
      )}

      {solicitacoes.length > 0 && (
        <div className="mt-4 space-y-2 border-t pt-3">
          {solicitacoes.map((s) => {
            const ui = STATUS_UI[s.status]
            return (
              <div key={s.id} className="text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium tabular-nums">
                    {fmtCnpj(s.cnpj)}
                  </span>
                  {s.unitLabel && (
                    <span className="text-muted-foreground">{s.unitLabel}</span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${ui.classe}`}
                  >
                    {ui.icone}
                    {ui.rotulo}
                  </span>
                </div>
                {(s.nota || ui.dica) && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {s.nota ?? ui.dica}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
