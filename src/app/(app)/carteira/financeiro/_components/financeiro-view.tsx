"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SeletorBusca } from "@/components/shared/seletor-busca"
import { fmtBRL } from "@/lib/format"
import type { Cobranca, Despesa } from "@/lib/data/carteira-financeiro"

import { alternarPago, lancarCobranca, lancarDespesa, type FinState } from "../_actions"

export type LojaSimples = { id: string; code: string; name: string }

const INICIAL: FinState = { ok: false }

const dataBR = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR")

const CORES: Record<Cobranca["situacao"], string> = {
  pago: "text-emerald-600 dark:text-emerald-400",
  aberto: "text-muted-foreground",
  atrasado: "text-rose-600 dark:text-rose-400",
}

export function FinanceiroView({
  cobrancas,
  despesas,
  lojas,
}: {
  cobrancas: Cobranca[]
  despesas: Despesa[]
  lojas: LojaSimples[]
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Bloco titulo="A receber" acao={<NovaCobranca lojas={lojas} />}>
        {cobrancas.length === 0 ? (
          <Vazio>Nenhuma cobrança com vencimento no período.</Vazio>
        ) : (
          <ul className="divide-y">
            {cobrancas.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  {c.loja ?? "Sem loja"}
                  {c.observacao && (
                    <span className="ml-1.5 text-[11px] text-muted-foreground">
                      {c.observacao}
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  vence {dataBR(c.vencimento)}
                </span>
                <span className={`text-[11px] font-medium ${CORES[c.situacao]}`}>
                  {c.situacao === "pago"
                    ? `pago ${c.pagoEm ? dataBR(c.pagoEm) : ""}`
                    : c.situacao}
                </span>
                <span className="w-24 text-right font-medium tabular-nums">
                  {fmtBRL(c.valor)}
                </span>
                <Baixa id={c.id} tipo="cobranca" pago={c.situacao === "pago"} />
              </li>
            ))}
          </ul>
        )}
      </Bloco>

      <Bloco titulo="Despesas da agência" acao={<NovaDespesa />}>
        {despesas.length === 0 ? (
          <Vazio>
            Nenhuma despesa no período. Aqui entram folha, ferramentas,
            impostos — o custo da AGÊNCIA, não o da loja.
          </Vazio>
        ) : (
          <ul className="divide-y">
            {despesas.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm"
              >
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                  {d.categoria}
                </span>
                <span className="min-w-0 flex-1 truncate">{d.descricao}</span>
                <span className="text-[11px] text-muted-foreground">
                  {dataBR(d.vencimento)}
                </span>
                <span
                  className={`text-[11px] font-medium ${d.pagoEm ? CORES.pago : CORES.aberto}`}
                >
                  {d.pagoEm ? "pago" : "em aberto"}
                </span>
                <span className="w-24 text-right font-medium tabular-nums">
                  {fmtBRL(d.valor)}
                </span>
                <Baixa id={d.id} tipo="despesa" pago={d.pagoEm !== null} />
              </li>
            ))}
          </ul>
        )}
      </Bloco>
    </div>
  )
}

function Bloco({
  titulo,
  acao,
  children,
}: {
  titulo: string
  acao: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        {acao}
      </div>
      {children}
    </div>
  )
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

function Baixa({
  id,
  tipo,
  pago,
}: {
  id: string
  tipo: "cobranca" | "despesa"
  pago: boolean
}) {
  const [state, action] = useActionState(alternarPago, INICIAL)
  const router = useRouter()
  React.useEffect(() => {
    if (state.ok) router.refresh()
  }, [state.ok, router])

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="pagar" value={pago ? "0" : "1"} />
      <BotaoBaixa pago={pago} />
    </form>
  )
}

function BotaoBaixa({ pago }: { pago: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors hover:bg-muted disabled:opacity-60"
    >
      {/* Desfazer existe de propósito: baixa errada sem volta obriga a mexer
          no banco, e é sempre um clique de distância. */}
      {pago ? "desfazer" : "dar baixa"}
    </button>
  )
}

function NovaCobranca({ lojas }: { lojas: LojaSimples[] }) {
  return (
    <Formulario acao={lancarCobranca} rotulo="Cobrança">
      <SeletorBusca
        name="unitId"
        opcoes={lojas.map((l) => ({ id: l.id, rotulo: l.name, detalhe: l.code }))}
        placeholder="Sem loja específica"
        vazio="Sem loja específica"
      />
      <Campo nome="valor" rotulo="Valor (R$)" placeholder="990,00" />
      <Campo nome="vencimento" rotulo="Vencimento" tipo="date" />
      <Campo nome="pagoEm" rotulo="Pago em (se já pagou)" tipo="date" />
      <Campo nome="observacao" rotulo="Observação" placeholder="opcional" />
    </Formulario>
  )
}

function NovaDespesa() {
  return (
    <Formulario acao={lancarDespesa} rotulo="Despesa">
      <Campo nome="categoria" rotulo="Categoria" placeholder="Folha, Ferramentas…" />
      <Campo nome="descricao" rotulo="Descrição" placeholder="o que foi" />
      <Campo nome="valor" rotulo="Valor (R$)" placeholder="1.200,00" />
      <Campo nome="vencimento" rotulo="Vencimento" tipo="date" />
      <Campo nome="pagoEm" rotulo="Pago em (se já pagou)" tipo="date" />
    </Formulario>
  )
}

function Formulario({
  acao,
  rotulo,
  children,
}: {
  acao: (p: FinState, f: FormData) => Promise<FinState>
  rotulo: string
  children: React.ReactNode
}) {
  const [state, action] = useActionState(acao, INICIAL)
  const [mostrar, setMostrar] = React.useState(false)
  const router = useRouter()
  const ref = React.useRef<HTMLFormElement>(null)
  React.useEffect(() => {
    if (state.ok) {
      ref.current?.reset()
      setMostrar(false)
      router.refresh()
    }
  }, [state.ok, router])

  if (!mostrar) {
    return (
      <Button size="sm" variant="outline" onClick={() => setMostrar(true)}>
        <Plus className="size-3.5" /> {rotulo}
      </Button>
    )
  }
  return (
    <form
      ref={ref}
      action={action}
      className="absolute right-4 z-10 mt-2 flex w-64 flex-col gap-2 rounded-xl border bg-card p-3 shadow-xl"
    >
      {children}
      {state.error && <p className="text-[11px] text-rose-600">{state.error}</p>}
      <div className="flex gap-2">
        <Enviar />
        <Button type="button" size="sm" variant="ghost" onClick={() => setMostrar(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

function Campo({
  nome,
  rotulo,
  tipo = "text",
  placeholder,
}: {
  nome: string
  rotulo: string
  tipo?: string
  placeholder?: string
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] text-muted-foreground">{rotulo}</span>
      <input
        name={nome}
        type={tipo}
        placeholder={placeholder}
        className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus:border-ring"
      />
    </label>
  )
}

function Enviar() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando…" : "Lançar"}
    </Button>
  )
}
