"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { ArrowRight, Check, Clock, Target, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { fmtBRL } from "@/lib/format"
import type { LojaNaCarteira } from "@/lib/data/fluxo-loja"

import {
  moverEtapa,
  salvarDadosCarteira,
  type FluxoState,
} from "../_actions-fluxo"

const CATEGORIA = {
  nova: { txt: "Lojas Novas", tom: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300" },
  ativa: { txt: "Ativa", tom: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400" },
  pausada: { txt: "Pausada", tom: "bg-muted text-muted-foreground" },
} as const

const dataCurta = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
    : "—"

/** 75 dias → "2 meses e 15 dias", como no painel da agência. */
function tempo(dias: number | null): string {
  if (dias === null) return "—"
  if (dias < 30) return `${dias} dia${dias === 1 ? "" : "s"}`
  const m = Math.floor(dias / 30)
  const d = dias % 30
  const parteM = `${m} ${m === 1 ? "mês" : "meses"}`
  return d === 0 ? parteM : `${parteM} e ${d} dia${d === 1 ? "" : "s"}`
}

/**
 * A loja vista pela agência: cabeçalho, KPIs e o fluxo de entrada.
 *
 * Réplica do bloco que a DG Foods construiu no painel dela — Entrada, Tempo
 * em Gestão, Promessa Comercial, Categoria, Meta 30 Dias, Total 90 Dias, e
 * as três etapas com os botões de avançar e desfazer.
 */
export function FluxoLoja({
  loja,
  codigo,
}: {
  loja: LojaNaCarteira
  codigo: string
}) {
  const cat = CATEGORIA[loja.categoria]
  const bateuMeta =
    loja.metaTrintaDias != null &&
    loja.ultimos30 != null &&
    loja.ultimos30 >= loja.metaTrintaDias

  return (
    <div className="flex flex-col gap-3">
      {/* Cabeçalho — gestor, entrada, tempo em gestão */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-card px-4 py-3 text-xs">
        <span className="flex items-center gap-1.5">
          <UserRound className="size-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Gestor</span>
          <strong>{loja.gestorNome ?? "não definido"}</strong>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Entrada</span>
          <strong>{dataCurta(loja.entradaCarteira)}</strong>
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="size-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Em gestão</span>
          <strong>{tempo(loja.diasEmGestao)}</strong>
        </span>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${cat.tom}`}
        >
          {cat.txt}
        </span>
      </div>

      {/* KPIs da carteira */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
        <Kpi rotulo="Total 90 dias" valor={loja.total90} />
        <Kpi rotulo="Média dos últimos 3 meses" valor={loja.media3Meses} />
        <Kpi rotulo="Últimos 30 dias" valor={loja.ultimos30} />
        <div className="bg-card px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Meta 30 dias
          </p>
          {loja.metaTrintaDias == null ? (
            <p className="mt-0.5 text-sm text-muted-foreground">sem meta</p>
          ) : (
            <p
              className={`mt-0.5 inline-flex items-center gap-1 text-sm font-semibold tabular-nums ${
                bateuMeta ? "text-emerald-700 dark:text-emerald-400" : ""
              }`}
            >
              <Target className="size-3.5" />
              {fmtBRL(loja.metaTrintaDias)}
              {bateuMeta && <Check className="size-3.5" />}
            </p>
          )}
        </div>
      </div>

      {/* Fluxo — só faz sentido em loja NOVA. Em loja ativa o processo já
          passou, e mostrar três etapas concluídas ocupa espaço sem dizer
          nada. */}
      {loja.categoria === "nova" ? (
        <Fluxo loja={loja} codigo={codigo} />
      ) : (
        <p className="rounded-xl border bg-card px-4 py-3 text-xs text-muted-foreground">
          Loja já ativa na carteira
          {loja.encaminhada.em ? ` desde ${dataCurta(loja.encaminhada.em)}` : ""}.
          O fluxo de entrada não se aplica mais.
        </p>
      )}

      <DadosComerciais loja={loja} codigo={codigo} />
    </div>
  )
}

function Fluxo({ loja, codigo }: { loja: LojaNaCarteira; codigo: string }) {
  const podeEncaminhar = loja.checklist.concluida && loja.cardapio.concluida
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-sm font-semibold">Fluxo da loja</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Conclua checklist e cardápio antes de encaminhar a loja para ativas.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Etapa
          n="Etapa 1"
          titulo="Checklist"
          etapa="checklist"
          feito={loja.checklist}
          unitId={loja.unitId}
          codigo={codigo}
          rotuloFazer="Concluir checklist"
          rotuloDesfazer="Desfazer checklist"
        />
        <Etapa
          n="Etapa 2"
          titulo="Cardápio"
          etapa="cardapio"
          feito={loja.cardapio}
          unitId={loja.unitId}
          codigo={codigo}
          rotuloFazer="Dar ok no cardápio"
          rotuloDesfazer="Desfazer cardápio"
        />
        <Etapa
          n="Encaminhamento"
          titulo={podeEncaminhar ? "Liberado" : "Aguardando liberação"}
          etapa="encaminhar"
          feito={loja.encaminhada}
          unitId={loja.unitId}
          codigo={codigo}
          rotuloFazer="Encaminhar para Ativas"
          rotuloDesfazer="Voltar para Novas"
          bloqueado={!podeEncaminhar}
        />
      </div>
    </div>
  )
}

function Etapa({
  n,
  titulo,
  etapa,
  feito,
  unitId,
  codigo,
  rotuloFazer,
  rotuloDesfazer,
  bloqueado,
}: {
  n: string
  titulo: string
  etapa: string
  feito: { concluida: boolean; em: string | null }
  unitId: string
  codigo: string
  rotuloFazer: string
  rotuloDesfazer: string
  bloqueado?: boolean
}) {
  const [estado, acao] = useActionState<FluxoState, FormData>(moverEtapa, {
    ok: false,
  })
  return (
    <div className="rounded-lg border p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {n}
      </p>
      <p className="mt-0.5 text-sm font-medium">
        {feito.concluida ? "Concluído" : titulo}
      </p>
      {feito.em && (
        <p className="text-[10px] text-muted-foreground">
          em {dataCurta(feito.em)}
        </p>
      )}
      <form action={acao} className="mt-2">
        <input type="hidden" name="unitId" value={unitId} />
        <input type="hidden" name="codigo" value={codigo} />
        <input type="hidden" name="etapa" value={etapa} />
        {feito.concluida && <input type="hidden" name="desfazer" value="1" />}
        <BotaoEtapa
          rotulo={feito.concluida ? rotuloDesfazer : rotuloFazer}
          primario={!feito.concluida}
          bloqueado={!feito.concluida && bloqueado}
        />
      </form>
      {estado.error && (
        <p className="mt-1 text-[10px] text-rose-600">{estado.error}</p>
      )}
    </div>
  )
}

function BotaoEtapa({
  rotulo,
  primario,
  bloqueado,
}: {
  rotulo: string
  primario: boolean
  bloqueado?: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      size="sm"
      variant={primario ? "default" : "outline"}
      className="h-8 w-full gap-1 text-xs"
      disabled={pending || bloqueado}
      title={bloqueado ? "Conclua o checklist e o cardápio primeiro" : undefined}
    >
      {pending ? "…" : rotulo}
      {primario && !bloqueado && <ArrowRight className="size-3" />}
    </Button>
  )
}

function Kpi({ rotulo, valor }: { rotulo: string; valor: number | null }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </p>
      {valor === null ? (
        <p className="mt-0.5 text-sm text-muted-foreground">— sem dado</p>
      ) : (
        <p className="mt-0.5 text-sm font-semibold tabular-nums">
          {fmtBRL(valor)}
        </p>
      )}
    </div>
  )
}

function DadosComerciais({
  loja,
  codigo,
}: {
  loja: LojaNaCarteira
  codigo: string
}) {
  const [estado, acao] = useActionState<FluxoState, FormData>(
    salvarDadosCarteira,
    { ok: false },
  )
  return (
    <form action={acao} className="rounded-xl border bg-card p-4">
      <p className="text-sm font-semibold">Promessa comercial e meta</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        O que foi prometido ao lojista na venda, e a meta de 30 dias que a
        agência assumiu.
      </p>
      <input type="hidden" name="unitId" value={loja.unitId} />
      <input type="hidden" name="codigo" value={codigo} />
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          name="promessa"
          defaultValue={loja.promessaComercial ?? ""}
          placeholder="Sem promessa comercial"
          className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring"
        />
        <input
          name="meta"
          defaultValue={loja.metaTrintaDias?.toString() ?? ""}
          placeholder="Meta 30 dias (R$)"
          inputMode="decimal"
          className="h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring sm:w-44"
        />
        <SalvarDados />
      </div>
      {estado.error && (
        <p className="mt-1 text-xs text-rose-600">{estado.error}</p>
      )}
      {estado.ok && estado.message && (
        <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
          {estado.message}
        </p>
      )}
    </form>
  )
}

function SalvarDados() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" className="h-9 text-xs" disabled={pending}>
      {pending ? "…" : "Salvar"}
    </Button>
  )
}
