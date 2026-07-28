import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { isSuperadmin } from "@/lib/auth/permissions"
import {
  asaasGetCustomer,
  asaasListInvoices,
  type AsaasInvoice,
} from "@/lib/asaas/client"
import {
  PLATAFORMAS,
  type PlatformId,
} from "@/components/platform-logo"
import {
  getDefaultPlan,
  precoDoPlano,
  type PlanId,
} from "@/lib/data/assinatura"
import {
  getAuditoriaDoCliente,
  type EntradaAuditoria,
} from "@/lib/data/auditoria"
import { getFaturasDoCliente, type Fatura } from "@/lib/data/faturas"
import { getConsumoIaDoCliente } from "@/lib/data/ia-custos"
import {
  computeBillingStatus,
  effectiveTrialEnd,
  type BillingStatus,
} from "@/lib/data/billing"

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
  /** Plataformas habilitadas na loja (unit_platforms.active). */
  platforms: PlatformId[]
  /** Conectada ao iFood via API (unit_platforms.api_store_id preenchido). */
  ifoodApi: boolean
  /** Conectada ao 99 via API (ninefood_store_links ativo). */
  ninefoodApi: boolean
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
  /**
   * Nenhum usuário da empresa confirmou o e-mail — o cadastro está travado
   * ANTES da primeira tela. Vale mais que qualquer aviso dentro do sistema,
   * porque essa pessoa nunca chega a vê-lo.
   */
  emailNaoConfirmado: boolean
  establishmentType: string | null
  // Cobrança
  paymentMethod: string | null
  monthlyFee: number | null
  pricePerUnit: number | null
  includedUnits: number
  billableUnits: number // lojas cobradas (ativas)
  extraUnits: number // lojas além das inclusas
  computedMonthly: number // base + extras × valor/loja
  /**
   * true = preço NEGOCIADO (monthly_fee preenchido à mão), fora da tabela.
   * false = veio do plano. A tela mostra isso porque um valor fora da tabela
   * que ninguém sabe explicar é a origem de discussão de fatura.
   */
  precoNegociado: boolean
  /** Conta da própria casa: fora do MRR/ARPA e da emissão de faturas. */
  contaInterna: boolean
  contaInternaNota: string | null
  /** Convidado a migrar a cobrança manual pro Asaas (destrava /assinatura). */
  conviteAsaasEm: string | null
  /** Preço da 1ª loja e de cada adicional no plano vigente do cliente. */
  planoFirst: number | null
  planoAdd: number | null
  dueDate: string | null
  paid: boolean
  suspendOn: string | null
  trialEndsAt: string | null
  billingStatus: BillingStatus
  // Assinatura Asaas
  planTier: "essencial" | "pro" | "ai" | null
  /** Fim da degustação do Nino AI (cortesia). null = sem degustação. */
  ninoTrialEndsAt: string | null
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
  const [brandsRes, unitsRes, accessRes, paymentsRes, platRes, nineRes] =
    await Promise.all([
    admin.from("brands").select("id, holding_id"),
    admin.from("units").select("id, brand_id, active, name, code, city, state"),
    admin.from("user_unit_access").select("user_id, scope_type, scope_id"),
    admin
      .from("holding_payments")
      .select("id, holding_id, paid_on, amount, method, ref_month, note")
      .order("paid_on", { ascending: false }),
    // Plataformas habilitadas por loja + vínculo de API do iFood.
    admin
      .from("unit_platforms")
      .select("unit_id, platform, active, api_store_id"),
    // Lojas com vínculo de API do 99.
    admin.from("ninefood_store_links").select("unit_id").eq("active", true),
  ])

  // unit_id → { plataformas habilitadas, iFood via API }
  const platsByUnit = new Map<string, Set<PlatformId>>()
  const ifoodApiUnits = new Set<string>()
  for (const p of (platRes.data ?? []) as {
    unit_id: string
    platform: string
    active: boolean
    api_store_id: string | null
  }[]) {
    if (p.active) {
      const set = platsByUnit.get(p.unit_id) ?? new Set<PlatformId>()
      set.add(p.platform as PlatformId)
      platsByUnit.set(p.unit_id, set)
    }
    if (p.platform === "ifood" && p.active && p.api_store_id)
      ifoodApiUnits.add(p.unit_id)
  }
  const nineApiUnits = new Set(
    ((nineRes.data ?? []) as { unit_id: string | null }[])
      .map((r) => r.unit_id)
      .filter((id): id is string => !!id),
  )

  // holdings com colunas de cobrança — fallback se a migration ainda não rodou
  const hFull = await admin
    .from("holdings")
    .select(
      "id, name, slug, created_at, establishment_type, payment_method, monthly_fee, price_per_unit, included_units, due_date, paid, suspend_on, trial_ends_at, plan_tier, nino_trial_ends_at, asaas_subscription_id, asaas_last_event, conta_interna, conta_interna_nota, convite_asaas_em",
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
        conta_interna: false,
        conta_interna_nota: null,
        convite_asaas_em: null,
        payment_method: null,
        monthly_fee: null,
        price_per_unit: null,
        included_units: 1,
        due_date: null,
        paid: true,
        suspend_on: null,
        trial_ends_at: null,
        plan_tier: null,
        nino_trial_ends_at: null,
        asaas_subscription_id: null,
        asaas_last_event: null,
      }))
    : (hFull.data ?? [])

  // Tabela de preços vigente (editável em /plataforma). Uma vez só, fora do
  // laço — é a régua de TODOS os clientes sem preço negociado.
  const precos = await getDefaultPlan()

  const brands = brandsRes.data ?? []
  const units = unitsRes.data ?? []
  const accesses = accessRes.data ?? []

  // Último acesso por usuário. Combina last_sign_in_at (auth — só muda ao
  // digitar a senha) com profiles.last_seen_at (atividade real, throttled) e
  // pega o mais recente. Sem o last_seen_at, quem fica logado aparecia sumido.
  const lastLoginByUser = new Map<string, string | null>()
  /** userId → confirmou o e-mail? Só quem entrou pelo auto-cadastro precisa. */
  const emailConfirmadoByUser = new Map<string, boolean>()
  const keepMax = (uid: string, ts: string | null) => {
    if (!ts) return
    const prev = lastLoginByUser.get(uid)
    if (!prev || ts > prev) lastLoginByUser.set(uid, ts)
  }
  try {
    const { data: authList } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })
    for (const u of authList?.users ?? []) {
      keepMax(u.id, u.last_sign_in_at ?? null)
      emailConfirmadoByUser.set(u.id, Boolean(u.email_confirmed_at))
    }
  } catch {
    // sem auth admin → cai só no last_seen_at
  }
  const { data: seenRows } = await admin
    .from("profiles")
    .select("user_id, last_seen_at")
    .not("last_seen_at", "is", null)
  for (const r of seenRows ?? [])
    keepMax(r.user_id as string, (r.last_seen_at as string) ?? null)

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
    const platSet = platsByUnit.get(u.id)
    list.push({
      id: u.id,
      name: u.name,
      code: u.code ?? null,
      city: u.city ?? null,
      state: u.state ?? null,
      active: !!u.active,
      platforms: PLAT_ORDER.filter((p) => platSet?.has(p)),
      ifoodApi: ifoodApiUnits.has(u.id),
      ninefoodApi: nineApiUnits.has(u.id),
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
      nino_trial_ends_at: string | null
      asaas_subscription_id: string | null
      asaas_last_event: { event?: string; at?: string } | null
    }
    const billing = {
      paymentMethod: hh.payment_method ?? null,
      monthlyFee: hh.monthly_fee != null ? Number(hh.monthly_fee) : null,
      dueDate: hh.due_date ?? null,
      paid: hh.paid ?? true,
      suspendOn: hh.suspend_on ?? null,
      // Trial ANCORADO no cadastro (não renova ao cancelar).
      trialEndsAt: effectiveTrialEnd(hh.trial_ends_at ?? null, h.created_at),
    }
    // Mensalidade. A REGRA é o plano (primeira loja + adicionais × lojas
    // ativas); o valor manual é EXCEÇÃO, pra cliente com preço negociado.
    //
    // Antes isso olhava só os campos manuais, e como ninguém os preenchia
    // todo cliente valia R$ 0 — o MRR da plataforma inteira aparecia zerado
    // com quatro contratos ativos. O plano já estava no banco e nos preços
    // de `assinatura.ts`; faltava a conta usar.
    const activeUnits = activeUnitCount.get(h.id) ?? 0
    const includedUnits = hh.included_units ?? 1
    const pricePerUnit = hh.price_per_unit != null ? Number(hh.price_per_unit) : null
    const billableUnits = activeUnits
    const extraUnits = Math.max(0, billableUnits - includedUnits)
    const planoDoCliente = (hh.plan_tier ?? null) as PlanId | null
    const precoNegociado = billing.monthlyFee != null
    const computedMonthly = precoNegociado
      ? (billing.monthlyFee ?? 0) + extraUnits * (pricePerUnit ?? 0)
      : planoDoCliente
        ? precoDoPlano(precos, planoDoCliente, activeUnits)
        : 0
    // Último acesso = max last_sign_in_at dos usuários da empresa.
    let lastLogin: string | null = null
    // Só marca como travado quando SABEMOS de algum usuário e NENHUM confirmou
    // — sem isso, empresa sem usuário mapeado apareceria como travada à toa.
    let temUsuarioConhecido = false
    let algumConfirmou = false
    for (const uid of usersByHolding.get(h.id) ?? []) {
      const ll = lastLoginByUser.get(uid)
      if (ll && (!lastLogin || ll > lastLogin)) lastLogin = ll
      const conf = emailConfirmadoByUser.get(uid)
      if (conf !== undefined) {
        temUsuarioConhecido = true
        if (conf) algumConfirmou = true
      }
    }
    return {
      id: h.id,
      name: h.name,
      slug: h.slug,
      createdAt: h.created_at,
      emailNaoConfirmado: temUsuarioConhecido && !algumConfirmou,
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
      precoNegociado,
      contaInterna: Boolean(hh.conta_interna),
      contaInternaNota: (hh.conta_interna_nota as string | null) ?? null,
      conviteAsaasEm: (hh.convite_asaas_em as string | null) ?? null,
      planoFirst: planoDoCliente ? precos[planoDoCliente].first : null,
      planoAdd: planoDoCliente ? precos[planoDoCliente].add : null,
      billingStatus: computeBillingStatus(billing),
      planTier:
        hh.plan_tier === "essencial" ||
        hh.plan_tier === "pro" ||
        hh.plan_tier === "ai"
          ? hh.plan_tier
          : null,
      ninoTrialEndsAt: hh.nino_trial_ends_at ?? null,
      asaasActive: !!hh.asaas_subscription_id,
      asaasLastEvent: hh.asaas_last_event?.event ?? null,
      asaasLastEventAt: hh.asaas_last_event?.at ?? null,
      unitsList: unitsByHolding.get(h.id) ?? [],
      payments: paymentsByHolding.get(h.id) ?? [],
    }
  })

  // MRR/recebido/etc usam a mensalidade calculada (base + lojas extras).
  // Conta interna vale ZERO aqui: é dinheiro que sai e volta pro mesmo bolso,
  // e o MRR é justamente o número que se olha pra decidir se o negócio anda.
  // Ela continua na LISTA (uso real da plataforma), só não soma receita.
  const fee = (c: ClientOverview) => (c.contaInterna ? 0 : c.computedMonthly)
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

