"use client"

import * as React from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"
import { useFormStatus } from "react-dom"
import { Check, Copy, Plus, Wallet } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fmtBRL } from "@/lib/format"
import type { Comissao, Indicador } from "@/lib/data/indicacoes"

import { marcarComissoesPagas, salvarIndicador, type IndicacaoState } from "../_actions"

const inicial: IndicacaoState = { ok: false }

export function IndicacoesView({
  indicadores,
  comissoes,
  site,
}: {
  indicadores: Indicador[]
  comissoes: Comissao[]
  site: string
}) {
  const router = useRouter()
  const [editando, setEditando] = React.useState<Indicador | null>(null)
  const [novo, setNovo] = React.useState(false)

  const aPagar = comissoes.filter((c) => c.status === "a_pagar")
  const totalAPagar = aPagar.reduce((s, c) => s + c.valor, 0)

  const [sel, setSel] = React.useState<Set<string>>(new Set())
  const [pagando, setPagando] = React.useState(false)

  async function pagar() {
    setPagando(true)
    await marcarComissoesPagas([...sel])
    setSel(new Set())
    setPagando(false)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi titulo="Indicadores ativos" valor={String(indicadores.filter((i) => i.ativo).length)} />
        <Kpi
          titulo="Clientes indicados"
          valor={String(indicadores.reduce((s, i) => s + i.indicados.length, 0))}
        />
        <Kpi
          titulo="A pagar de Pix"
          valor={fmtBRL(totalAPagar)}
          destaque={totalAPagar > 0}
        />
      </div>

      {/* ── Indicadores ──────────────────────────────────────────────── */}
      <section className="rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-sm font-semibold">Quem pode indicar</h2>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setEditando(null)
              setNovo(true)
            }}
          >
            <Plus className="size-4" /> Novo indicador
          </Button>
        </div>

        {(novo || editando) && (
          <div className="border-b bg-muted/30 p-5">
            <FormIndicador
              indicador={editando}
              onDone={() => {
                setNovo(false)
                setEditando(null)
                router.refresh()
              }}
            />
          </div>
        )}

        <div className="divide-y">
          {indicadores.map((i) => (
            <div key={i.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{i.nome}</span>
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold">
                    {i.codigo}
                  </code>
                  {!i.ativo && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      inativo
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ganha {i.comissaoPct}% da mensalidade · indicado leva {i.descontoPct}% na 1ª
                  fatura
                  {i.pixChave ? ` · Pix ${i.pixChave}` : " · sem chave Pix cadastrada"}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <LinkCopiavel url={`${site}/cadastro?ref=${encodeURIComponent(i.codigo)}`} />
                </div>
                {i.indicados.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Trouxe:{" "}
                    {i.indicados.map((c) => `${c.nome}${c.pagante ? "" : " (não pagante)"}`).join(", ")}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  a pagar
                </p>
                <p
                  className={`text-lg font-semibold tabular-nums ${i.aPagar > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}
                >
                  {fmtBRL(i.aPagar)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  já pago: {fmtBRL(i.jaPago)}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setNovo(false)
                    setEditando(i)
                  }}
                  className="mt-1 text-xs underline underline-offset-2 hover:opacity-80"
                >
                  editar
                </button>
              </div>
            </div>
          ))}
          {indicadores.length === 0 && !novo && (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              Nenhum indicador ainda. Crie um código pro Diego e mande o link dele no WhatsApp.
            </p>
          )}
        </div>
      </section>

      {/* ── Comissões ────────────────────────────────────────────────── */}
      <section className="rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
          <h2 className="text-sm font-semibold">Comissões</h2>
          {sel.size > 0 && (
            <Button type="button" size="sm" onClick={pagar} disabled={pagando}>
              <Wallet className="size-4" />
              {pagando ? "Marcando…" : `Marcar ${sel.size} como paga(s)`}
            </Button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="w-8 px-5 py-2.5"></th>
                <th className="px-3 py-2.5 font-semibold">Indicador</th>
                <th className="px-3 py-2.5 font-semibold">Cliente</th>
                <th className="px-3 py-2.5 font-semibold">Mês</th>
                {/* "Base" sozinho não dizia base do quê. Desde 25/08/26 é o
                    valor PAGO, não o faturado — e essa distinção vale dinheiro
                    quando o indicador oferece desconto. */}
                <th className="px-3 py-2.5 text-right font-semibold">
                  Valor pago
                </th>
                <th className="px-3 py-2.5 text-right font-semibold">Comissão</th>
                <th className="px-3 py-2.5 font-semibold">Situação</th>
              </tr>
            </thead>
            <tbody>
              {comissoes.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="px-5 py-2.5">
                    {c.status === "a_pagar" && (
                      <input
                        type="checkbox"
                        aria-label={`Selecionar comissão de ${c.indicador}`}
                        checked={sel.has(c.id)}
                        onChange={() =>
                          setSel((p) => {
                            const n = new Set(p)
                            n.has(c.id) ? n.delete(c.id) : n.add(c.id)
                            return n
                          })
                        }
                        className="size-3.5 cursor-pointer accent-primary"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{c.indicador}</div>
                    {c.pixChave && (
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {c.pixChave}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">{c.cliente}</td>
                  <td className="px-3 py-2.5 tabular-nums">{c.competencia}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {fmtBRL(c.baseValor)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                    {fmtBRL(c.valor)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        c.status === "paga"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                      }`}
                    >
                      {c.status === "paga" ? `paga ${c.pagoEm ?? ""}` : "a pagar"}
                    </span>
                  </td>
                </tr>
              ))}
              {comissoes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-muted-foreground">
                    Nenhuma comissão ainda. Ela nasce quando a fatura do cliente indicado é
                    <strong> paga</strong> — não quando ele se cadastra.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        A comissão só é apurada sobre fatura <strong>paga</strong>. Comissão sobre fatura em aberto
        seria promessa, não dívida — e você acabaria mandando Pix por cliente que nunca pagou.
      </p>
    </div>
  )
}

function LinkCopiavel({ url }: { url: string }) {
  const [copiado, setCopiado] = React.useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(url)
        setCopiado(true)
        setTimeout(() => setCopiado(false), 1500)
      }}
      className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] text-muted-foreground hover:bg-muted"
      title="Copiar link de indicação"
    >
      {copiado ? <Check className="size-3" /> : <Copy className="size-3" />}
      {url.replace(/^https?:\/\//, "")}
    </button>
  )
}

