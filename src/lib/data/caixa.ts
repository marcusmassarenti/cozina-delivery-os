/**
 * Módulo financeiro do dono da loja (fluxo de caixa / contas a pagar e receber).
 * Escopo por holding (cliente). Leitura via service_role (admin), escopada
 * sempre ao holding do usuário (getCurrentHoldingId).
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/roles"
import { todayISO } from "@/lib/data/billing"
import { getVisibleUnits } from "@/lib/data/units"

/** Filtro de loja: "todas" (consolidado) | "rede" (sem loja) | <unitId>. */
export type Loja = string | undefined

/** Aplica o filtro de loja a uma query Supabase (coluna unit_id).
 * Usa `any` de propósito: os builders do Supabase têm tipos profundos
 * demais e um genérico aqui estoura o TS (TS2589). */
/* eslint-disable @typescript-eslint/no-explicit-any */
function lojaWhere(q: any, loja: Loja): any {
  if (loja === "rede") return q.is("unit_id", null)
  if (loja && loja !== "todas") return q.eq("unit_id", loja)
  return q
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Predicado em memória pro filtro de loja. */
function lojaMatch(unitId: string | null, loja: Loja): boolean {
  if (!loja || loja === "todas") return true
  if (loja === "rede") return unitId == null
  return unitId === loja
}

/** Lojas visíveis pro usuário (admin → todas; franqueado → as dele). */
export async function getCaixaUnits(): Promise<{ id: string; name: string }[]> {
  const units = await getVisibleUnits()
  return units.map((u) => ({ id: u.id, name: u.name }))
}

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
  cardLimit: number | null
  closingDay: number | null
  dueDay: number | null
  color: string | null
  excludeFromTotal: boolean
  logoUrl: string | null
  unitId: string | null
  /** saldo calculado (initial + efetivados); só em getAccountsWithBalance */
  balance?: number
  /** stats do período (só em getAccountsWithStats) */
  stats?: { pagas: number; aPagar: number; recebidas: number; aReceber: number; count: number }
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
  installmentNo: number | null
  installmentTotal: number | null
  invoiceYear: number | null
  invoiceMonth: number | null
  isCardPayment: boolean
  hidden: boolean
  status: EntryStatus
}

const ENTRY_COLS =
  "id, unit_id, kind, value, due_date, paid_date, account_id, to_account_id, category_id, titular, description, tags, source, expected_value, reconciled, installment_no, installment_total, invoice_year, invoice_month, is_card_payment, hidden"