// ─────────────────────────────────────────────────────────────────────────
// Detalhe de UM cliente (holding) — visão de dono, tudo num lugar.
// ─────────────────────────────────────────────────────────────────────────

export type ClientUser = {
  userId: string
  name: string | null
  email: string | null
  whatsapp: string | null
  perfil: string | null
  scope: "holding" | "brand" | "unit"
  isAdmin: boolean
  lastLogin: string | null
}
export type ClientUnitFull = HoldingUnit & {
  cnpj: string | null
  brandName: string | null
  platforms: PlatformId[]
}
export type ClientFiscal = {
  accountType: "PF" | "PJ" | null
  razaoSocial: string
  cpfCnpj: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  telefone: string
  email: string
}
export type ClientInvoice = {
  id: string
  number: string | null
  status: string | null
  value: number | null
  effectiveDate: string | null
  pdfUrl: string | null
  xmlUrl: string | null
  serviceDescription: string | null
}
export type ClientDetail = ClientOverview & {
  fiscal: ClientFiscal
  fiscalPreenchido: boolean
  /** Dados fiscais vieram do Asaas (cliente ainda não preencheu no sistema). */
  fiscalFromAsaas: boolean
  /** Endereço fiscal já formatado numa linha (ou "" se vazio). */
  enderecoFmt: string
  /** Contato principal: o admin da conta (quem cadastrou). */
  contactName: string | null
  /** E-mail de login do admin (auth). */
  loginEmail: string | null
  contactWhatsapp: string | null
  usersList: ClientUser[]
  unitsFull: ClientUnitFull[]
  asaasCustomerId: string | null
  asaasSubscriptionId: string | null
  /** NOTAS FISCAIS emitidas no Asaas (não confundir com `faturas`). */
  invoices: ClientInvoice[]
  /** COBRANÇAS que este cliente deve/pagou (holding_invoices). */
  faturas: Fatura[]
  /** Quem mexeu em plano/cobrança deste cliente, e quando. */
  auditoria: EntradaAuditoria[]
  /** Consumo do Nino AI no mês corrente (mensagens + custo de API). */
  consumoIa: { mensagens: number; custoUsd: number; respostasMedidas: number }
}

