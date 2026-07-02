import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { isSuperadmin } from "@/lib/auth/permissions"
import { computeBillingStatus, type BillingStatus } from "@/lib/data/billing"

/**
 * Painel de Dono (super-admin) — visão de TODOS os clientes (holdings) da
 * plataforma. Só o super-admin chega aqui; mesmo assim, guardamos por dentro
 * (defesa em profundidade) — se não for super-admin, devolve vazio.
 */
export type HoldingUnit = {
  id: string
  name: string
  code: string | null
  city: string | null
  state: string | null
  active: boolean
}
export type HoldingPayment = {
  id: string
  paidOn: string
  amount: number
  method: string | null
  refMonth: string | null
  note: string | null
}

export type ClientOverview = {
  id: string
  name: string
  slug: string
  createdAt: string
  brands: number
  units: number
  activeUnits: number
  users: number
  /** Último acesso (max last_sign_in_at dos usuários da empresa). */
  lastLogin: string | null
  establishmentType: string | null
  // Cobrança
  paymentMethod: string | null
  monthlyFee: number | null
  pricePerUnit: number | null
  includedUnits: number
  billableUnits: number // lojas cobradas (ativas)
  extraUnits: number // lojas além das inclusas
  computedMonthly: number // base + extras × valor/loja
  dueDate: string | null
  paid: boolean
  suspendOn: string | null
  trialEndsAt: string | null
  billingStatus: BillingStatus
  // Assinatura Asaas
  planTier: "essencial" | "pro" | null
  asaasActive: boolean // tem assinatura recorrente no Asaas
  asaasLastEvent: string | null // último evento do webhook (ex.: PAYMENT_CONFIRMED)
  asaasLastEventAt: string | null
  unitsList: HoldingUnit[]
  payments: HoldingPayment[]
}

export type PlatformTotals = {
  clients: number
  units: number
  activeUnits: number
  users: number
  // Financeiro (snapshot do mês, baseado em monthly_fee + status)
  received: number
  pending: number
  overdueAmount: number
  mrr: number
}

