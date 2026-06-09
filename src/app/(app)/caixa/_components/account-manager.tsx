"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CreditCard, Loader2, Plus, Trash2, Wallet, X } from "lucide-react"

import { fmtBRL } from "@/lib/format"
import type { FinAccount } from "@/lib/data/caixa"

import { deleteAccount, saveAccount } from "../_actions"
import { bankColor } from "./fin-icon"

const BANKS = [
  "itau",
  "inter",
  "btg",
  "santander",
  "bradesco",
  "nubank",
  "caixa",
  "bb",
  "asaas",
  "sicoob",
  "safra",
]

export function AccountManager({
  accounts,
  mode,
}: {
  accounts: FinAccount[]
  mode: "conta" | "cartao"
}) {
  const isCard = mode === "cartao"
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)
    fd.set("kind", isCard ? "cartao" : "conta_corrente")
    start(async () => {
      const r = await saveAccount(fd)
      if (r.ok) {
        form.reset()
        setOpen(false)
        setError(null)
        router.refresh()
      } else setError(r.message ?? "Erro")
    })
  }

  function remove(id: string) {
    if (!confirm(`Excluir ${isCard ? "cartão" : "conta"}?`)) return
    start(async () => {
      await deleteAccount(id)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isCard
            ? "Cartões de crédito — fatura, limite e datas."
            : "Contas bancárias, dinheiro e carteiras."}
        </p>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" />
          {isCard ? "Novo cartão" : "Nova conta"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.length === 0 && (
          <div className="col-span-full rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
            Nenhum {isCard ? "cartão" : "conta"} cadastrado.
          </div>
        )}
        {accounts.map((a) => (
          <div key={a.id} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg text-white ${bankColor(a.bank)}`}
              >
                {isCard ? <CreditCard className="size-4" /> : <Wallet className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{a.name}</div>
                <div className="text-[11px] capitalize text-muted-foreground">{a.bank ?? "—"}</div>
              </div>
              <button onClick={() => remove(a.id)} className="rounded p-1 hover:bg-accent">
                <Trash2 className="size-3.5 text-muted-foreground" />
              </button>
            </div>
            <div className="mt-3 border-t pt-2 text-sm">
              {isCard ? (
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Limite</span>
                    <span className="tabular-nums">{a.cardLimit ? fmtBRL(a.cardLimit) : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fecha / vence</span>
                    <span>
                      {a.closingDay ?? "—"} / {a.dueDay ?? "—"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">Saldo inicial</span>
                  <span className="font-semibold tabular-nums">{fmtBRL(a.initialBalance)}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">{isCard ? "Novo cartão" : "Nova conta"}</h2>
              <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-accent">
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <Field label="Nome">
                <input name="name" required placeholder={isCard ? "Ex: Cartão Inter" : "Ex: Itaú PJ"} className={inputCls} />
              </Field>
              <Field label="Banco / bandeira">
                <select name="bank" className={inputCls} defaultValue="">
                  <option value="">—</option>
                  {BANKS.map((b) => (
                    <option key={b} value={b} className="capitalize">
                      {b}
                    </option>
                  ))}
                </select>
              </Field>
              {isCard ? (
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
              ) : (
                <Field label="Saldo inicial (R$)">
                  <input name="initial_balance" inputMode="decimal" placeholder="0,00" className={inputCls} />
                </Field>
              )}
              {error && <p className="text-xs text-rose-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} className="rounded-md border px-3 py-2 text-sm hover:bg-accent">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
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