// Lista fixa deixava loja de canal próprio aparecer SEM plataforma nenhuma
// no painel de clientes.
const PLAT_ORDER: PlatformId[] = PLATAFORMAS

export async function getClientDetail(
  holdingId: string,
): Promise<ClientDetail | null> {
  if (!(await isSuperadmin())) return null

  const { clients } = await getClientsOverview()
  const base = clients.find((c) => c.id === holdingId)
  if (!base) return null

  const admin = createAdminClient()

  // 1) Dados fiscais / NF + ids do Asaas
  const { data: h } = await admin
    .from("holdings")
    .select(
      "razao_social, doc_cpf_cnpj, account_type, nf_cep, nf_logradouro, nf_numero, nf_complemento, nf_bairro, nf_cidade, nf_uf, nf_telefone, nf_email, asaas_customer_id, asaas_subscription_id",
    )
    .eq("id", holdingId)
    .maybeSingle()
  const fiscal: ClientFiscal = {
    accountType: (h?.account_type as "PF" | "PJ" | null) ?? null,
    razaoSocial: (h?.razao_social as string) ?? "",
    cpfCnpj: (h?.doc_cpf_cnpj as string) ?? "",
    cep: (h?.nf_cep as string) ?? "",
    logradouro: (h?.nf_logradouro as string) ?? "",
    numero: (h?.nf_numero as string) ?? "",
    complemento: (h?.nf_complemento as string) ?? "",
    bairro: (h?.nf_bairro as string) ?? "",
    cidade: (h?.nf_cidade as string) ?? "",
    uf: (h?.nf_uf as string) ?? "",
    telefone: (h?.nf_telefone as string) ?? "",
    email: (h?.nf_email as string) ?? "",
  }
  let fiscalPreenchido = Boolean(fiscal.cpfCnpj || fiscal.cep)
  const asaasCustomerId = (h?.asaas_customer_id as string) ?? null
  const asaasSubscriptionId = (h?.asaas_subscription_id as string) ?? null

  // Backfill: se o cliente ainda não preencheu os dados fiscais no sistema mas
  // já tem cliente no Asaas, puxa de lá (CNPJ, endereço, e-mail de cobrança).
  // Mesma lógica do "Minha conta › Informações".
  let fiscalFromAsaas = false
  if (!fiscalPreenchido && asaasCustomerId) {
    const cust = await asaasGetCustomer(asaasCustomerId)
    if (cust) {
      const doc = (cust.cpfCnpj ?? "").replace(/\D/g, "")
      fiscal.accountType =
        doc.length === 14 ? "PJ" : doc.length === 11 ? "PF" : null
      fiscal.razaoSocial = cust.name ?? ""
      fiscal.cpfCnpj = doc
      fiscal.cep = (cust.postalCode ?? "").replace(/\D/g, "")
      fiscal.logradouro = cust.address ?? ""
      fiscal.numero = cust.addressNumber ?? ""
      fiscal.complemento = cust.complement ?? ""
      fiscal.bairro = cust.province ?? ""
      fiscal.cidade = cust.cityName ?? ""
      fiscal.uf = cust.state ?? ""
      fiscal.telefone = cust.mobilePhone ?? ""
      fiscal.email = cust.email ?? ""
      fiscalPreenchido = Boolean(fiscal.cpfCnpj || fiscal.cep || fiscal.email)
      fiscalFromAsaas = fiscalPreenchido
    }
  }
  const enderecoFmt = [
    fiscal.logradouro,
    fiscal.numero && `nº ${fiscal.numero}`,
    fiscal.complemento,
    fiscal.bairro,
    fiscal.cidade && fiscal.uf
      ? `${fiscal.cidade}/${fiscal.uf}`
      : fiscal.cidade || fiscal.uf,
    fiscal.cep && `CEP ${fiscal.cep}`,
  ]
    .filter(Boolean)
    .join(", ")

  // 2) Marcas e lojas do cliente (com cnpj + plataformas ativas)
  const { data: brandRows } = await admin
    .from("brands")
    .select("id, name")
    .eq("holding_id", holdingId)
  const brandIds = (brandRows ?? []).map((b) => b.id)
  const brandName = new Map<string, string>()
  for (const b of brandRows ?? []) brandName.set(b.id, b.name as string)

  const { data: unitRows } = brandIds.length
    ? await admin
        .from("units")
        .select("id, brand_id, code, name, cnpj, city, state, active")
        .in("brand_id", brandIds)
    : { data: [] as never[] }
  const unitIds = (unitRows ?? []).map((u) => u.id)

  const [{ data: platRows }, { data: nineRows }] = await Promise.all([
    unitIds.length
      ? admin
          .from("unit_platforms")
          .select("unit_id, platform, active, api_store_id")
          .in("unit_id", unitIds)
      : Promise.resolve({ data: [] as never[] }),
    unitIds.length
      ? admin
          .from("ninefood_store_links")
          .select("unit_id")
          .eq("active", true)
          .in("unit_id", unitIds)
      : Promise.resolve({ data: [] as never[] }),
  ])
  const platsByUnit = new Map<string, Set<string>>()
  const ifoodApiUnits = new Set<string>()
  for (const p of (platRows ?? []) as {
    unit_id: string
    platform: string
    active: boolean
    api_store_id: string | null
  }[]) {
    if (p.active) {
      const set = platsByUnit.get(p.unit_id) ?? new Set<string>()
      set.add(p.platform)
      platsByUnit.set(p.unit_id, set)
    }
    if (p.platform === "ifood" && p.active && p.api_store_id)
      ifoodApiUnits.add(p.unit_id)
  }
  const nineApiUnits = new Set(
    ((nineRows ?? []) as { unit_id: string | null }[])
      .map((r) => r.unit_id)
      .filter((id): id is string => !!id),
  )
  const unitsFull: ClientUnitFull[] = (unitRows ?? [])
    .map((u) => ({
      id: u.id as string,
      name: u.name as string,
      code: (u.code as string) ?? null,
      cnpj: (u.cnpj as string) ?? null,
      city: (u.city as string) ?? null,
      state: (u.state as string) ?? null,
      active: !!u.active,
      brandName: brandName.get(u.brand_id as string) ?? null,
      platforms: PLAT_ORDER.filter((p) =>
        platsByUnit.get(u.id as string)?.has(p),
      ),
      ifoodApi: ifoodApiUnits.has(u.id as string),
      ninefoodApi: nineApiUnits.has(u.id as string),
    }))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))

  // 3) Usuários da conta (qualquer escopo que aponte pra ela)
  const { data: accessRows } = await admin
    .from("user_unit_access")
    .select("user_id, scope_type, scope_id, role")
  const unitToHolding = new Map<string, string>()
  for (const u of unitRows ?? []) unitToHolding.set(u.id as string, holdingId)
  const brandSet = new Set(brandIds)
  const userScope = new Map<
    string,
    { scope: "holding" | "brand" | "unit"; isAdmin: boolean }
  >()
  for (const a of accessRows ?? []) {
    if (!a.scope_id) continue
    const belongs =
      (a.scope_type === "holding" && a.scope_id === holdingId) ||
      (a.scope_type === "brand" && brandSet.has(a.scope_id)) ||
      (a.scope_type === "unit" && unitToHolding.has(a.scope_id))
    if (!belongs) continue
    const prev = userScope.get(a.user_id)
    const isAdmin = a.role === "admin" || prev?.isAdmin || false
    // holding > brand > unit — guarda o mais amplo
    const rank = { holding: 3, brand: 2, unit: 1 } as const
    const scope =
      !prev || rank[a.scope_type as "holding" | "brand" | "unit"] > rank[prev.scope]
        ? (a.scope_type as "holding" | "brand" | "unit")
        : prev.scope
    userScope.set(a.user_id, { scope, isAdmin })
  }

  // profiles (nome/perfil) + auth (email/whatsapp/último acesso)
  const userIds = [...userScope.keys()]
  const profileById = new Map<
    string,
    { full_name: string | null; perfil: string | null; lastSeen: string | null }
  >()
  if (userIds.length) {
    const { data: profs } = await admin
      .from("profiles")
      .select("user_id, full_name, perfil, last_seen_at")
      .in("user_id", userIds)
    for (const p of profs ?? [])
      profileById.set(p.user_id, {
        full_name: (p.full_name as string) ?? null,
        perfil: (p.perfil as string) ?? null,
        lastSeen: (p.last_seen_at as string) ?? null,
      })
  }
  const authById = new Map<
    string,
    { email: string | null; whatsapp: string | null; lastLogin: string | null }
  >()
  try {
    const { data: authList } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })
    for (const u of authList?.users ?? []) {
      const meta = (u.user_metadata ?? {}) as { whatsapp?: string | null }
      authById.set(u.id, {
        email: u.email ?? null,
        whatsapp: meta.whatsapp ?? null,
        lastLogin: u.last_sign_in_at ?? null,
      })
    }
  } catch {
    // sem auth admin → só nome/perfil
  }
  const usersList: ClientUser[] = userIds
    .map((uid) => {
      const scope = userScope.get(uid)!
      const prof = profileById.get(uid)
      const auth = authById.get(uid)
      // Último acesso = mais recente entre login (auth) e atividade (last_seen).
      const signIn = auth?.lastLogin ?? null
      const seen = prof?.lastSeen ?? null
      const lastLogin =
        signIn && seen ? (signIn > seen ? signIn : seen) : (signIn ?? seen)
      return {
        userId: uid,
        name: prof?.full_name ?? null,
        email: auth?.email ?? null,
        whatsapp: auth?.whatsapp ?? null,
        perfil: prof?.perfil ?? null,
        scope: scope.scope,
        isAdmin: scope.isAdmin,
        lastLogin,
      }
    })
    .sort(
      (a, b) =>
        Number(b.isAdmin) - Number(a.isAdmin) ||
        (b.lastLogin ?? "").localeCompare(a.lastLogin ?? ""),
    )

  // Contato principal = admin da conta (fallback: 1º usuário)
  const contact = usersList.find((u) => u.isAdmin) ?? usersList[0] ?? null

  // 4) Notas fiscais emitidas (Asaas)
  let invoices: ClientInvoice[] = []
  if (asaasCustomerId) {
    const raw: AsaasInvoice[] = await asaasListInvoices(asaasCustomerId)
    invoices = raw.map((n) => ({
      id: n.id,
      number: n.number ?? null,
      status: n.status ?? null,
      value: n.value != null ? Number(n.value) : null,
      effectiveDate: n.effectiveDate ?? null,
      pdfUrl: n.pdfUrl ?? null,
      xmlUrl: n.xmlUrl ?? null,
      serviceDescription: n.serviceDescription ?? null,
    }))
  }

  return {
    ...base,
    fiscal,
    fiscalPreenchido,
    fiscalFromAsaas,
    enderecoFmt,
    contactName: contact?.name ?? null,
    loginEmail: contact?.email ?? null,
    contactWhatsapp: contact?.whatsapp ?? null,
    usersList,
    unitsFull,
    asaasCustomerId,
    asaasSubscriptionId,
    invoices,
    faturas: await getFaturasDoCliente(holdingId),
    auditoria: await getAuditoriaDoCliente(holdingId),
    consumoIa: await getConsumoIaDoCliente(holdingId),
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Analytics da plataforma — tendências e distribuição (visão de dono).
// ─────────────────────────────────────────────────────────────────────────

export type PlanoBreak = {
  tier: "essencial" | "pro" | "ai" | "sem"
  label: string
  clientes: number
  mrr: number
}
export type PlatformAnalytics = {
  meses: { ym: string; label: string }[]
  receitaPorMes: number[]
  novosPorMes: number[]
  canceladosPorMes: number[]
  porPlano: PlanoBreak[]
  resumo: {
    mrr: number
    clientesAtivos: number
    pagantes: number
    trials: number
    arpa: number
    recebidoTotal: number
  }
}

const MES_ABREV = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
]