function mapEntry(r: Record<string, unknown>): FinEntry {
  return {
    id: r.id as string,
    unitId: (r.unit_id as string) ?? null,
    kind: r.kind as EntryKind,
    value: Number(r.value ?? 0),
    dueDate: (r.due_date as string) ?? null,
    paidDate: (r.paid_date as string) ?? null,
    accountId: (r.account_id as string) ?? null,
    toAccountId: (r.to_account_id as string) ?? null,
    categoryId: (r.category_id as string) ?? null,
    titular: (r.titular as string) ?? null,
    description: (r.description as string) ?? null,
    tags: (r.tags as string[]) ?? [],
    source: r.source as FinEntry["source"],
    expectedValue: r.expected_value != null ? Number(r.expected_value) : null,
    reconciled: !!r.reconciled,
    installmentNo: (r.installment_no as number) ?? null,
    installmentTotal: (r.installment_total as number) ?? null,
    invoiceYear: (r.invoice_year as number) ?? null,
    invoiceMonth: (r.invoice_month as number) ?? null,
    isCardPayment: !!r.is_card_payment,
    hidden: !!r.hidden,
    status: entryStatus((r.paid_date as string) ?? null, (r.due_date as string) ?? null),
  }
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

function mapAccount(r: Record<string, unknown>): FinAccount {
  return {
    id: r.id as string,
    name: r.name as string,
    kind: r.kind as AccountKind,
    bank: (r.bank as string) ?? null,
    initialBalance: Number(r.initial_balance ?? 0),
    active: r.active as boolean,
    sortOrder: (r.sort_order as number) ?? 0,
    cardLimit: r.card_limit != null ? Number(r.card_limit) : null,
    closingDay: (r.closing_day as number) ?? null,
    dueDay: (r.due_day as number) ?? null,
    color: (r.color as string) ?? null,
    excludeFromTotal: !!r.exclude_from_total,
    logoUrl: (r.logo_url as string) ?? null,
    unitId: (r.unit_id as string) ?? null,
  }
}

const ACCOUNT_COLS =
  "id, name, kind, bank, initial_balance, active, sort_order, card_limit, closing_day, due_day, color, exclude_from_total, logo_url, unit_id"

export async function getAccounts(holdingId: string, loja?: Loja): Promise<FinAccount[]> {
  const admin = createAdminClient()
  const { data } = await lojaWhere(
    admin.from("fin_accounts").select(ACCOUNT_COLS).eq("holding_id", holdingId),
    loja,
  )
    .order("sort_order")
    .order("created_at")
  return (data ?? []).map(mapAccount)
}

/** Contas com saldo calculado: inicial + efetivados (entradas − saídas + transferências). */
export async function getAccountsWithBalance(holdingId: string, loja?: Loja): Promise<FinAccount[]> {
  const admin = createAdminClient()
  const [{ data: accs }, { data: entries }] = await Promise.all([
    lojaWhere(
      admin.from("fin_accounts").select(ACCOUNT_COLS).eq("holding_id", holdingId),
      loja,
    ).order("sort_order"),
    admin
      .from("fin_entries")
      .select("kind, value, account_id, to_account_id, paid_date")
      .eq("holding_id", holdingId)
      .not("paid_date", "is", null),
  ])
  const bal = new Map<string, number>()
  for (const r of entries ?? []) {
    const v = Number(r.value ?? 0)
    if (r.kind === "receita" && r.account_id) bal.set(r.account_id, (bal.get(r.account_id) ?? 0) + v)
    else if (r.kind === "despesa" && r.account_id)
      bal.set(r.account_id, (bal.get(r.account_id) ?? 0) - v)
    else if (r.kind === "transferencia") {
      if (r.account_id) bal.set(r.account_id, (bal.get(r.account_id) ?? 0) - v)
      if (r.to_account_id) bal.set(r.to_account_id, (bal.get(r.to_account_id) ?? 0) + v)
    }
  }
  return (accs ?? []).map((r: Record<string, unknown>) => {
    const a = mapAccount(r)
    return { ...a, balance: a.initialBalance + (bal.get(a.id) ?? 0) }
  })
}

/** Contas com saldo + stats (pagas/a pagar/recebidas/a receber + nº de movimentações). */
export async function getAccountsWithStats(holdingId: string, loja?: Loja): Promise<FinAccount[]> {
  const admin = createAdminClient()
  const [{ data: accs }, { data: entries }] = await Promise.all([
    lojaWhere(
      admin.from("fin_accounts").select(ACCOUNT_COLS).eq("holding_id", holdingId),
      loja,
    ).order("sort_order"),
    admin
      .from("fin_entries")
      .select("kind, value, account_id, to_account_id, paid_date")
      .eq("holding_id", holdingId),
  ])
  type S = { pagas: number; aPagar: number; recebidas: number; aReceber: number; count: number }
  const stats = new Map<string, S>()
  const bal = new Map<string, number>()
  const getS = (id: string): S => {
    if (!stats.has(id)) stats.set(id, { pagas: 0, aPagar: 0, recebidas: 0, aReceber: 0, count: 0 })
    return stats.get(id)!
  }
  for (const r of entries ?? []) {
    const v = Number(r.value ?? 0)
    const efet = !!r.paid_date
    if (r.account_id) {
      const s = getS(r.account_id)
      s.count++
      if (r.kind === "despesa") {
        if (efet) {
          s.pagas += v
          bal.set(r.account_id, (bal.get(r.account_id) ?? 0) - v)
        } else s.aPagar += v
      } else if (r.kind === "receita") {
        if (efet) {
          s.recebidas += v
          bal.set(r.account_id, (bal.get(r.account_id) ?? 0) + v)
        } else s.aReceber += v
      } else if (r.kind === "transferencia" && efet) {
        bal.set(r.account_id, (bal.get(r.account_id) ?? 0) - v)
      }
    }
    if (r.kind === "transferencia" && efet && r.to_account_id) {
      bal.set(r.to_account_id, (bal.get(r.to_account_id) ?? 0) + v)
    }
  }
  return (accs ?? []).map((r: Record<string, unknown>) => {
    const a = mapAccount(r)
    return {
      ...a,
      balance: a.initialBalance + (bal.get(a.id) ?? 0),
      stats: stats.get(a.id) ?? { pagas: 0, aPagar: 0, recebidas: 0, aReceber: 0, count: 0 },
    }
  })
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
  /** exclui lançamentos cujo account_id está aqui (ex: compras de cartão) */
  excludeAccountIds?: string[]
  /** filtro de loja: "todas" | "rede" | <unitId> */
  loja?: Loja
}

export async function getEntries(
  holdingId: string,
  filters: EntryFilters = {},
): Promise<FinEntry[]> {
  const admin = createAdminClient()
  let q = admin.from("fin_entries").select(ENTRY_COLS).eq("holding_id", holdingId)
  q = lojaWhere(q, filters.loja)
  if (filters.year) q = q.eq("ref_year", filters.year)
  if (filters.month) q = q.eq("ref_month", filters.month)
  if (filters.kind) q = q.eq("kind", filters.kind)
  if (filters.accountId) q = q.eq("account_id", filters.accountId)
  if (filters.categoryId) q = q.eq("category_id", filters.categoryId)
  if (filters.search) q = q.ilike("description", `%${filters.search}%`)
  q = q.order("due_date", { ascending: false }).order("created_at", { ascending: false })

  const { data } = await q
  let rows = (data ?? []).map(mapEntry).filter((e) => !e.hidden)
  if (filters.excludeAccountIds?.length) {
    const ex = new Set(filters.excludeAccountIds)
    rows = rows.filter((e) => !(e.accountId && ex.has(e.accountId)))
  }
  return rows
}

/** IDs das contas do tipo cartão (pra isolar compras de cartão do caixa). */
export async function getCardAccountIds(holdingId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("fin_accounts")
    .select("id")
    .eq("holding_id", holdingId)
    .eq("kind", "cartao")
  return (data ?? []).map((r) => r.id as string)
}

export type CardInvoice = {
  year: number
  month: number
  total: number
  paid: boolean
  entries: FinEntry[]
}

/** Faturas de um cartão (agrupadas por competência invoice_year/month). */
export async function getCardInvoices(holdingId: string, cardId: string): Promise<CardInvoice[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("fin_entries")
    .select(ENTRY_COLS)
    .eq("holding_id", holdingId)
    .eq("account_id", cardId)
    .order("invoice_year", { ascending: false })
    .order("invoice_month", { ascending: false })
  const rows = (data ?? []).map(mapEntry).filter((e) => !e.hidden)
  const byKey = new Map<string, CardInvoice>()
  for (const e of rows) {
    const y = e.invoiceYear ?? (e.dueDate ? Number(e.dueDate.slice(0, 4)) : 0)
    const m = e.invoiceMonth ?? (e.dueDate ? Number(e.dueDate.slice(5, 7)) : 0)
    const key = `${y}-${m}`
    if (!byKey.has(key)) byKey.set(key, { year: y, month: m, total: 0, paid: true, entries: [] })
    const inv = byKey.get(key)!
    inv.entries.push(e)
    inv.total += e.value
    if (!e.paidDate) inv.paid = false
  }
  return [...byKey.values()].sort((a, b) => b.year - a.year || b.month - a.month)
}

/** Resumo do caixa (saldo + a pagar/receber + vencidos) pro mês. */
export async function getCaixaSummary(
  holdingId: string,
  year: number,
  month: number,
  loja?: Loja,
): Promise<CaixaSummary> {
  const admin = createAdminClient()
  const [{ data: accs }, { data: rows }] = await Promise.all([
    lojaWhere(
      admin.from("fin_accounts").select("id, kind, initial_balance").eq("holding_id", holdingId),
      loja,
    ),
    lojaWhere(
      admin
        .from("fin_entries")
        .select("kind, value, due_date, paid_date, account_id")
        .eq("holding_id", holdingId)
        .eq("ref_year", year)
        .eq("ref_month", month),
      loja,
    ),
  ])

  // Cartões não contam como saldo em conta, e suas compras não entram no caixa.
  type AccRow = { id: string; kind: string; initial_balance: number | null }
  const accsT = (accs ?? []) as AccRow[]
  const cardSet = new Set(accsT.filter((a) => a.kind === "cartao").map((a) => a.id))

  const today = todayISO()
  const s: CaixaSummary = {
    saldo: accsT
      .filter((a) => a.kind !== "cartao")
      .reduce((a, r) => a + Number(r.initial_balance ?? 0), 0),
    receitaEfetivada: 0,
    despesaEfetivada: 0,
    aReceber: 0,
    aPagar: 0,
    vencidoPagar: 0,
    vencidoReceber: 0,
  }
  for (const r of rows ?? []) {
    if (r.account_id && cardSet.has(r.account_id)) continue // compra de cartão → fica na fatura
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

// ─────────────────────────── Dashboard (Visão Geral) ────────────────────────
function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

export type DashBucket = { count: number; sum: number }
export type DashPanel = {
  vencendoHoje: DashBucket
  emAtraso: DashBucket
  proximos7: DashBucket
  proximos30: DashBucket
}
export type CategoryTotal = {
  categoryId: string | null
  name: string
  icon: string | null
  total: number
}
export type CaixaDashboard = {
  accounts: FinAccount[]
  cartoes: { account: FinAccount; faturaAberta: number; disponivel: number | null }[]
  saldoTotal: number
  receitaPeriodo: number
  despesaPeriodo: number
  balancoPeriodo: number
  pagamentos: DashPanel
  recebimentos: DashPanel
  proximosVencimentos: FinEntry[]
  proximosRecebimentos: FinEntry[]
  maioresGastos: CategoryTotal[]
  maioresReceitas: CategoryTotal[]
  ultimosLancamentos: FinEntry[]
}

const emptyPanel = (): DashPanel => ({
  vencendoHoje: { count: 0, sum: 0 },
  emAtraso: { count: 0, sum: 0 },
  proximos7: { count: 0, sum: 0 },
  proximos30: { count: 0, sum: 0 },
})

export async function getCaixaDashboard(
  holdingId: string,
  year: number,
  month: number,
  loja?: Loja,
): Promise<CaixaDashboard> {
  const [accounts, periodEntries, categories] = await Promise.all([
    getAccountsWithBalance(holdingId, loja),
    getEntries(holdingId, { year, month, loja }),
    getCategoriesFlat(holdingId),
  ])
  const catById = new Map(categories.map((c) => [c.id, c]))
  const cardIds = new Set(accounts.filter((a) => a.kind === "cartao").map((a) => a.id))
  const isCardEntry = (e: FinEntry) => !!(e.accountId && cardIds.has(e.accountId))

  // Pendentes (todas as competências) p/ painéis de vencimento.
  const admin = createAdminClient()
  const { data: pendRows } = await lojaWhere(
    admin.from("fin_entries").select(ENTRY_COLS).eq("holding_id", holdingId).is("paid_date", null),
    loja,
  )
  const pendAll: FinEntry[] = ((pendRows ?? []) as Record<string, unknown>[])
    .map(mapEntry)
    .filter((e) => !e.hidden)
  // No caixa, compras de cartão ficam fora (só a fatura paga entra).
  const pend = pendAll.filter((e) => !isCardEntry(e))
  const periodCash = periodEntries.filter((e) => !isCardEntry(e))

  const today = todayISO()
  const in7 = addDaysISO(today, 7)
  const in30 = addDaysISO(today, 30)

  const pagamentos = emptyPanel()
  const recebimentos = emptyPanel()
  for (const e of pend) {
    if (e.kind !== "despesa" && e.kind !== "receita") continue
    const panel = e.kind === "despesa" ? pagamentos : recebimentos
    const d = e.dueDate
    if (!d) continue
    if (d < today) {
      panel.emAtraso.count++
      panel.emAtraso.sum += e.value
    } else if (d === today) {
      panel.vencendoHoje.count++
      panel.vencendoHoje.sum += e.value
    }
    if (d >= today && d <= in7) {
      panel.proximos7.count++
      panel.proximos7.sum += e.value
    }
    if (d >= today && d <= in30) {
      panel.proximos30.count++
      panel.proximos30.sum += e.value
    }
  }

  const byDueAsc = (a: FinEntry, b: FinEntry) => (a.dueDate ?? "9").localeCompare(b.dueDate ?? "9")
  const proximosVencimentos = pend
    .filter((e) => e.kind === "despesa" && e.dueDate)
    .sort(byDueAsc)
    .slice(0, 6)
  const proximosRecebimentos = pend
    .filter((e) => e.kind === "receita" && e.dueDate)
    .sort(byDueAsc)
    .slice(0, 6)

  // Período: totais + maiores por categoria + últimos.
  let receitaPeriodo = 0
  let despesaPeriodo = 0
  const gastoCat = new Map<string, number>()
  const receitaCat = new Map<string, number>()
  for (const e of periodCash) {
    if (e.kind === "receita") {
      receitaPeriodo += e.value
      receitaCat.set(e.categoryId ?? "—", (receitaCat.get(e.categoryId ?? "—") ?? 0) + e.value)
    } else if (e.kind === "despesa") {
      despesaPeriodo += e.value
      gastoCat.set(e.categoryId ?? "—", (gastoCat.get(e.categoryId ?? "—") ?? 0) + e.value)
    }
  }
  const toCatTotals = (m: Map<string, number>): CategoryTotal[] =>
    [...m.entries()]
      .map(([cid, total]) => {
        const c = cid === "—" ? null : catById.get(cid)
        return {
          categoryId: c?.id ?? null,
          name: c?.name ?? "Sem categoria",
          icon: c?.icon ?? null,
          total,
        }
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)

  const cartoes = accounts
    .filter((a) => a.kind === "cartao")
    .map((account) => {
      const faturaAberta = pendAll
        .filter((e) => e.kind === "despesa" && e.accountId === account.id)
        .reduce((s, e) => s + e.value, 0)
      return {
        account,
        faturaAberta,
        disponivel: account.cardLimit != null ? account.cardLimit - faturaAberta : null,
      }
    })

  const saldoTotal = accounts
    .filter((a) => a.kind !== "cartao" && !a.excludeFromTotal)
    .reduce((s, a) => s + (a.balance ?? 0), 0)

  return {
    accounts: accounts.filter((a) => a.kind !== "cartao"),
    cartoes,
    saldoTotal,
    receitaPeriodo,
    despesaPeriodo,
    balancoPeriodo: receitaPeriodo - despesaPeriodo,
    pagamentos,
    recebimentos,
    proximosVencimentos,
    proximosRecebimentos,
    maioresGastos: toCatTotals(gastoCat),
    maioresReceitas: toCatTotals(receitaCat),
    ultimosLancamentos: periodCash.slice(0, 8),
  }
}

// ─────────────────────────── Contatos (Cadastros) ──────────────────────────
export type ContactType = "cliente" | "fornecedor" | "ambos" | "colaborador"
export type FinContact = {
  id: string
  personType: "pj" | "pf"
  name: string
  legalName: string | null
  doc: string | null
  contactType: ContactType
  paymentTerm: string | null
  stateRegistration: string | null
  phone: string | null
  email: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  complemento: string | null
}

function mapContact(r: Record<string, unknown>): FinContact {
  return {
    id: r.id as string,
    personType: r.person_type as "pj" | "pf",
    name: r.name as string,
    legalName: (r.legal_name as string) ?? null,
    doc: (r.doc as string) ?? null,
    contactType: r.contact_type as ContactType,
    paymentTerm: (r.payment_term as string) ?? null,
    stateRegistration: (r.state_registration as string) ?? null,
    phone: (r.phone as string) ?? null,
    email: (r.email as string) ?? null,
    cep: (r.cep as string) ?? null,
    logradouro: (r.logradouro as string) ?? null,
    numero: (r.numero as string) ?? null,
    bairro: (r.bairro as string) ?? null,
    cidade: (r.cidade as string) ?? null,
    uf: (r.uf as string) ?? null,
    complemento: (r.complemento as string) ?? null,
  }
}

export async function getContacts(holdingId: string): Promise<FinContact[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("fin_contacts")
    .select("*")
    .eq("holding_id", holdingId)
    .order("name")
  return (data ?? []).map(mapContact)
}

export type ContactCounts = { todos: number; clientes: number; fornecedores: number; pf: number }
export function countContacts(contacts: FinContact[]): ContactCounts {
  return {
    todos: contacts.length,
    clientes: contacts.filter((c) => c.contactType === "cliente" || c.contactType === "ambos").length,
    fornecedores: contacts.filter(
      (c) => c.contactType === "fornecedor" || c.contactType === "ambos",
    ).length,
    pf: contacts.filter((c) => c.personType === "pf").length,
  }
}

// Top clientes (receitas) / fornecedores (despesas) por titular, no período.
export type TitularTotal = { name: string; total: number; count: number }
export async function getTopTitulares(
  holdingId: string,
  year: number,
  month: number,
  loja?: Loja,
): Promise<{ clientes: TitularTotal[]; fornecedores: TitularTotal[] }> {
  const cardIds = await getCardAccountIds(holdingId)
  const entries = await getEntries(holdingId, { year, month, excludeAccountIds: cardIds, loja })
  const agg = (kind: EntryKind) => {
    const m = new Map<string, TitularTotal>()
    for (const e of entries) {
      if (e.kind !== kind || !e.titular) continue
      const t = m.get(e.titular) ?? { name: e.titular, total: 0, count: 0 }
      t.total += e.value
      t.count++
      m.set(e.titular, t)
    }
    return [...m.values()].sort((a, b) => b.total - a.total).slice(0, 5)
  }
  return { clientes: agg("receita"), fornecedores: agg("despesa") }
}
