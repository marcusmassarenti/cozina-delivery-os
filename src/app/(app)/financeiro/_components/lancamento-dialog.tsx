"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CreditCard, Loader2, Plus, Repeat, X } from "lucide-react"

import { saveEntry } from "../_actions"
import type { FinAccount, FinCategory, FinContact, FinEntry } from "@/lib/data/caixa"

import { ContatoPicker } from "./contato-picker"
import { CategoryPicker } from "./category-picker"

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

/** Modal/formulário de lançamento — usado tanto pra CRIAR quanto pra EDITAR. */
export function LancamentoModal({
  accounts,
  categories,
  contacts = [],
  units = [],
  entry,
  defaultKind,
  onClose,
  onSaved,
}: {
  accounts: FinAccount[]
  categories: FinCategory[]
  contacts?: FinContact[]
  units?: { id: string; name: string }[]
  entry?: FinEntry | null
  defaultKind?: Kind
  onClose: () => void
  onSaved: () => void
}) {
  const isEditing = !!entry
  const [kind, setKind] = useState<Kind>(entry?.kind ?? defaultKind ?? "despesa")
  const [recorrente, setRecorrente] = useState(false)
  const sp = useSearchParams()
  const lojaParam = sp.get("loja")
  const defaultUnit =
    !entry && lojaParam && lojaParam !== "todas" && lojaParam !== "rede" ? lojaParam : ""
  const [accountId, setAccountId] = useState(entry?.accountId ?? "")
  const [unitId, setUnitId] = useState(entry?.unitId ?? defaultUnit)

  function pickAccount(id: string) {
    setAccountId(id)
    const acc = accounts.find((a) => a.id === id)
    if (acc?.unitId) setUnitId(acc.unitId)
  }
  function setLoja(v: string) {
    setUnitId(v)
    // se a conta escolhida é de outra loja, limpa pra evitar mismatch
    const acc = accounts.find((a) => a.id === accountId)
    if (acc?.unitId && acc.unitId !== v) setAccountId("")
  }
  const [titular, setTitular] = useState(entry?.titular ?? "")
  const [valor, setValor] = useState(
    entry ? entry.value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "",
  )
  const [categoryId, setCategoryId] = useState(entry?.categoryId ?? "")
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const isTransfer = kind === "transferencia"
  const selectedAcc = accounts.find((a) => a.id === accountId)
  const isCard = selectedAcc?.kind === "cartao" && kind === "despesa"

  function submit(formData: FormData) {
    formData.set("kind", kind)
    formData.set("unit_id", unitId)
    if (isEditing) formData.set("id", entry!.id)
    if (!recorrente) formData.set("recorrencia", "1")
    start(async () => {
      const r = await saveEntry(formData)
      if (r.ok) onSaved()
      else setError(r.message ?? "Erro ao salvar.")
    })
  }

  const dv = {
    value: entry ? String(entry.value).replace(".", ",") : "",
    due: entry?.dueDate ?? "",
    paid: entry?.paidDate ?? "",
    to: entry?.toAccountId ?? "",
    category: entry?.categoryId ?? "",
    titular: entry?.titular ?? "",
    description: entry?.description ?? "",
    tags: entry?.tags.join(", ") ?? "",
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-xl border bg-card p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{isEditing ? "Editar Lançamento" : "Novo Lançamento"}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent">
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
          {units.length > 0 && (
            <Field label="Loja">
              <select value={unitId} onChange={(e) => setLoja(e.target.value)} className={inputCls}>
                <option value="">Rede (geral)</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (R$)">
              <input
                name="value"
                inputMode="decimal"
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                onBlur={(e) => setValor(formatValor(e.target.value))}
                required
                className={inputCls}
              />
            </Field>
            <Field label={isTransfer ? "Data" : "Vence em"}>
              <input name="due_date" type="date" defaultValue={dv.due} className={inputCls} />
            </Field>
          </div>

          {isTransfer ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="De (origem)">
                <select
                  name="account_id"
                  className={inputCls}
                  value={accountId}
                  onChange={(e) => pickAccount(e.target.value)}
                  required
                >
                  <AccountOptions accounts={accounts} loja={unitId} />
                </select>
              </Field>
              <Field label="Para (destino)">
                <select name="to_account_id" className={inputCls} defaultValue={dv.to} required>
                  <AccountOptions accounts={accounts} loja={unitId} />
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
                    onChange={(e) => pickAccount(e.target.value)}
                  >
                    <AccountOptions accounts={accounts} loja={unitId} />
                  </select>
                </Field>
                <Field label="Categoria">
                  <CategoryPicker
                    categories={categories}
                    kind={kind as "despesa" | "receita"}
                    value={categoryId}
                    onChange={setCategoryId}
                  />
                </Field>
              </div>
              <Field label="Cliente / Fornecedor">
                <ContatoPicker contacts={contacts} value={titular} onChange={setTitular} />
              </Field>
            </>
          )}

          <Field label="Descrição">
            <input name="description" placeholder="Descrição do lançamento" defaultValue={dv.description} className={inputCls} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={isTransfer ? "Efetivada em" : "Pago/recebido em"}>
              <input name="paid_date" type="date" defaultValue={dv.paid} className={inputCls} />
            </Field>
            {!isTransfer && (
              <Field label="Tags">
                <input name="tags" placeholder="separadas por vírgula" defaultValue={dv.tags} className={inputCls} />
              </Field>
            )}
          </div>

          {/* Parcelamento (cartão) / recorrência — só na criação */}
          {!isEditing && isCard && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 dark:border-sky-900/40 dark:bg-sky-950/20">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CreditCard className="size-4 text-sky-600" />
                Parcelar em
                <input name="parcelas" type="number" min={1} max={60} defaultValue={1} className={`${inputCls} w-16`} />x
              </div>
              <p className="mt-1.5 text-[11px] text-sky-700 dark:text-sky-300">
                💳 Compra no cartão: cada parcela vai pra uma fatura. Não impacta o caixa até a fatura ser paga.
              </p>
            </div>
          )}
          {!isEditing && !isCard && !isTransfer && (
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
                  <input name="recorrencia" type="number" min={2} max={60} defaultValue={12} className={`${inputCls} w-20`} />
                  <span className="text-muted-foreground">meses · 1 lançamento por mês</span>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-md border px-3 py-2 text-sm hover:bg-accent">
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
  )
}

/** Botão "Novo Lançamento" que abre o modal de criação. */
export function LancamentoDialog({
  accounts,
  categories,
  contacts = [],
  units = [],
  defaultKind,
  label = "Novo Lançamento",
}: {
  accounts: FinAccount[]
  categories: FinCategory[]
  contacts?: FinContact[]
  units?: { id: string; name: string }[]
  defaultKind?: Kind
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
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
        <LancamentoModal
          accounts={accounts}
          categories={categories}
          contacts={contacts}
          units={units}
          defaultKind={defaultKind}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false)
            router.refresh()
          }}
        />
      )}
    </>
  )
}

const inputCls =
  "h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"

/** Formata "50" → "50,00", "1234,5" → "1.234,50" (mantém centavos digitados). */
function formatValor(v: string): string {
  const n = parseFloat(v.replace(/\./g, "").replace(",", "."))
  if (!isFinite(n)) return ""
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Opções do select de conta: filtra pela loja (+ Rede) e separa Contas/Cartões. */
function AccountOptions({ accounts, loja }: { accounts: FinAccount[]; loja?: string }) {
  // Com loja: mostra as contas da loja + as da Rede (compartilhadas). Sem loja: todas.
  const visible = loja ? accounts.filter((a) => a.unitId === loja || a.unitId == null) : accounts
  const contas = visible.filter((a) => a.kind !== "cartao")
  const cartoes = visible.filter((a) => a.kind === "cartao")
  return (
    <>
      <option value="">—</option>
      {contas.length > 0 && (
        <optgroup label="Contas">
          {contas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </optgroup>
      )}
      {cartoes.length > 0 && (
        <optgroup label="Cartões">
          {cartoes.map((a) => (
            <option key={a.id} value={a.id}>
              💳 {a.name}
            </option>
          ))}
        </optgroup>
      )}
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
