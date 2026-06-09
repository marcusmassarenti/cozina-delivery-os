"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Plus, X } from "lucide-react"

import { saveEntry } from "../_actions"
import type { FinAccount, FinCategory } from "@/lib/data/caixa"

type Props = {
  accounts: FinAccount[]
  categories: FinCategory[] // flat
  defaultKind?: "despesa" | "receita"
}

export function LancamentoDialog({ accounts, categories, defaultKind }: Props) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<"despesa" | "receita">(defaultKind ?? "despesa")
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const cats = categories.filter((c) => c.kind === kind)

  function submit(formData: FormData) {
    formData.set("kind", kind)
    start(async () => {
      const r = await saveEntry(formData)
      if (r.ok) {
        setOpen(false)
        setError(null)
        router.refresh()
      } else {
        setError(r.message ?? "Erro ao salvar.")
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <Plus className="size-4" />
        Novo Lançamento
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-xl border bg-card p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Novo Lançamento</h2>
              <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-accent">
                <X className="size-4" />
              </button>
            </div>

            {/* Despesa / Receita */}
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(["despesa", "receita"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`rounded-md py-1.5 text-sm font-medium capitalize transition ${
                    kind === k
                      ? k === "despesa"
                        ? "bg-rose-500 text-white"
                        : "bg-emerald-500 text-white"
                      : "text-muted-foreground hover:bg-background"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>

            <form action={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Valor (R$)">
                  <input
                    name="value"
                    inputMode="decimal"
                    placeholder="0,00"
                    required
                    className={inputCls}
                  />
                </Field>
                <Field label="Vence em">
                  <input name="due_date" type="date" className={inputCls} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Conta">
                  <select name="account_id" className={inputCls} defaultValue="">
                    <option value="">—</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Categoria">
                  <select name="category_id" className={inputCls} defaultValue="">
                    <option value="">—</option>
                    {cats.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.parentId ? "↳ " : ""}
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Cliente / Fornecedor">
                <input name="titular" placeholder="Nome" className={inputCls} />
              </Field>

              <Field label="Descrição">
                <input name="description" placeholder="Descrição do lançamento" className={inputCls} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Pago/recebido em (efetivo)">
                  <input name="paid_date" type="date" className={inputCls} />
                </Field>
                <Field label="Tags">
                  <input name="tags" placeholder="separadas por vírgula" className={inputCls} />
                </Field>
              </div>

              {error && <p className="text-xs text-rose-600">{error}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border px-3 py-2 text-sm hover:bg-accent"
                >
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
    </>
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