function FormIndicador({
  indicador,
  onDone,
}: {
  indicador: Indicador | null
  onDone: () => void
}) {
  const [state, action] = useActionState(salvarIndicador, inicial)
  React.useEffect(() => {
    if (state.ok) onDone()
  }, [state.ok, onDone])

  return (
    <form action={action} className="flex flex-col gap-3">
      {indicador && <input type="hidden" name="id" value={indicador.id} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo label="Nome" name="nome" defaultValue={indicador?.nome} placeholder="Diego Azevedo" />
        <Campo
          label="Código do cupom"
          name="codigo"
          defaultValue={indicador?.codigo}
          placeholder="DIEGO"
        />
        <Campo
          label="Chave Pix"
          name="pix"
          defaultValue={indicador?.pixChave ?? ""}
          placeholder="CPF, e-mail ou telefone"
          required={false}
        />
        <Campo
          label="Contato"
          name="contato"
          defaultValue={indicador?.contato ?? ""}
          placeholder="WhatsApp ou e-mail"
          required={false}
        />
        <Campo
          label="Comissão (% da mensalidade)"
          name="comissao"
          defaultValue={String(indicador?.comissaoPct ?? 20)}
          placeholder="20"
        />
        <Campo
          label="Desconto do indicado (% na 1ª fatura)"
          name="desconto"
          defaultValue={String(indicador?.descontoPct ?? 50)}
          placeholder="50"
        />
      </div>
      <Campo
        label="Observação"
        name="nota"
        defaultValue={indicador?.nota ?? ""}
        placeholder="combinado, prazo, o que ficou acertado"
        required={false}
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="ativo"
          defaultChecked={indicador ? indicador.ativo : true}
          className="size-4 accent-primary"
        />
        Ativo (o cupom funciona no cadastro)
      </label>
      {state.message && (
        <p className={`text-xs ${state.ok ? "text-emerald-600" : "text-rose-600"}`}>
          {state.message}
        </p>
      )}
      <div className="flex gap-2">
        <Salvar />
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

function Salvar() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Salvando…" : "Salvar"}
    </Button>
  )
}

function Campo({
  label,
  name,
  defaultValue,
  placeholder,
  required = true,
}: {
  label: string
  name: string
  defaultValue?: string
  placeholder?: string
  required?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      <Input name={name} defaultValue={defaultValue} placeholder={placeholder} required={required} />
    </div>
  )
}

function Kpi({
  titulo,
  valor,
  destaque,
}: {
  titulo: string
  valor: string
  destaque?: boolean
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {titulo}
      </p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${destaque ? "text-amber-600 dark:text-amber-400" : ""}`}
      >
        {valor}
      </p>
    </div>
  )
}
