"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Trash2, Undo2 } from "lucide-react"

import { fmtBRL } from "@/lib/format"
import type { FinAccount, FinCategory, FinEntry } from "@/lib/data/caixa"

import { deleteEntry, toggleEntryPaid } from "../_actions"
import { FinIcon } from "./fin-icon"

const STATUS: Record<FinEntry["status"], { label: string; cls: string }> = {
  efetivado: {
    label: "Efetivado",
    cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
  },
  atrasado: {
    label: "Atrasado",
    cls: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400",
  },
  pendente: {
    label: "Pendente",
    cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
  },
}

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
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      {entries.map((e) => {
        const cat = e.categoryId ? catById.get(e.categoryId) : null
        const acc = e.accountId ? accById.get(e.accountId) : null
        const st = STATUS[e.status]
        const isDespesa = e.kind === "despesa"
        return (
          <div
            key={e.id}
            className="flex items-center gap-3 border-b px-4 py-2.5 last:border-0 hover:bg-muted/30"
          >
            <div
              className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                isDespesa
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
              <div className="truncate text-[11px] text-muted-foreground">
                {cat?.name ?? "Sem categoria"}
                {acc ? ` · ${acc.name}` : ""}
                {e.source !== "manual" ? ` · ${e.source}` : ""}
                {" · vence "}
                {fmtDate(e.dueDate)}
              </div>
            </div>

            <span
              className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider sm:inline ${st.cls}`}
            >
              {st.label}
            </span>

            <div
              className={`shrink-0 text-sm font-semibold tabular-nums ${
                isDespesa ? "text-rose-600" : "text-emerald-600"
              }`}
            >
              {isDespesa ? "−" : "+"}
              {fmtBRL(e.value)}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                disabled={pending}
                title={e.status === "efetivado" ? "Desfazer efetivação" : "Marcar como efetivado"}
                onClick={() => act(() => toggleEntryPaid(e.id, e.status !== "efetivado"))}
                className="rounded-md p-1.5 hover:bg-accent disabled:opacity-50"
              >
                {e.status === "efetivado" ? (
                  <Undo2 className="size-3.5 text-muted-foreground" />
                ) : (
                  <Check className="size-3.5 text-emerald-600" />
                )}
              </button>
              <button
                type="button"
                disabled={pending}
                title="Excluir"
                onClick={() => {
                  if (confirm("Excluir este lançamento?")) act(() => deleteEntry(e.id))
                }}
                className="rounded-md p-1.5 hover:bg-accent disabled:opacity-50"
              >
                <Trash2 className="size-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
