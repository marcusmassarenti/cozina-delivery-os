"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, Eye, Loader2, Search, Trash2, X } from "lucide-react"

import type { ClientOverview } from "@/lib/data/plataforma"
import type { BillingStatus } from "@/lib/data/billing"
import { fmtBRL } from "@/lib/format"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

import { EditBillingDialog } from "./edit-billing-dialog"
import { UnitsDialog } from "./units-dialog"
import { PaymentsDialog } from "./payments-dialog"
import { DeleteClientButton } from "./delete-client-button"
import { ClientDetailDrawer } from "./client-detail-drawer"
import { deleteClients } from "../_actions"

const STATUS: Record<BillingStatus, { label: string; cls: string }> = {
  trial: {
    label: "Teste grátis",
    cls: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-400",
  },
  paid: {
    label: "Pago",
    cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
  },
  pending: {
    label: "Pendente",
    cls: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-400",
  },
  overdue: {
    label: "Em atraso",
    cls: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
  },
  suspended: {
    label: "Suspenso",
    cls: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400",
  },
  none: { label: "Sem cobrança", cls: "bg-muted text-muted-foreground" },
}

function fmtDate(d: string | null): string {
  if (!d) return "—"
  const [y, m, day] = d.split("-")
  return `${day}/${m}/${y}`
}
function fmtLastLogin(iso: string | null): string {
  if (!iso) return "nunca"
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}
function agoDays(iso: string | null, nowMs: number): number | null {
  if (!iso) return null
  return Math.floor((nowMs - new Date(iso).getTime()) / 86_400_000)
}
const PLAN_LABEL: Record<string, string> = {
  essencial: "Essencial",
  pro: "Pro",
  ai: "AI",
}

type FiltroStatus = "todos" | "paid" | "trial" | "pending" | "overdue" | "suspended"
type SortKey = "mrr" | "due" | "lastseen" | "name"

const PAGE_SIZE = 25

