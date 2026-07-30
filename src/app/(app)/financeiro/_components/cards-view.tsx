"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Info,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react"

import { fmtBRL } from "@/lib/format"
import type { CardInvoice, FinAccount, FinCategory } from "@/lib/data/caixa"

import { deleteAccount, payCardInvoice, saveAccount } from "../_actions"
import { FinIcon } from "./fin-icon"
import { BankBadge } from "./bank-badge"

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
]
const BANKS = ["itau", "inter", "btg", "santander", "bradesco", "nubank", "caixa", "bb", "asaas"]

type CardData = { account: FinAccount; invoices: CardInvoice[] }

export function CardsView({
  cards,
  contas,
  categories,
}: {
  cards: CardData[]
  contas: FinAccount[]
  categories: FinCategory[]
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [pending, start] = useTransition()
  const router = useRouter()
  const catById = new Map(categories.map((c) => [c.id, c]))

  function addCard(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    fd.set("kind", "cartao")
    start(async () => {
      const r = await saveAccount(fd)
      if (r.ok) {
        form.reset()
        setAddOpen(false)
        router.refresh()
      } else alert(r.message)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Cartões de Crédito</h2>
          <p className="text-sm text-muted-foreground">{cards.length} cartão(ões) cadastrado(s)</p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" />
          Adicionar cartão
        </button>
      </div>

      <div className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200">
        <Info className="size-4 shrink-0" />
        <p>
          <strong>Como funciona:</strong> as compras no cartão ficam isoladas aqui na fatura e{" "}
          <strong>não impactam o Fluxo de Caixa</strong>. Apenas o <strong>pagamento da fatura</strong>{" "}
          entra no caixa quando você clica em &quot;Pagar fatura&quot;.
        </p>
      </div>

      {cards.length === 0 && (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhum cartão cadastrado.
        </div>
      )}

      {cards.map((c) => (
        <CardItem key={c.account.id} data={c} contas={contas} catById={catById} />
      ))}

      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Novo cartão</h2>
              <button onClick={() => setAddOpen(false)} className="rounded p-1 hover:bg-accent">
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={addCard} className="space-y-3">
              <Field label="Nome">
                <input name="name" required placeholder="Ex: Crédito Itaú" className={inputCls} />
              </Field>
              <Field label="Bandeira / banco">
                <select name="bank" defaultValue="" className={inputCls}>
                  <option value="">—</option>
                  {BANKS.map((b) => (
                    <option key={b} value={b} className="capitalize">
                      {b}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Limite (R$)">
                  <input name="card_limit" inputMode="decimal" placeholder="0,00" className={inputCls} />
                </Field>
                <Field label="Fecha dia">
                  <input name="closing_day" type="number" min={1} max={31} className={inputCls} />
                </Field>
                <Field label="Vence dia">
                  <input name="due_day" type="number" min={1} max={31} className={inputCls} />
                </Field>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setAddOpen(false)} className="rounded-md border px-3 py-2 text-sm hover:bg-accent">
                  Cancelar
                </button>
                <button disabled={pending} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                  {pending && <Loader2 className="size-3.5 animate-spin" />}
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function CardItem({
  data,
  contas,
  catById,
}: {
  data: CardData
  contas: FinAccount[]
  catById: Map<string, FinCategory>
}) {
  const { account, invoices } = data
  const [idx, setIdx] = useState(0)
  const [pending, start] = useTransition()
  const router = useRouter()
  const inv = invoices[idx]

  // Contas que podem pagar a fatura (dinheiro/banco — nunca outro cartão).
  const contasPagadoras = contas.filter((c) => c.kind !== "cartao")
  const [payFrom, setPayFrom] = useState(contasPagadoras[0]?.id ?? "")

  const totalAberto = invoices.filter((i) => !i.paid).reduce((s, i) => s + i.total, 0)
  const disponivel = account.cardLimit != null ? account.cardLimit - totalAberto : null

  function pagar() {
    if (!inv) return
    const contaId = payFrom || contasPagadoras[0]?.id
    if (!contaId) return alert("Cadastre uma conta antes de pagar a fatura.")
    if (!confirm(`Pagar a fatura de ${MESES[inv.month - 1]}/${inv.year} (${fmtBRL(inv.total)})?`)) return
    start(async () => {
      const r = await payCardInvoice(account.id, inv.year, inv.month, contaId)
      if (r.ok) router.refresh()
      else alert(r.message)
    })
  }

  function remove() {
    if (
      !confirm(
        "Excluir cartão e TODOS os lançamentos dele? Essa ação não pode ser desfeita.",
      )
    )
      return
    start(async () => {
      await deleteAccount(account.id)
      router.refresh()
    })
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b p-4">
        {account.bank || account.logoUrl ? (
          <BankBadge bank={account.bank} logoUrl={account.logoUrl} size={40} />
        ) : (
          <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <CreditCard className="size-5" />
          </span>
        )}
        <div className="flex-1">
          <div className="font-semibold">{account.name}</div>
          <div className="text-[11px] text-muted-foreground">
            Fecha dia {account.closingDay ?? "—"} · Vence dia {account.dueDay ?? "—"}
          </div>
        </div>
        {inv && !inv.paid && (
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-rose-700">
            Em aberto
          </span>
        )}
        <button onClick={remove} className="rounded p-1 hover:bg-accent">
          <Trash2 className="size-4 text-muted-foreground" />
        </button>
      </div>

      {/* navegador de fatura */}
      <div className="flex items-center justify-between bg-muted/40 px-4 py-3">
        <button
          onClick={() => setIdx((i) => Math.min(invoices.length - 1, i + 1))}
          disabled={idx >= invoices.length - 1}
          className="rounded p-1 hover:bg-background disabled:opacity-30"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Fatura</div>
          <div className="text-sm font-semibold">
            {inv ? `${MESES[inv.month - 1]} de ${inv.year}` : "—"}
          </div>
        </div>
        <button
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx <= 0}
          className="rounded p-1 hover:bg-background disabled:opacity-30"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 border-b px-4 py-3 text-center">
        <Stat label="Valor da fatura" value={inv ? fmtBRL(inv.total) : "—"} tone="neg" />
        <Stat label="Disponível" value={disponivel != null ? fmtBRL(disponivel) : "—"} />
        <Stat label="Limite" value={account.cardLimit != null ? fmtBRL(account.cardLimit) : "—"} />
      </div>

      <div className="p-4">
        {!inv || inv.entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum lançamento nesta fatura</p>
        ) : (
          <div className="divide-y">
            {inv.entries.map((e) => {
              const cat = e.categoryId ? catById.get(e.categoryId) : null
              return (
                <div key={e.id} className="flex items-center gap-3 py-2">
                  <FinIcon name={cat?.icon ?? null} className="size-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{e.titular || e.description || cat?.name || "Compra"}</div>
                    {e.installmentTotal && e.installmentTotal > 1 && (
                      <div className="text-[11px] text-muted-foreground">
                        Parcela {e.installmentNo}/{e.installmentTotal}
                      </div>
                    )}
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-rose-600">
                    {fmtBRL(e.value)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
        {inv && !inv.paid && inv.total > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {contasPagadoras.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="shrink-0">Pagar com</span>
                <select
                  value={payFrom}
                  onChange={(e) => setPayFrom(e.target.value)}
                  className="h-8 flex-1 rounded-md border bg-card px-2 text-xs font-medium text-foreground"
                >
                  {contasPagadoras.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              onClick={pagar}
              disabled={pending}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              Pagar fatura ({fmtBRL(inv.total)})
            </button>
          </div>
        )}
        {inv?.paid && inv.total > 0 && (
          <p className="mt-3 text-center text-xs font-medium text-emerald-600">✓ Fatura paga</p>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "neg" }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${tone === "neg" ? "text-rose-600" : ""}`}>
        {value}
      </div>
    </div>
  )
}

const inputCls =
  "h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
