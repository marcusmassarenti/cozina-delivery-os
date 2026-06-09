"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CreditCard, Loader2, Plus, Repeat, X } from "lucide-react"

import { saveEntry } from "../_actions"
import type { FinAccount, FinCategory } from "@/lib/data/caixa"

type Kind = "despesa" | "receita" | "transferencia"

const KIND_STYLE: Record<Kind, string> = {
  despesa: "bg-rose-500 text-white",
  receita: "bg-emerald-500 text-white",
  transferencia: "bg-sky-500 text-white",
}
const KIND_LABEL: Record<Kind, string> = {
  despesa: "Despesa",
  receita: "Receita",
  transferencia: "Transferência",
}

export function LancamentoDialog({
  accounts,
  categories,
  defaultKind,
  label = "Novo Lançamento",
}: {
  accounts: FinAccount[]
  categories: FinCategory[]
  defaultKind?: Kind
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<Kind>(defaultKind ?? "despesa")
  const [recorrente, setRecorrente] = useState(false)
  const [accountId, setAccountId] = useState("")
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const cats = categories.filter((c) => c.kind === kind)
  const isTransfer = kind === "transferencia"
  const selectedAcc = accounts.find((a) => a.id === accountId)
  const isCard = selectedAcc?.kind === "cartao" && kind === "despesa"

  function submit(formData: FormData) {
    formData.set("kind", kind)
    if (!recorrente) formData.set("recorrencia", "1")
    start(async () => {
      const r = await saveEntry(formData)
      if (r.ok) {
        setOpen(false)
        setError(null)
        setRecorrente(false)
        router.refresh()
      } else setError(r.message ?? "Erro ao salvar.")
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
        {label}
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

            <div className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
              {(["despesa", "receita", "transferencia"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`rounded-md py-1.5 text-sm font-medium transition ${
                    kind === k ? KIND_STYLE[k] : "text-muted-foreground hover:bg-background"
                  }`}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>

            <form action={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Valor (R$)">
                  <input name="value" inputMode="decimal" placeholder="0,00" required className={inputCls} />
                </Field>
                <Field label={isTransfer ? "Data" : "Vence em"}>
                  <input name="due_date" type="date" className={inputCls} />
                </Field>
              </div>

              {isTransfer ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="De (origem)">
                    <select name="account_id" className={inputCls} defaultValue="" required>
                      <option value="">—</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Para (destino)">
                    <select name="to_account_id" className={inputCls} defaultValue="" required>
                      <option value="">—</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Conta / Cartão">
                      <select
                        name="account_id"
                        className={inputCls}
                        value={accountId}
                        onChange={(e) => setAccountId(e.target.value)}
                      >
                        <option value="">—</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.kind === "cartao" ? "💳 " : ""}
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
                </>
              )}

              <Field label="Descrição">
                <input name="description" placeholder="Descrição do lançamento" className={inputCls} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={isTransfer ? "Efetivada em" : "Pago/recebido em"}>
                  <input name="paid_date" type="date" className={inputCls} />
                </Field>
                {!isTransfer && (
                  <Field label="Tags">
                    <input name="tags" placeholder="separadas por vírgula" className={inputCls} />
                  </Field>
                )}
              </div>

              {/* Cartão → parcelamento · Conta → recorrência */}
              {isCard ? (
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 dark:border-sky-900/40 dark:bg-sky-950/20">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CreditCard className="size-4 text-sky-600" />
                    Parcelar em
                    <input
                      name="parcelas"
                      type="number"
                      min={1}
                      max={60}
                      defaultValue={1}
                      className={`${inputCls} w-16`}
                    />
                    x
                  </div>
                  <p className="mt-1.5 text-[11px] text-sky-700 dark:text-sky-300">
                    💳 Compra no cartão: cada parcela vai pra uma fatura. Não impacta o caixa até a
                    fatura ser paga.
                  </p>
                </div>
              ) : !isTransfer ? (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={recorrente}
                      onChange={(e) => setRecorrente(e.target.checked)}
                      className="size-4 accent-primary"
                    />
                    <Repeat className="size-4 text-muted-foreground" />
                    Repetir todo mês (conta recorrente)
                  </label>
                  {recorrente && (
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Por</span>
                      <input
                        name="recorrencia"
                        type="number"
                        min={2}
                        max={60}
                        defaultValue={12}
                        className={`${inputCls} w-20`}
                      />
                      <span className="text-muted-foreground">meses · 1 lançamento por mês</span>
                    </div>
                  )}
                </div>
              ) : null}

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
