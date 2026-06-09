/**
 * Módulo financeiro do dono da loja (fluxo de caixa / contas a pagar e receber).
 * Escopo por holding (cliente). Leitura via service_role (admin), escopada
 * sempre ao holding do usuário (getCurrentHoldingId).
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/roles"
import { todayISO } from "@/lib/data/billing"

export type AccountKind = "conta_corrente" | "cartao" | "dinheiro" | "outro"
export type EntryKind = "despesa" | "receita" | "transferencia"
/** Situação derivada do lançamento. */
export type EntryStatus = "efetivado" | "atrasado" | "pendente"

export type FinAccount = {
  id: string
  name: string
  kind: AccountKind
  bank: string | null
  initialBalance: number
  active: boolean
  sortOrder: number
}

export type FinCategory = {
  id: string
  name: string
  parentId: string | null
  kind: "despesa" | "receita"
  icon: string | null
  color: string | null
  sortOrder: number
  children: FinCategory[]
}

export type FinEntry = {
  id: string
  unitId: string | null
  kind: EntryKind
  value: number
  dueDate: string | null
  paidDate: string | null
  accountId: string | null
  toAccountId: string | null
  categoryId: string | null
  titular: string | null
  description: string | null
  tags: string[]
  source: "manual" | "ifood" | "99food" | "keeta"
  expectedValue: number | null
  reconciled: boolean
  status: EntryStatus
}

export type CaixaSummary = {
  /** saldo = saldos iniciais das contas + efetivados (receita − despesa) */
  saldo: number
  receitaEfetivada: number
  despesaEfetivada: number
  aReceber: number
  aPagar: number
  vencidoPagar: number
  vencidoReceber: number
}

/** Resolve o holding do usuário logado (null se não houver). */
export async function getCaixaHoldingId(): Promise<string | null> {
  return getCurrentHoldingId()
}

function entryStatus(paidDate: string | null, dueDate: string | null): EntryStatus {
  if (paidDate) return "efetivado"
  if (dueDate && dueDate < todayISO()) return "atrasado"
  return "pendente"
}

export async function getAccounts(holdingId: string): Promise<FinAccount[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("fin_accounts")
    .select("id, name, kind, bank, initial_balance, active, sort_order")
    .eq("holding_id", holdingId)
    .order("sort_order")
    .order("created_at")
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind as AccountKind,
    bank: r.bank ?? null,
    initialBalance: Number(r.initial_balance ?? 0),
    active: r.active,
    sortOrder: r.sort_order ?? 0,
  }))
}

/** Categorias em árvore (pais com filhos). */
export async function getCategories(holdingId: string): Promise<FinCategory[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("fin_categories")
    .select("id, name, parent_id, kind, icon, color, sort_order")
    .eq("holding_id", holdingId)
    .order("sort_order")
    .order("name")
  const flat: FinCategory[] = (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    parentId: r.parent_id ?? null,
    kind: r.kind as "despesa" | "receita",
    icon: r.icon ?? null,
    color: r.color ?? null,
    sortOrder: r.sort_order ?? 0,
    children: [],
  }))
  const byId = new Map(flat.map((c) => [c.id, c]))
  const roots: FinCategory[] = []
  for (const c of flat) {
    if (c.parentId && byId.has(c.parentId)) byId.get(c.parentId)!.children.push(c)
    else roots.push(c)
  }
  return roots
}

/** Versão achatada (pra selects). */
export async function getCategoriesFlat(holdingId: string): Promise<FinCategory[]> {
  const tree = await getCategories(holdingId)
  const out: FinCategory[] = []
  const walk = (list: FinCategory[]) => {
    for (const c of list) {
      out.push(c)
      walk(c.children)
    }
  }
  walk(tree)
  return out
}

export type EntryFilters = {
  year?: number
  month?: number
  kind?: EntryKind
  accountId?: string
  categoryId?: string
  search?: string
}

export async function getEntries(
  holdingId: string,
  filters: EntryFilters = {},
): Promise<FinEntry[]> {
  const admin = createAdminClient()
  let q = admin
    .from("fin_entries")
    .select(
      "id, unit_id, kind, value, due_date, paid_date, account_id, to_account_id, category_id, titular, description, tags, source, expected_value, reconciled",
    )
    .eq("holding_id", holdingId)
  if (filters.year) q = q.eq("ref_year", filters.year)
  if (filters.month) q = q.eq("ref_month", filters.month)
  if (filters.kind) q = q.eq("kind", filters.kind)
  if (filters.accountId) q = q.eq("account_id", filters.accountId)
  if (filters.categoryId) q = q.eq("category_id", filters.categoryId)
  if (filters.search) q = q.ilike("description", `%${filters.search}%`)
  q = q.order("due_date", { ascending: false }).order("created_at", { ascending: false })

  const { data } = await q
  return (data ?? []).map((r) => ({
    id: r.id,
    unitId: r.unit_id ?? null,
    kind: r.kind as EntryKind,
    value: Number(r.value ?? 0),
    dueDate: r.due_date ?? null,
    paidDate: r.paid_date ?? null,
    accountId: r.account_id ?? null,
    toAccountId: r.to_account_id ?? null,
    categoryId: r.category_id ?? null,
    titular: r.titular ?? null,
    description: r.description ?? null,
    tags: r.tags ?? [],
    source: r.source as FinEntry["source"],
    expectedValue: r.expected_value != null ? Number(r.expected_value) : null,
    reconciled: !!r.reconciled,
    status: entryStatus(r.paid_date ?? null, r.due_date ?? null),
  }))
}

/** Resumo do caixa (saldo + a pagar/receber + vencidos) pro mês. */
export async function getCaixaSummary(
  holdingId: string,
  year: number,
  month: number,
): Promise<CaixaSummary> {
  const admin = createAdminClient()
  const [{ data: accs }, { data: rows }] = await Promise.all([
    admin.from("fin_accounts").select("initial_balance").eq("holding_id", holdingId),
    admin
      .from("fin_entries")
      .select("kind, value, due_date, paid_date")
      .eq("holding_id", holdingId)
      .eq("ref_year", year)
      .eq("ref_month", month),
  ])

  const today = todayISO()
  const s: CaixaSummary = {
    saldo: (accs ?? []).reduce((a, r) => a + Number(r.initial_balance ?? 0), 0),
    receitaEfetivada: 0,
    despesaEfetivada: 0,
    aReceber: 0,
    aPagar: 0,
    vencidoPagar: 0,
    vencidoReceber: 0,
  }
  for (const r of rows ?? []) {
    const v = Number(r.value ?? 0)
    const efetivado = !!r.paid_date
    const atrasado = !efetivado && r.due_date && r.due_date < today
    if (r.kind === "receita") {
      if (efetivado) {
        s.receitaEfetivada += v
        s.saldo += v
      } else {
        s.aReceber += v
        if (atrasado) s.vencidoReceber += v
      }
    } else if (r.kind === "despesa") {
      if (efetivado) {
        s.despesaEfetivada += v
        s.saldo -= v
      } else {
        s.aPagar += v
        if (atrasado) s.vencidoPagar += v
      }
    }
  }
  return s
}