export function ClientsTable({
  clients,
  myHoldingId,
  nowMs,
}: {
  clients: ClientOverview[]
  myHoldingId: string | null
  nowMs: number
}) {
  const router = useRouter()
  const [query, setQuery] = React.useState("")
  const [status, setStatus] = React.useState<FiltroStatus>("todos")
  const [sort, setSort] = React.useState<SortKey>("mrr")
  const [page, setPage] = React.useState(0)

  // Drawer (detalhe na mesma tela)
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [openName, setOpenName] = React.useState<string | null>(null)
  const openDrawer = (c: ClientOverview) => {
    setOpenId(c.id)
    setOpenName(c.name)
  }

  // Seleção em massa
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  const counts = React.useMemo(() => {
    const c: Record<string, number> = {
      todos: clients.length,
      paid: 0,
      trial: 0,
      pending: 0,
      overdue: 0,
      suspended: 0,
    }
    for (const cl of clients) c[cl.billingStatus] = (c[cl.billingStatus] ?? 0) + 1
    return c
  }, [clients])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = clients.filter((c) => {
      if (status !== "todos" && c.billingStatus !== status) return false
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        (c.establishmentType ?? "").toLowerCase().includes(q) ||
        (c.paymentMethod ?? "").toLowerCase().includes(q)
      )
    })
    list = [...list].sort((a, b) => {
      switch (sort) {
        case "name":
          return a.name.localeCompare(b.name)
        case "due":
          return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")
        case "lastseen":
          return (b.lastLogin ?? "").localeCompare(a.lastLogin ?? "")
        default:
          return b.computedMonthly - a.computedMonthly
      }
    })
    return list
  }, [clients, query, status, sort])

  React.useEffect(() => setPage(0), [query, status, sort])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageClamped = Math.min(page, totalPages - 1)
  const pageRows = filtered.slice(pageClamped * PAGE_SIZE, pageClamped * PAGE_SIZE + PAGE_SIZE)

  // Ids selecionáveis (exclui a própria empresa do dono)
  const selectableFiltered = filtered.filter((c) => c.id !== myHoldingId)
  const allFilteredSelected =
    selectableFiltered.length > 0 &&
    selectableFiltered.every((c) => selected.has(c.id))

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAll = () =>
    setSelected((prev) => {
      if (selectableFiltered.every((c) => prev.has(c.id))) return new Set()
      return new Set(selectableFiltered.map((c) => c.id))
    })

  async function confirmBulkDelete() {
    setDeleting(true)
    const ids = [...selected].filter((id) => id !== myHoldingId)
    const res = await deleteClients(ids)
    setDeleting(false)
    setConfirmOpen(false)
    setSelected(new Set())
    router.refresh()
    if (!res.ok && res.message) alert(res.message)
  }

  const tabs: { key: FiltroStatus; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "paid", label: "Pagantes" },
    { key: "trial", label: "Trial" },
    { key: "pending", label: "Pendentes" },
    { key: "overdue", label: "Em atraso" },
    { key: "suspended", label: "Suspensos" },
  ]

  const stop = (e: React.MouseEvent) => e.stopPropagation()

  return (
    <div className="flex flex-col gap-3">
      {/* Controles */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {tabs.map((t) => {
            const n = counts[t.key] ?? 0
            const active = status === t.key
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setStatus(t.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {t.label}
                <span
                  className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
                    active ? "bg-primary/20" : "bg-muted"
                  }`}
                >
                  {n}
                </span>
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar cliente…"
              className="h-9 w-52 rounded-md border bg-card pl-8 pr-2.5 text-xs outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-9 appearance-none rounded-md border bg-card pl-2.5 pr-7 text-xs font-medium outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="mrr">Maior mensalidade</option>
              <option value="due">Vencimento</option>
              <option value="lastseen">Último acesso</option>
              <option value="name">Nome (A–Z)</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
      </div>

      {/* Barra de ação em massa */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
          <span className="font-medium">
            {selected.size} selecionado{selected.size !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-950/30"
            >
              <Trash2 className="size-3.5" />
              Excluir selecionados
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
              Limpar
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos"
                    checked={allFilteredSelected}
                    onChange={toggleAll}
                    className="size-3.5 cursor-pointer accent-primary"
                  />
                </th>
                <th className="px-4 py-2.5 font-semibold">Cliente</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Pagamento</th>
                <th className="px-4 py-2.5 font-semibold">Vencimento</th>
                <th className="px-4 py-2.5 text-right font-semibold">Lojas</th>
                <th className="px-4 py-2.5 font-semibold">Último acesso</th>
                <th className="px-4 py-2.5 text-right font-semibold">Ação</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((c) => {
                const st = STATUS[c.billingStatus]
                const dias = agoDays(c.lastLogin, nowMs)
                const sumido = dias != null && dias >= 14
                const canSelect = c.id !== myHoldingId
                return (
                  <tr
                    key={c.id}
                    onClick={() => openDrawer(c)}
                    className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-2.5" onClick={stop}>
                      {canSelect ? (
                        <input
                          type="checkbox"
                          aria-label={`Selecionar ${c.name}`}
                          checked={selected.has(c.id)}
                          onChange={() => toggleOne(c.id)}
                          className="size-3.5 cursor-pointer accent-primary"
                        />
                      ) : (
                        <span className="inline-block size-3.5" />
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium hover:text-primary">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {c.establishmentType ?? "Tipo não definido"} · {c.users}{" "}
                        usuário{c.users !== 1 ? "s" : ""}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${st.cls}`}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs">{c.paymentMethod ?? "—"}</span>
                        {c.planTier && (
                          <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                            {PLAN_LABEL[c.planTier] ?? c.planTier}
                          </span>
                        )}
                        {c.asaasActive && (
                          <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                            Asaas ✓
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {c.computedMonthly > 0 ? `${fmtBRL(c.computedMonthly)}/mês` : "—"}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs tabular-nums">{fmtDate(c.dueDate)}</td>
                    <td className="px-4 py-2.5 text-right" onClick={stop}>
                      <UnitsDialog name={c.name} units={c.unitsList} />
                      <div className="text-[11px] text-muted-foreground">
                        {c.activeUnits} ativa{c.activeUnits !== 1 ? "s" : ""}
                        {c.units !== c.activeUnits ? ` de ${c.units}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs tabular-nums">
                      <span className={sumido ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
                        {fmtLastLogin(c.lastLogin)}
                      </span>
                      {sumido && (
                        <div className="text-[10px] text-amber-600/80 dark:text-amber-400/80">
                          há {dias} dias
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5" onClick={stop}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openDrawer(c)}
                          className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium hover:bg-muted"
                          title="Ver detalhes"
                        >
                          <Eye className="size-3.5" />
                          Ver
                        </button>
                        <PaymentsDialog
                          client={{
                            id: c.id,
                            name: c.name,
                            payments: c.payments,
                            suggested: c.computedMonthly,
                            method: c.paymentMethod,
                          }}
                          compact
                        />
                        <EditBillingDialog
                          client={{
                            id: c.id,
                            name: c.name,
                            establishmentType: c.establishmentType,
                            paymentMethod: c.paymentMethod,
                            monthlyFee: c.monthlyFee,
                            pricePerUnit: c.pricePerUnit,
                            includedUnits: c.includedUnits,
                            billableUnits: c.billableUnits,
                            dueDate: c.dueDate,
                            paid: c.paid,
                            suspendOn: c.suspendOn,
                          }}
                          compact
                        />
                        <DeleteClientButton
                          id={c.id}
                          name={c.name}
                          canDelete={c.id !== myHoldingId}
                          compact
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    {query || status !== "todos"
                      ? "Nenhum cliente com esse filtro."
                      : "Nenhum cliente ainda."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t px-4 py-2.5 text-xs text-muted-foreground">
            <span>
              {pageClamped * PAGE_SIZE + 1}–
              {Math.min((pageClamped + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={pageClamped === 0}
                className="rounded-md border px-2.5 py-1 font-medium hover:bg-muted disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="px-1 tabular-nums">
                {pageClamped + 1}/{totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={pageClamped >= totalPages - 1}
                className="rounded-md border px-2.5 py-1 font-medium hover:bg-muted disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Drawer de detalhe (mesma tela) */}
      <ClientDetailDrawer
        openId={openId}
        fallbackName={openName}
        onClose={() => setOpenId(null)}
      />

      {/* Confirmação de exclusão em massa */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
              <Trash2 className="size-5" />
              Excluir {selected.size} cliente{selected.size !== 1 ? "s" : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Isso apaga cada empresa selecionada, <strong>todas as lojas</strong>,
              os dados importados e os <strong>usuários</strong> delas. Não dá pra
              desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                confirmBulkDelete()
              }}
              disabled={deleting}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {deleting ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="size-4 animate-spin" />
                  Excluindo…
                </span>
              ) : (
                "Excluir selecionados"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
