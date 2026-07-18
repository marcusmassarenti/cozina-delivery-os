import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import {
  computeBillingStatus,
  daysUntil,
  effectiveTrialEnd,
  type BillingStatus,
} from "@/lib/data/billing"
import { valorCobranca, type BillingCycle } from "@/lib/pricing"

/**
 * Preço da assinatura self-service — POR LOJA, em três planos (bate com a
 * landing): Essencial, Pro e DeliveryOS AI. Mensalidade = preço-por-loja ×
 * nº de lojas ativas.
 *
 * Clientes que o DONO cobra na mão (holdings.monthly_fee preenchido) seguem
 * pela conta antiga (base + lojas extras) e não escolhem plano.
 */
export type PlanId = "essencial" | "pro" | "ai"

export const PLANOS_META: Record<PlanId, { label: string; desc: string }> = {
  essencial: { label: "Essencial", desc: "Pra ver seu lucro no delivery" },
  pro: { label: "Pro", desc: "Gestão financeira completa" },
  ai: { label: "DeliveryOS AI", desc: "IA que lê a loja e monta o plano de ação" },
}

/** Preços por loja/mês — fallback caso a tabela ainda não exista. */
export const PRECO_PADRAO: Record<PlanId, number> = {
  essencial: 49,
  pro: 99,
  ai: 159,
}

export type PrecosPlano = Record<PlanId, number>

/** Preços por loja dos planos (editáveis pelo dono em /plataforma). */
export async function getDefaultPlan(): Promise<PrecosPlano> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from("platform_settings")
      .select("essencial_per_unit, pro_per_unit, ai_per_unit")
      .eq("id", 1)
      .maybeSingle()
    if (!data) return PRECO_PADRAO
    return {
      essencial: Number(data.essencial_per_unit),
      pro: Number(data.pro_per_unit),
      // Coluna ai_per_unit é nova — fallback pro padrão se ainda não existir.
      ai: data.ai_per_unit != null ? Number(data.ai_per_unit) : PRECO_PADRAO.ai,
    }
  } catch {
    return PRECO_PADRAO
  }
}

/** Mensalidade de um plano = preço-por-loja × lojas (mínimo 1 loja). */
export function precoDoPlano(
  precos: PrecosPlano,
  plan: PlanId,
  activeUnits: number,
): number {
  return precos[plan] * Math.max(1, activeUnits)
}

export type PlanoOption = {
  id: PlanId
  label: string
  desc: string
  perUnit: number
  total: number
}

export type PlanoAtual = {
  holdingId: string
  name: string
  status: BillingStatus
  trialEndsAt: string | null
  activeUnits: number
  /** Preço custom definido pelo dono? (então ignora os planos por loja) */
  precoCustom: boolean
  /** Planos por loja disponíveis (self-service). */
  planos: PlanoOption[]
  /** Plano já escolhido pela empresa (null = ainda não escolheu). */
  selectedPlan: PlanId | null
  /** Valor mensal a cobrar agora (custom, ou plano selecionado/Essencial). */
  mensalidade: number
  /** Nome do plano escolhido (ex.: "Essencial"), se houver. */
  planLabel: string | null
  dueDate: string | null
  paymentMethod: string | null
  customerId: string | null
  subscriptionId: string | null
  /** Histórico de pagamentos da empresa (mais recentes primeiro). */
  payments: { paidOn: string; amount: number; method: string | null }[]
}

export async function getPlanoAtual(): Promise<PlanoAtual | null> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return null

  const admin = createAdminClient()
  const { data: h } = await admin
    .from("holdings")
    .select(
      "id, name, created_at, monthly_fee, price_per_unit, included_units, plan_tier, pending_plan_tier, due_date, paid, suspend_on, trial_ends_at, payment_method, asaas_customer_id, asaas_subscription_id",
    )
    .eq("id", holdingId)
    .maybeSingle()
  if (!h) return null

  // Lojas ativas da holding (base do cálculo por loja).
  const { data: brands } = await admin
    .from("brands")
    .select("id")
    .eq("holding_id", holdingId)
  const brandIds = (brands ?? []).map((b) => b.id)
  let activeUnits = 0
  if (brandIds.length) {
    const { count } = await admin
      .from("units")
      .select("id", { count: "exact", head: true })
      .in("brand_id", brandIds)
      .eq("active", true)
    activeUnits = count ?? 0
  }

  const precos = await getDefaultPlan()
  const planos: PlanoOption[] = (Object.keys(PLANOS_META) as PlanId[]).map(
    (id) => ({
      id,
      label: PLANOS_META[id].label,
      desc: PLANOS_META[id].desc,
      perUnit: precos[id],
      total: precoDoPlano(precos, id, activeUnits),
    }),
  )

  const precoCustom = h.monthly_fee != null
  // Plano PAGO (plan_tier) tem prioridade; se ainda não pagou, mostra o
  // escolhido/pendente (pra exibição e cálculo do valor). O que LIBERA as
  // features é só o plan_tier (ver isProPlan/isAiPlan).
  const selectedPlan =
    ((h.plan_tier as PlanId | null) ??
      (h.pending_plan_tier as PlanId | null)) ??
    null

  let mensalidade: number
  if (precoCustom) {
    // Cliente cobrado na mão: base + lojas extras (conta antiga).
    const includedUnits = (h.included_units as number | null) ?? 1
    const pricePerUnit = Number(h.price_per_unit ?? 0)
    const extraUnits = Math.max(0, activeUnits - includedUnits)
    mensalidade = Number(h.monthly_fee) + extraUnits * pricePerUnit
  } else {
    mensalidade = precoDoPlano(precos, selectedPlan ?? "essencial", activeUnits)
  }

  // Trial ANCORADO no cadastro (createdAt + 7): não renova ao cancelar.
  const trialEndsAt = effectiveTrialEnd(
    (h.trial_ends_at as string | null) ?? null,
    (h.created_at as string | null) ?? null,
  )
  const status = computeBillingStatus({
    paymentMethod: (h.payment_method as string | null) ?? null,
    monthlyFee: h.monthly_fee != null ? Number(h.monthly_fee) : null,
    dueDate: (h.due_date as string | null) ?? null,
    paid: (h.paid as boolean | null) ?? true,
    suspendOn: (h.suspend_on as string | null) ?? null,
    trialEndsAt,
  })

  // Histórico de pagamentos da empresa (últimos 12).
  const { data: pagamentos } = await admin
    .from("holding_payments")
    .select("paid_on, amount, method")
    .eq("holding_id", holdingId)
    .order("paid_on", { ascending: false })
    .limit(12)
  const payments = (pagamentos ?? []).map((p) => ({
    paidOn: p.paid_on as string,
    amount: Number(p.amount),
    method: (p.method as string | null) ?? null,
  }))

  const planLabel = selectedPlan
    ? PLANOS_META[selectedPlan].label
    : precoCustom
      ? "Personalizado"
      : null

  return {
    holdingId,
    name: h.name,
    status,
    trialEndsAt,
    activeUnits,
    precoCustom,
    planos,
    selectedPlan,
    mensalidade,
    planLabel,
    dueDate: (h.due_date as string | null) ?? null,
    paymentMethod: (h.payment_method as string | null) ?? null,
    customerId: (h.asaas_customer_id as string | null) ?? null,
    subscriptionId: (h.asaas_subscription_id as string | null) ?? null,
    payments,
  }
}