export async function getPlatformAnalytics(
  monthsBack = 6,
): Promise<PlatformAnalytics | null> {
  if (!(await isSuperadmin())) return null

  const { clients, totals } = await getClientsOverview()
  const admin = createAdminClient()

  // Janela dos últimos N meses (inclui o corrente).
  const now = new Date()
  const meses: { ym: string; label: string }[] = []
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    meses.push({ ym, label: MES_ABREV[d.getMonth()] })
  }
  const idx = new Map(meses.map((m, i) => [m.ym, i]))

  // Receita recebida por mês (pagamentos registrados).
  const receitaPorMes = new Array(meses.length).fill(0)
  const { data: pays } = await admin
    .from("holding_payments")
    .select("paid_on, amount")
  for (const p of pays ?? []) {
    const ym = String(p.paid_on ?? "").slice(0, 7)
    const i = idx.get(ym)
    if (i != null) receitaPorMes[i] += Number(p.amount) || 0
  }

  // Novos clientes por mês (created_at das holdings).
  const novosPorMes = new Array(meses.length).fill(0)
  for (const c of clients) {
    const i = idx.get((c.createdAt ?? "").slice(0, 7))
    if (i != null) novosPorMes[i] += 1
  }

  // Cancelados por mês (último evento do Asaas = cancelamento).
  const canceladosPorMes = new Array(meses.length).fill(0)
  for (const c of clients) {
    if (c.asaasLastEvent !== "SUBSCRIPTION_CANCELED") continue
    const i = idx.get((c.asaasLastEventAt ?? "").slice(0, 7))
    if (i != null) canceladosPorMes[i] += 1
  }

  // Distribuição por plano (clientes + MRR).
  const base: Record<PlanoBreak["tier"], PlanoBreak> = {
    essencial: { tier: "essencial", label: "Essencial", clientes: 0, mrr: 0 },
    pro: { tier: "pro", label: "Pro", clientes: 0, mrr: 0 },
    ai: { tier: "ai", label: "AI", clientes: 0, mrr: 0 },
    sem: { tier: "sem", label: "Sem plano", clientes: 0, mrr: 0 },
  }
  for (const c of clients) {
    const t = (c.planTier ?? "sem") as PlanoBreak["tier"]
    const b = base[t] ?? base.sem
    b.clientes += 1
    b.mrr += c.computedMonthly
  }
  const porPlano = [base.essencial, base.pro, base.ai, base.sem].filter(
    (p) => p.clientes > 0,
  )

  const pagantes = clients.filter((c) => c.billingStatus === "paid").length
  const trials = clients.filter((c) => c.billingStatus === "trial").length

  return {
    meses,
    receitaPorMes,
    novosPorMes,
    canceladosPorMes,
    porPlano,
    resumo: {
      mrr: totals.mrr,
      clientesAtivos: totals.clients,
      pagantes,
      trials,
      arpa: pagantes > 0 ? totals.mrr / pagantes : 0,
      recebidoTotal: receitaPorMes.reduce((s, v) => s + v, 0),
    },
  }
}
