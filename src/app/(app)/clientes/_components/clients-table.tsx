"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, Loader2, Pencil, Search, Trash2, X } from "lucide-react"

import type { ClientOverview } from "@/lib/data/plataforma"
import { ehClienteArquivado } from "@/lib/data/cliente-arquivado"
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
  ai: "DeliveryOS AI",
}
const PLAN_CLS: Record<string, string> = {
  essencial:
    "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  pro: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  ai: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
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
  // Escopo acima do filtro de status: relação viva x relação encerrada.
  // Sem isto a lista abre em "todos" e o suspenso divide espaço com quem
  // paga — com 7 clientes já eram 2 linhas mortas no topo da tela.
  const [escopo, setEscopo] = React.useState<"ativos" | "arquivados">("ativos")
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

  // A régua mora em @/lib/data/cliente-arquivado — a tela de Conexões de API
  // faz a mesma pergunta, e duas cópias divergem.
  const ehArquivado = React.useCallback(
    (c: ClientOverview) => ehClienteArquivado(c),
    [],
  )
  const arquivados = React.useMemo(
    () => clients.filter(ehArquivado).length,
    [clients, ehArquivado],
  )

  const counts = React.useMemo(() => {
    const c: Record<string, number> = {
      todos: 0,
      paid: 0,
      trial: 0,
      pending: 0,
      overdue: 0,
      suspended: 0,
    }
    // Conta DENTRO do escopo: "Todos 8" embaixo de uma aba de 6 faz o leitor
    // duvidar de qual número está certo.
    for (const cl of clients) {
      if ((escopo === "arquivados") !== ehArquivado(cl)) continue
      c.todos += 1
      c[cl.billingStatus] = (c[cl.billingStatus] ?? 0) + 1
    }
    return c
  }, [clients, escopo, ehArquivado])


  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = clients.filter((c) => {
      if ((escopo === "arquivados") !== ehArquivado(c)) return false
      if (status !== "todos" && c.billingStatus !== status) return false
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        (c.establishmentType ?? "").toLowerCase().includes(q)
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
  }, [clients, query, status, sort, escopo, ehArquivado])

  React.useEffect(() => setPage(0), [query, status, sort, escopo])

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
      {/* Escopo — vem ACIMA do filtro de status: primeiro "de quem estamos
          falando", depois "em que pé está". */}
      <div className="flex gap-1 border-b">
        {(
          [
            { k: "ativos" as const, l: "Ativos", n: clients.length - arquivados },
            { k: "arquivados" as const, l: "Suspensos", n: arquivados },
          ]
        ).map((e) => (
          <button
            key={e.k}
            type="button"
            onClick={() => {
              setEscopo(e.k)
              setStatus("todos")
            }}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              escopo === e.k
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {e.l}
            <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums">
              {e.n}
            </span>
          </button>
        ))}
      </div>

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
        <div className="flex flex-wrap items-center gap-2">
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
          <div className="flex flex-wrap items-center gap-2">
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

      <ProspeccaoEmTeste clientes={clients} />

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
                <th className="px-4 py-2.5 font-semibold">Plano</th>
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
                      {c.planTier ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PLAN_CLS[c.planTier] ?? ""}`}
                        >
                          {PLAN_LABEL[c.planTier] ?? c.planTier}
                        </span>
                      ) : c.billingStatus === "trial" ? (
                        // No teste grátis o gate libera TUDO (billing.ts:
                        // `if (status === "trial") return true`), Nino
                        // incluso. Escrever "sem plano" aqui dava a impressão
                        // oposta — de conta capada — justo em quem ainda está
                        // decidindo se fica.
                        // Diz QUAL plano, e quanto essa conta valeria.
                        //
                        // "teste · tudo liberado" não respondia a pergunta que
                        // o dono faz olhando esta tela: quanto tem em jogo.
                        // A régua é o PRO (decisão do Marcus): é o que ele
                        // espera vender. O teste na prática libera mais que
                        // isso — o Nino AI entra junto —, e por isso o título
                        // continua dizendo a verdade ao passar o mouse.
                        //
                        // Conta sem loja mostra "—" em vez de R$ 99: ela não
                        // usou o sistema, e somá-la infla a prospecção com
                        // quem cadastrou e sumiu.
                        <span className="flex flex-wrap items-baseline gap-1.5">
                          <span
                            title="Durante o teste grátis todas as funções estão liberadas, inclusive o Nino AI — que no plano pago é exclusivo do DeliveryOS AI."
                            className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-700 dark:bg-violet-950/50 dark:text-violet-300"
                          >
                            teste · plano Pro
                          </span>
                          {c.activeUnits > 0 ? (
                            <span
                              className="text-[11px] font-semibold tabular-nums text-violet-700 dark:text-violet-300"
                              title={`${c.activeUnits} loja${c.activeUnits !== 1 ? "s" : ""} × plano Pro (R$ 99 a primeira + R$ 39 cada adicional)`}
                            >
                              {fmtBRL(99 + 39 * (c.activeUnits - 1))}/mês
                            </span>
                          ) : (
                            <span
                              className="text-[11px] text-muted-foreground"
                              title="Sem loja cadastrada — fora do potencial somado, porque a conta ainda não usou o sistema."
                            >
                              — sem loja
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-[11px] text-amber-600 dark:text-amber-400">
                          sem plano
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* O que vale é a assinatura, não texto digitado.
                            Quem ainda não migrou aparece em âmbar de propósito:
                            é dinheiro entrando por fora, e some do radar se
                            ficar com a mesma cara de quem já está no Asaas. */}
                        {c.asaasActive ? (
                          <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                            Asaas ✓
                          </span>
                        ) : c.contaInterna ||
                          c.billingStatus === "trial" ||
                          c.billingStatus === "none" ? (
                          // Em teste ou sem cobrança não há o que migrar —
                          // marcar de âmbar aqui seria alarme falso e tiraria
                          // o peso do aviso de quem realmente paga por fora.
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                            fora do Asaas
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {c.contaInterna ? (
                          <span
                            title={c.contaInternaNota ?? "Conta da própria casa — fora do MRR e sem fatura."}
                            className="text-muted-foreground"
                          >
                            {fmtBRL(c.computedMonthly)}/mês
                            <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                              interna
                            </span>
                          </span>
                        ) : c.computedMonthly > 0 ? (
                          <>
                            {fmtBRL(c.computedMonthly)}/mês
                            {/* Mensal custa +30% sobre a base anual. Sem essa
                                marca, o valor da linha não bate com o preço de
                                tabela e parece erro de cálculo. */}
                            {c.billingCycle === "mensal" && !c.precoNegociado ? (
                              <span
                                className="ml-1 opacity-70"
                                title="Ciclo mensal: +30% sobre a base do plano anual."
                              >
                                · mensal
                              </span>
                            ) : null}
                          </>
                        ) : (
                          "—"
                        )}
                        {/* Pagante sem vencimento nunca entra na régua de
                            cobrança: o cron diário só rebaixa quem TEM data.
                            Sem isso o cliente fica "em dia" pra sempre e a
                            mensalidade nunca é cobrada. */}
                        {c.paid && !c.dueDate && !c.contaInterna && (
                          <div
                            title="Marcado como pago mas sem data de vencimento — o sistema nunca vai cobrar nem suspender este cliente."
                            className="mt-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400"
                          >
                            sem vencimento
                          </div>
                        )}
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
                      {/* Onboarding travado. A ordem importa: e-mail não
                          confirmado vem primeiro porque essa pessoa NÃO
                          consegue entrar — nenhum aviso dentro do sistema a
                          alcança, só um contato seu. */}
                      {c.emailNaoConfirmado ? (
                        <div
                          title="Cadastrou mas nunca confirmou o e-mail — não consegue entrar. Chame no WhatsApp ou confirme pelo Supabase."
                          className="mt-1 inline-block rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                        >
                          e-mail não confirmado
                        </div>
                      ) : c.billingStatus === "trial" && c.units === 0 ? (
                        <div
                          title="Em teste grátis e ainda sem nenhuma loja cadastrada — sem loja o sistema não mostra nada, e a pessoa não tem motivo pra voltar."
                          className="mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                        >
                          teste sem loja
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5" onClick={stop}>
                      <div className="flex items-center justify-end gap-1.5">
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
                        {/* Abre a ficha do cliente — a mesma que a linha abre.
                            Antes aqui morava um formulário próprio de cobrança:
                            editar por dois caminhos diferentes fazia a ficha e a
                            tabela discordarem sobre o que tinha acabado de
                            mudar. O formulário continua existindo, mas só
                            dentro da ficha. */}
                        <button
                          type="button"
                          onClick={() => openDrawer(c)}
                          title="Abrir ficha do cliente"
                          aria-label={`Abrir ficha de ${c.name}`}
                          className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="size-3.5" />
                        </button>
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
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-muted-foreground">
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


/**
 * Quanto há em jogo nos testes em andamento.
 *
 * A tela listava quem estava testando, mas não respondia a pergunta que o
 * dono faz olhando pra ela: quanto isso vira de receita se converter. Somar
 * conta por conta na cabeça, com preço que muda conforme o número de lojas,
 * é justamente o tipo de conta que ninguém faz — então a informação existia e
 * não era usada.
 *
 * Régua: plano PRO (R$ 99 a primeira loja + R$ 39 cada adicional). Decisão do
 * Marcus — é o que ele espera vender. Vale registrar que o teste na prática
 * libera MAIS que o Pro: o Nino AI entra junto, e ele é exclusivo do plano AI
 * no pago. Quem converter pro Pro perde o Nino.
 *
 * CONTA SEM LOJA FICA FORA DO TOTAL e aparece contada à parte: ela não usou o
 * sistema, e somá-la infla a prospecção com quem cadastrou e sumiu.
 */
function ProspeccaoEmTeste({ clientes }: { clientes: ClientOverview[] }) {
  const emTeste = clientes.filter((c) => c.billingStatus === "trial")
  if (emTeste.length === 0) return null

  const comLoja = emTeste.filter((c) => c.activeUnits > 0)
  const semLoja = emTeste.length - comLoja.length
  const total = comLoja.reduce(
    (s, c) => s + 99 + 39 * (c.activeUnits - 1),
    0,
  )
  // Teste que vence nos próximos 3 dias: é onde a conversa precisa acontecer
  // antes de virar churn silencioso.
  const limite = new Date()
  limite.setDate(limite.getDate() + 3)
  const vencendo = comLoja.filter(
    (c) => c.trialEndsAt && new Date(c.trialEndsAt) <= limite,
  ).length

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-900/40 dark:bg-violet-950/30">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
          Em teste agora
        </p>
        <p className="text-lg font-semibold tabular-nums text-violet-900 dark:text-violet-100">
          {fmtBRL(total)}
          <span className="ml-1 text-xs font-normal text-violet-700/80 dark:text-violet-300/80">
            /mês se converter
          </span>
        </p>
      </div>
      <p className="text-xs text-violet-800/90 dark:text-violet-300/90">
        {comLoja.length} {comLoja.length === 1 ? "conta" : "contas"} com loja
        cadastrada, no plano Pro.
        {semLoja > 0 && (
          <>
            {" "}
            <span title="Sem loja cadastrada, então não entra no total — a conta ainda não usou o sistema.">
              {semLoja} sem loja {semLoja === 1 ? "ficou" : "ficaram"} de fora.
            </span>
          </>
        )}
        {vencendo > 0 && (
          <>
            {" "}
            <strong className="text-violet-900 dark:text-violet-100">
              {vencendo} {vencendo === 1 ? "vence" : "vencem"} em até 3 dias.
            </strong>
          </>
        )}
      </p>
    </div>
  )
}