/* ─────────────────────────── UPGRADE DE PLANO ──────────────────────────── */

/** Conta as lojas ativas de uma holding (base do preço por loja). */
async function contarLojasAtivas(holdingId: string): Promise<number> {
  const admin = createAdminClient()
  const { data: brands } = await admin
    .from("brands")
    .select("id")
    .eq("holding_id", holdingId)
  const brandIds = (brands ?? []).map((b) => b.id)
  if (!brandIds.length) return 0
  const { count } = await admin
    .from("units")
    .select("id", { count: "exact", head: true })
    .in("brand_id", brandIds)
    .eq("active", true)
  return count ?? 0
}

/** Valor recorrente (por ciclo) de um plano pra uma holding — respeita o
 *  ciclo (mensal +30% / anual ×12) e o nº de lojas. Usado pela ação de upgrade
 *  e pelo webhook (pra atualizar o valor da assinatura no Asaas). */
export async function valorAssinaturaDoPlano(
  holdingId: string,
  plan: PlanId,
): Promise<number> {
  const admin = createAdminClient()
  const { data: h } = await admin
    .from("holdings")
    .select("billing_cycle")
    .eq("id", holdingId)
    .maybeSingle()
  const cycle: BillingCycle =
    (h?.billing_cycle as BillingCycle | null) ?? "anual"
  const units = await contarLojasAtivas(holdingId)
  const precos = await getDefaultPlan()
  return valorCobranca(precoDoPlano(precos, plan, units), cycle)
}

export type UpgradeAiInfo = {
  /** Pode fazer o upgrade self-service? */
  podeUpgrade: boolean
  motivo: null | "sem-assinatura" | "ja-ai" | "custom"
  planoAtualLabel: string
  units: number
  aiPerUnit: number
  /** Novo valor recorrente (por ciclo) já com o plano AI. */
  aiValorCiclo: number
  cycle: BillingCycle
  /** Diferença proporcional a cobrar AGORA (dias restantes até renovar). */
  proracaoAgora: number
  dueDate: string | null
}

/** Monta os números do upgrade pro plano AI (exibição + base da cobrança). */
export async function getUpgradeAiInfo(): Promise<UpgradeAiInfo | null> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return null
  const admin = createAdminClient()
  const { data: h } = await admin
    .from("holdings")
    .select("monthly_fee, plan_tier, billing_cycle, due_date, asaas_subscription_id")
    .eq("id", holdingId)
    .maybeSingle()
  if (!h) return null

  const cycle: BillingCycle =
    (h.billing_cycle as BillingCycle | null) ?? "anual"
  const tierAtual = (h.plan_tier as PlanId | null) ?? "essencial"
  const dueDate = (h.due_date as string | null) ?? null
  const units = await contarLojasAtivas(holdingId)
  const precos = await getDefaultPlan()

  const aiValorCiclo = valorCobranca(precoDoPlano(precos, "ai", units), cycle)
  const atualValorCiclo = valorCobranca(
    precoDoPlano(precos, tierAtual, units),
    cycle,
  )

  // Proração: diferença por ciclo × (dias restantes / dias do ciclo).
  const cycleDays = cycle === "anual" ? 365 : 30
  const restantes = dueDate
    ? Math.max(0, Math.min(cycleDays, daysUntil(dueDate)))
    : cycleDays
  const diff = Math.max(0, aiValorCiclo - atualValorCiclo)
  const proracaoAgora = Math.round(diff * (restantes / cycleDays) * 100) / 100

  let motivo: UpgradeAiInfo["motivo"] = null
  if (h.monthly_fee != null) motivo = "custom"
  else if (!h.asaas_subscription_id) motivo = "sem-assinatura"
  else if (tierAtual === "ai") motivo = "ja-ai"

  return {
    podeUpgrade: motivo === null,
    motivo,
    planoAtualLabel: PLANOS_META[tierAtual].label,
    units,
    aiPerUnit: precos.ai,
    aiValorCiclo,
    cycle,
    proracaoAgora,
    dueDate,
  }
}
