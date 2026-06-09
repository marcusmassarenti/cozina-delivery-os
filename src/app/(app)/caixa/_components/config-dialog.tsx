"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Settings2, Sparkles, Trash2, X } from "lucide-react"

import { fmtBRL } from "@/lib/format"
import type { FinAccount, FinCategory } from "@/lib/data/caixa"

import {
  deleteAccount,
  deleteCategory,
  saveAccount,
  saveCategory,
  seedDefaultCategories,
} from "../_actions"
import { FIN_ICON_NAMES, FinIcon, bankColor } from "./fin-icon"

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

export function ConfigDialog({
  accounts,
  categoriesFlat,
}: {
  accounts: FinAccount[]
  categoriesFlat: FinCategory[]
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<"contas" | "categorias">("contas")
  const [pending, start] = useTransition()
  const router = useRouter()

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, form?: HTMLFormElement) {
    start(async () => {
      const r = await fn()
      if (r.ok) {
        form?.reset()
        router.refresh()
      } else alert(r.message ?? "Erro")
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-accent"
      >
        <Settings2 className="size-4" />
        Configurar
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-xl rounded-xl border bg-card p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Configurar caixa</h2>
              <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-accent">
                <X className="size-4" />
              </button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(["contas", "categorias"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-md py-1.5 text-sm font-medium capitalize ${
                    tab === t ? "bg-background shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === "contas" && (
              <div className="space-y-3">
                <form
                  className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    run(() => saveAccount(new FormData(e.currentTarget)), e.currentTarget)
                  }}
                >
                  <input name="name" placeholder="Nome da conta" required className={inputCls} />
                  <select name="bank" className={inputCls} defaultValue="">
                    <option value="">Banco</option>
                    {BANKS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                  <input name="initial_balance" placeholder="Saldo" className={`${inputCls} w-24`} />
                  <button disabled={pending} className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50">
                    {pending ? <Loader2 className="size-4 animate-spin" /> : "+"}
                  </button>
                </form>
                <div className="divide-y rounded-lg border">
                  {accounts.length === 0 && (
                    <p className="p-3 text-xs text-muted-foreground">Nenhuma conta ainda.</p>
                  )}
                  {accounts.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 px-3 py-2">
                      <span className={`size-6 rounded-md ${bankColor(a.bank)}`} />
                      <span className="flex-1 text-sm">{a.name}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {fmtBRL(a.initialBalance)}
                      </span>
                      <button
                        onClick={() => confirm("Excluir conta?") && run(() => deleteAccount(a.id))}
                        className="rounded p-1 hover:bg-accent"
                      >
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "categorias" && (
              <div className="space-y-3">
                {categoriesFlat.length === 0 && (
                  <button
                    onClick={() => run(() => seedDefaultCategories())}
                    disabled={pending}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed bg-accent/40 py-3 text-sm font-medium hover:bg-accent disabled:opacity-50"
                  >
                    <Sparkles className="size-4" />
                    Criar categorias padrão de restaurante
                  </button>
                )}
                <form
                  className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    run(() => saveCategory(new FormData(e.currentTarget)), e.currentTarget)
                  }}
                >
                  <input name="name" placeholder="Nova categoria" required className={inputCls} />
                  <select name="kind" className={inputCls} defaultValue="despesa">
                    <option value="despesa">Despesa</option>
                    <option value="receita">Receita</option>
                  </select>
                  <select name="parent_id" className={inputCls} defaultValue="">
                    <option value="">(sem pai)</option>
                    {categoriesFlat
                      .filter((c) => !c.parentId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                  <select name="icon" className={`${inputCls} w-20`} defaultValue="Tag">
                    {FIN_ICON_NAMES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <button disabled={pending} className="col-span-4 h-9 rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:opacity-50">
                    {pending ? <Loader2 className="mx-auto size-4 animate-spin" /> : "Adicionar categoria"}
                  </button>
                </form>
                <div className="max-h-64 divide-y overflow-y-auto rounded-lg border">
                  {categoriesFlat.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 px-3 py-1.5">
                      <FinIcon name={c.icon} className="size-4 text-muted-foreground" />
                      <span className={`flex-1 text-sm ${c.parentId ? "pl-3 text-muted-foreground" : ""}`}>
                        {c.parentId ? "↳ " : ""}
                        {c.name}
                      </span>
                      <span
                        className={`rounded px-1.5 text-[9px] font-bold uppercase ${
                          c.kind === "despesa" ? "text-rose-600" : "text-emerald-600"
                        }`}
                      >
                        {c.kind}
                      </span>
                      <button
                        onClick={() => confirm("Excluir categoria?") && run(() => deleteCategory(c.id))}
                        className="rounded p-1 hover:bg-accent"
                      >
                        <Trash2 className="size-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

const inputCls =
  "h-9 rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