export async function getClientsOverview(): Promise<{
  clients: ClientOverview[]
  totals: PlatformTotals
}> {
  const empty = {
    clients: [] as ClientOverview[],
    totals: {
      clients: 0,
      units: 0,
      activeUnits: 0,
      users: 0,
      received: 0,
      pending: 0,
      overdueAmount: 0,
      mrr: 0,
    },
  }
  if (!(await isSuperadmin())) return empty

  const admin = createAdminClient()
  const [brandsRes, unitsRes, accessRes, paymentsRes] = await Promise.all([
    admin.from("brands").select("id, holding_id"),
    admin.from("units").select("id, brand_id, active, name, code, city, state"),
    admin.from("user_unit_access").select("user_id, scope_type, scope_id"),
    admin
      .from("holding_payments")
      .select("id, holding_id, paid_on, amount, method, ref_month, note")
      .order("paid_on", { ascending: false }),
  ])

  // holdings com colunas de cobrança — fallback se a migration ainda não rodou
  const hFull = await admin
    .from("holdings")
    .select(
      "id, name, slug, created_at, establishment_type, payment_method, monthly_fee, price_per_unit, included_units, due_date, paid, suspend_on, trial_ends_at, plan_tier, asaas_subscription_id, asaas_last_event",
    )
    .order("created_at")
  const holdings = hFull.error
    ? (
        (
          await admin
            .from("holdings")
            .select("id, name, slug, created_at")
            .order("created_at")
        ).data ?? []
      ).map((h) => ({
        ...h,
        establishment_type: null,
        payment_method: null,
        monthly_fee: null,
        price_per_unit: null,
        included_units: 1,
        due_date: null,
        paid: true,
        suspend_on: null,
        trial_ends_at: null,
        plan_tier: null,
        asaas_subscription_id: null,
        asaas_last_event: null,
      }))
    : (hFull.data ?? [])

  const brands = brandsRes.data ?? []
  const units = unitsRes.data ?? []
  const accesses = accessRes.data ?? []

  // Último acesso por usuário (auth). Lista tudo (poucos usuários na plataforma).
  const lastLoginByUser = new Map<string, string | null>()
  try {
    const { data: authList } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })
    for (const u of authList?.users ?? [])
      lastLoginByUser.set(u.id, u.last_sign_in_at ?? null)
  } catch {
    // sem auth admin → deixa vazio (coluna mostra "—")
  }

  // pagamentos por holding (tabela pode não existir ainda → vazio)
  const paymentsByHolding = new Map<string, HoldingPayment[]>()
  for (const p of paymentsRes.data ?? []) {
    const arr = paymentsByHolding.get(p.holding_id) ?? []
    arr.push({
      id: p.id,
      paidOn: p.paid_on,
      amount: Number(p.amount),
      method: p.method ?? null,
      refMonth: p.ref_month ?? null,
      note: p.note ?? null,
    })
    paymentsByHolding.set(p.holding_id, arr)
  }

  // brand → holding  e  holding → brands
  const brandHolding = new Map<string, string>()
  const brandsByHolding = new Map<string, Set<string>>()
  for (const b of brands) {
    brandHolding.set(b.id, b.holding_id)
    const set = brandsByHolding.get(b.holding_id) ?? new Set<string>()
    set.add(b.id)
    brandsByHolding.set(b.holding_id, set)
  }

  // unit → holding  +  contagens  +  lista de lojas
  const unitHolding = new Map<string, string>()
  const unitCount = new Map<string, number>()
  const activeUnitCount = new Map<string, number>()
  const unitsByHolding = new Map<string, HoldingUnit[]>()
  for (const u of units) {
    const h = brandHolding.get(u.brand_id)
    if (!h) continue
    unitHolding.set(u.id, h)
    unitCount.set(h, (unitCount.get(h) ?? 0) + 1)
    if (u.active) activeUnitCount.set(h, (activeUnitCount.get(h) ?? 0) + 1)
    const list = unitsByHolding.get(h) ?? []
    list.push({
      id: u.id,
      name: u.name,
      code: u.code ?? null,
      city: u.city ?? null,
      state: u.state ?? null,
      active: !!u.active,
    })
    unitsByHolding.set(h, list)
  }

  // usuários distintos por holding (qualquer escopo que aponte pra ela)
  const usersByHolding = new Map<string, Set<string>>()
  const addUser = (h: string, uid: string) => {
    const set = usersByHolding.get(h) ?? new Set<string>()
    set.add(uid)
    usersByHolding.set(h, set)
  }
  for (const a of accesses) {
    if (!a.scope_id) continue
    if (a.scope_type === "holding") addUser(a.scope_id, a.user_id)
    else if (a.scope_type === "brand") {
      const h = brandHolding.get(a.scope_id)
      if (h) addUser(h, a.user_id)
    } else if (a.scope_type === "unit") {
      const h = unitHolding.get(a.scope_id)
      if (h) addUser(h, a.user_id)
    }
  }

  const clients: ClientOverview[] = holdings.map((h) => {
    const hh = h as typeof h & {
      establishment_type: string | null
      payment_method: string | null
      monthly_fee: number | string | null
      price_per_unit: number | string | null
      included_units: number | null
      due_date: string | null
      paid: boolean | null
      suspend_on: string | null
      trial_ends_at: string | null
      plan_tier: string | null
      asaas_subscription_id: string | null
      asaas_last_event: { event?: string; at?: string } | null
    }
    const billing = {
      paymentMethod: hh.payment_method ?? null,
      monthlyFee: hh.monthly_fee != null ? Number(hh.monthly_fee) : null,
      dueDate: hh.due_date ?? null,
      paid: hh.paid ?? true,
      suspendOn: hh.suspend_on ?? null,
      trialEndsAt: hh.trial_ends_at ?? null,
    }
    // Mensalidade = base + (lojas ativas além das inclusas × valor por loja)
    const activeUnits = activeUnitCount.get(h.id) ?? 0
    const includedUnits = hh.included_units ?? 1
    const pricePerUnit = hh.price_per_unit != null ? Number(hh.price_per_unit) : null
    const billableUnits = activeUnits
    const extraUnits = Math.max(0, billableUnits - includedUnits)
    const computedMonthly = (billing.monthlyFee ?? 0) + extraUnits * (pricePerUnit ?? 0)
    // Último acesso = max last_sign_in_at dos usuários da empresa.
    let lastLogin: string | null = null
    for (const uid of usersByHolding.get(h.id) ?? []) {
      const ll = lastLoginByUser.get(uid)
      if (ll && (!lastLogin || ll > lastLogin)) lastLogin = ll
    }
    return {
      id: h.id,
      name: h.name,
      slug: h.slug,
      createdAt: h.created_at,
      establishmentType: hh.establishment_type ?? null,
      brands: brandsByHolding.get(h.id)?.size ?? 0,
      units: unitCount.get(h.id) ?? 0,
      activeUnits,
      users: usersByHolding.get(h.id)?.size ?? 0,
      lastLogin,
      ...billing,
      pricePerUnit,
      includedUnits,
      billableUnits,
      extraUnits,
      computedMonthly,
      billingStatus: computeBillingStatus(billing),
      planTier:
        hh.plan_tier === "essencial" || hh.plan_tier === "pro"
          ? hh.plan_tier
          : null,
      asaasActive: !!hh.asaas_subscription_id,
      asaasLastEvent: hh.asaas_last_event?.event ?? null,
      asaasLastEventAt: hh.asaas_last_event?.at ?? null,
      unitsList: unitsByHolding.get(h.id) ?? [],
      payments: paymentsByHolding.get(h.id) ?? [],
    }
  })

  // MRR/recebido/etc usam a mensalidade calculada (base + lojas extras)
  const fee = (c: ClientOverview) => c.computedMonthly
  const totals: PlatformTotals = {
    clients: clients.length,
    units: clients.reduce((s, c) => s + c.units, 0),
    activeUnits: clients.reduce((s, c) => s + c.activeUnits, 0),
    users: clients.reduce((s, c) => s + c.users, 0),
    received: clients
      .filter((c) => c.billingStatus === "paid")
      .reduce((s, c) => s + fee(c), 0),
    pending: clients
      .filter((c) => c.billingStatus === "pending")
      .reduce((s, c) => s + fee(c), 0),
    overdueAmount: clients
      .filter(
        (c) => c.billingStatus === "overdue" || c.billingStatus === "suspended",
      )
      .reduce((s, c) => s + fee(c), 0),
    mrr: clients.reduce((s, c) => s + fee(c), 0),
  }

  return { clients, totals }
}
