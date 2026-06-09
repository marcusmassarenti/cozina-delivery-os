"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Hourglass, Loader2, Trash2, TriangleAlert, X } from "lucide-react"

import { fmtBRL } from "@/lib/format"
import type { FinAccount, FinCategory, FinEntry } from "@/lib/data/caixa"

import { deleteEntry, saveEntry, toggleEntryPaid } from "../_actions"
import { FinIcon } from "./fin-icon"

const STATUS = {
  efetivado: { label: "Confirmado", cls: "text-emerald-600", Icon: CheckCircle2 },
  atrasado: { label: "Atrasado", cls: "text-rose-600", Icon: TriangleAlert },
  pendente: { label: "Pendente", cls: "text-amber-600", Icon: Hourglass },
} as const

function fmtDate(d: string | null) {
  if (!d) return "—"
  const [y, m, day] = d.split("-")
  return `${day}/${m}/${y.slice(2)}`
}

export function EntriesList({
  entries,
  categories,
  accounts,
}: {
  entries: FinEntry[]
  categories: FinCategory[]
  accounts: FinAccount[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState<FinEntry | null>(null)
  const catById = new Map(categories.map((c) => [c.id, c]))
  const accById = new Map(accounts.map((a) => [a.id, a]))

  function act(fn: () => Promise<{ ok: boolean }>) {
    start(async () => {
      await fn()
      router.refresh()
    })
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
        Nenhum lançamento neste período. Clique em <strong>Novo Lançamento</strong> pra começar.
      </div>
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {entries.map((e) => {
          const cat = e.categoryId ? catById.get(e.categoryId) : null
          const acc = e.accountId ? accById.get(e.accountId) : null
          const st = STATUS[e.status]
          const isDespesa = e.kind === "despesa"
          const isTransfer = e.kind === "transferencia"
          return (
            <div
              key={e.id}
              className="flex items-center gap-3 border-b px-4 py-2.5 last:border-0 hover:bg-muted/40"
            >
              <button
                type="button"
                onClick={() => setEditing(e)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <div
                  className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                    isTransfer
                      ? "bg-sky-100 text-sky-600 dark:bg-sky-950/40"
                      : isDespesa
                        ? "bg-rose-100 text-rose-600 dark:bg-rose-950/40"
                        : "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40"
                  }`}
                >
                  <FinIcon name={cat?.icon ?? null} className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {e.titular || e.description || cat?.name || "Lançamento"}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-1.5 truncate text-[11px] text-muted-foreground">
                    <span>{cat?.name ?? (isTransfer ? "Transferência" : "Sem categoria")}</span>
                    {acc && <span>· {acc.name}</span>}
                    {e.installmentTotal && e.installmentTotal > 1 && (
                      <span className="font-semibold text-foreground">
                        · Parcela {e.installmentNo}/{e.installmentTotal}
                      </span>
                    )}
                    {e.source !== "manual" && <span>· {e.source}</span>}
                    <span>· vence {fmtDate(e.dueDate)}</span>
                  </div>
                </div>
              </button>

              <span className={`hidden items-center gap-1 text-[11px] font-semibold sm:flex ${st.cls}`}>
                <st.Icon className="size-3.5" />
                {st.label}
              </span>

              <div
                className={`shrink-0 text-sm font-semibold tabular-nums ${
                  isTransfer ? "text-sky-600" : isDespesa ? "text-rose-600" : "text-emerald-600"
                }`}
              >
                {isDespesa ? "−" : isTransfer ? "" : "+"}
                {fmtBRL(e.value)}
              </div>

              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  disabled={pending}
                  title={e.status === "efetivado" ? "Marcar como pendente" : "Marcar como pago"}
                  onClick={() => act(() => toggleEntryPaid(e.id, e.status !== "efetivado"))}
                  className={`rounded-md p-1.5 hover:bg-accent disabled:opacity-50 ${
                    e.status === "efetivado" ? "text-emerald-600" : "text-muted-foreground"
                  }`}
                >
                  <CheckCircle2 className="size-4" />
                </button>
                <button
                  type="button"
                  disabled={pending}
                  title="Excluir"
                  onClick={() => {
                    if (confirm("Excluir este lançamento?")) act(() => deleteEntry(e.id))
                  }}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {editing && (
        <EditDialog
          entry={editing}
          accounts={accounts}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            router.refresh()
          }}
        />
      )}
    </>
  )
}

function EditDialog({
  entry,
  accounts,
  categories,
  onClose,
  onSaved,
}: {
  entry: FinEntry
  accounts: FinAccount[]
  categories: FinCategory[]
  onClose: () => void
  onSaved: () => void
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [paidDate, setPaidDate] = useState(entry.paidDate ?? "")
  const cats = categories.filter((c) => c.kind === entry.kind)

  function submit(fd: FormData) {
    fd.set("id", entry.id)
    fd.set("kind", entry.kind)
    fd.set("paid_date", paidDate)
    start(async () => {
      const r = await saveEntry(fd)
      if (r.ok) onSaved()
      else setError(r.message ?? "Erro")
    })
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
  const pago = !!paidDate

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-xl border bg-card p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold capitalize">Editar {entry.kind}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>
        <form action={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <L label="Valor (R$)">
              <input name="value" inputMode="decimal" defaultValue={String(entry.value).replace(".", ",")} className={inp} />
            </L>
            <L label="Vence em">
              <input name="due_date" type="date" defaultValue={entry.dueDate ?? ""} className={inp} />
            </L>
          </div>
          {entry.kind !== "transferencia" && (
            <div className="grid grid-cols-2 gap-3">
              <L label="Conta / Cartão">
                <select name="account_id" defaultValue={entry.accountId ?? ""} className={inp}>
                  <option value="">—</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </L>
              <L label="Categoria">
                <select name="category_id" defaultValue={entry.categoryId ?? ""} className={inp}>
                  <option value="">—</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.parentId ? "↳ " : ""}
                      {c.name}
                    </option>
                  ))}
                </select>
              </L>
            </div>
          )}
          <L label="Cliente / Fornecedor">
            <input name="titular" defaultValue={entry.titular ?? ""} className={inp} />
          </L>
          <L label="Descrição">
            <input name="description" defaultValue={entry.description ?? ""} className={inp} />
          </L>

          {/* Botão de Pago */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-sm">
              {pago ? (
                <CheckCircle2 className="size-4 text-emerald-600" />
              ) : (
                <Hourglass className="size-4 text-amber-600" />
              )}
              <span className="font-medium">{pago ? `Pago em ${fmtDate(paidDate)}` : "Não pago"}</span>
            </div>
            <button
              type="button"
              onClick={() => setPaidDate(pago ? "" : today)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                pago
                  ? "border hover:bg-accent"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
            >
              {pago ? "Marcar como não pago" : "Marcar como pago"}
            </button>
          </div>

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

const inp = "h-9 w-full rounded-md border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
