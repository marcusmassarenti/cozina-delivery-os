"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Hourglass, Trash2, TriangleAlert } from "lucide-react"

import { fmtBRL } from "@/lib/format"
import type { FinAccount, FinCategory, FinEntry } from "@/lib/data/caixa"

import { deleteEntry, toggleEntryPaid } from "../_actions"
import { FinIcon } from "./fin-icon"
import { LancamentoModal } from "./lancamento-dialog"

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
        <LancamentoModal
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
