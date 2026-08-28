"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { CalendarCheck, CircleAlert, Clock, TrendingDown, TrendingUp } from "lucide-react"

import { Button } from "@/components/ui/button"
import { fmtBRL, fmtNum } from "@/lib/format"
import type { SemanaDaLoja } from "@/lib/data/relatorio-semanal"

import { salvarSemana, type SalvarSemanaState } from "../_actions-semanal"

const dia = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`

const SITUACAO = {
  entregue: {
    txt: "Entregue",
    Icone: CalendarCheck,
    tom: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
  },
  pendente: {
    txt: "Pendente",
    Icone: Clock,
    tom: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
  },
  vencida: {
    txt: "Vencida",
    Icone: CircleAlert,
    tom: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400",
  },
} as const

/**
 * Ciclo semanal da loja — o número vem pronto, o texto é do gestor.
 *
 * O painel que a agência usa hoje pede "Informe o faturamento da semana" num
 * campo vazio, e alguém abre o portal da plataforma pra preencher. Aqui o
 * número já está na tela; o que se digita é a leitura dele, que é o produto
 * que a agência vende.
 */
export function SemanaTab({
  unitId,
  codigo,
  semanas,
}: {
  unitId: string
  codigo: string
  semanas: SemanaDaLoja[]
}) {
  if (semanas.length === 0) {
    return (
      <p className="rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
        Sem semanas fechadas ainda.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Semana de segunda a domingo, entrega na quarta seguinte. O faturamento é
        calculado do que já entrou — não precisa digitar.
      </p>
      {semanas.map((s) => (
        <Semana key={s.inicio} unitId={unitId} codigo={codigo} s={s} />
      ))}
    </div>
  )
}

function Semana({
  unitId,
  codigo,
  s,
}: {
  unitId: string
  codigo: string
  s: SemanaDaLoja
}) {
  const [estado, acao] = useActionState<SalvarSemanaState, FormData>(
    salvarSemana,
    { ok: false },
  )
  const [texto, setTexto] = React.useState(s.texto ?? "")
  const sit = SITUACAO[s.situacao]
  const Icone = sit.Icone
  const subiu = (s.variacaoPct ?? 0) >= 0
  const Seta = subiu ? TrendingUp : TrendingDown

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
        <span className="text-sm font-semibold">
          {dia(s.inicio)} a {dia(s.fim)}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${sit.tom}`}
        >
          <Icone className="size-3" />
          {sit.txt}
        </span>
        <span className="text-[11px] text-muted-foreground">
          vence {dia(s.vencimento)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        <Numero rotulo="Faturamento" valor={s.bruto === null ? null : fmtBRL(s.bruto)} destaque />
        <Numero rotulo="Pedidos" valor={s.pedidos === null ? null : fmtNum(s.pedidos)} />
        <Numero
          rotulo="Ticket médio"
          valor={s.ticketMedio === null ? null : fmtBRL(s.ticketMedio)}
        />
        <div className="bg-card px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            vs. semana anterior
          </p>
          {s.variacaoPct === null ? (
            <p className="mt-0.5 text-sm text-muted-foreground">—</p>
          ) : (
            <p
              className={`mt-0.5 inline-flex items-center gap-1 text-sm font-semibold ${
                subiu
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              <Seta className="size-3.5" />
              {subiu ? "+" : ""}
              {s.variacaoPct.toFixed(1)}%
            </p>
          )}
        </div>
      </div>

      <form action={acao} className="flex flex-col gap-2 px-4 py-3">
        <input type="hidden" name="unitId" value={unitId} />
        <input type="hidden" name="codigo" value={codigo} />
        <input type="hidden" name="semana" value={s.inicio} />
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Relatório da semana
        </label>
        <textarea
          name="texto"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          placeholder="O que aconteceu na semana, o que explica o número, o que vai ser feito."
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Salvar />
          {estado.error && (
            <span className="text-xs text-rose-600">{estado.error}</span>
          )}
          {estado.ok && estado.message && (
            <span className="text-xs text-emerald-700 dark:text-emerald-400">
              {estado.message}
            </span>
          )}
          {s.entregueEm && !estado.ok && (
            <span className="text-[11px] text-muted-foreground">
              entregue em{" "}
              {new Date(s.entregueEm).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
      </form>
    </div>
  )
}

/**
 * `null` vira "sem dado importado", nunca R$ 0,00.
 *
 * Zero é uma afirmação — diz que a loja não vendeu. Numa semana sem
 * importação isso vira um relatório mandado pro cliente da agência afirmando
 * faturamento zero. O travessão custa uma pergunta; o zero custa credibilidade.
 */
function Numero({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string
  valor: string | null
  destaque?: boolean
}) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </p>
      {valor === null ? (
        <p className="mt-0.5 text-sm text-muted-foreground" title="Nenhum dado importado nesta semana">
          — sem dado
        </p>
      ) : (
        <p className={`mt-0.5 tabular-nums ${destaque ? "text-lg font-semibold" : "text-sm font-medium"}`}>
          {valor}
        </p>
      )}
    </div>
  )
}

function Salvar() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" className="h-8 text-xs" disabled={pending}>
      {pending ? "Salvando…" : "Salvar relatório"}
    </Button>
  )
}
