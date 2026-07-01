import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import { computeBillingStatus, type BillingStatus } from "@/lib/data/billing"

/**
 * Plano do cliente (holding) logado, pro fluxo de assinatura self-service.
 *
 * O preço vem de DUAS fontes, nesta ordem:
 *  1) Se o dono já definiu um preço custom pra empresa (holdings.monthly_fee),
 *     usamos ele + lojas extras (mesma conta do /plataforma).
 *  2) Senão, cai no PLANO_PADRAO abaixo (preço público do self-service).
 */
export const PLANO_PADRAO = {
  /** Mensalidade base (inclui a 1ª loja). Ajuste aqui o preço público. */
  mensalidade: 197,
  lojasInclusas: 1,
  /** Valor por loja além da inclusa. */
  porLojaExtra: 97,
}

export type PlanoAtual = {
  holdingId: string
  name: string
  status: BillingStatus
  trialEndsAt: string | null
  /** Valor a cobrar por mês (base + lojas extras). */
  mensalidade: number
  lojasInclusas: number
  porLojaExtra: number
  activeUnits: number
  extraUnits: number
  /** Preço custom definido pelo dono? (senão, PLANO_PADRAO) */
  precoCustom: boolean
  customerId: string | null
  subscriptionId: string | null
}

export async function getPlanoAtual(): Promise<PlanoAtual | null> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return null

  const admin = createAdminClient()
  const { data: h } = await admin
    .from("holdings")
    .select(
      "id, name, monthly_fee, price_per_unit, included_units, due_date, paid, suspend_on, trial_ends_at, payment_method, asaas_customer_id, asaas_subscription_id",
    )
    .eq("id", holdingId)
    .maybeSingle()
  if (!h) return null

  // Lojas ativas da holding (base do cálculo de lojas extras).
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

  const precoCustom = h.monthly_fee != null
  const lojasInclusas = precoCustom
    ? (h.included_units ?? 1)
    : PLANO_PADRAO.lojasInclusas
  const porLojaExtra = precoCustom
    ? Number(h.price_per_unit ?? 0)
    : PLANO_PADRAO.porLojaExtra
  const base = precoCustom ? Number(h.monthly_fee) : PLANO_PADRAO.mensalidade
  const extraUnits = Math.max(0, activeUnits - lojasInclusas)
  const mensalidade = base + extraUnits * porLojaExtra

  const status = computeBillingStatus({
    paymentMethod: (h.payment_method as string | null) ?? null,
    monthlyFee: h.monthly_fee != null ? Number(h.monthly_fee) : null,
    dueDate: (h.due_date as string | null) ?? null,
    paid: (h.paid as boolean | null) ?? true,
    suspendOn: (h.suspend_on as string | null) ?? null,
    trialEndsAt: (h.trial_ends_at as string | null) ?? null,
  })

  return {
    holdingId,
    name: h.name,
    status,
    trialEndsAt: (h.trial_ends_at as string | null) ?? null,
    mensalidade,
    lojasInclusas,
    porLojaExtra,
    activeUnits,
    extraUnits,
    precoCustom,
    customerId: (h.asaas_customer_id as string | null) ?? null,
    subscriptionId: (h.asaas_subscription_id as string | null) ?? null,
  }
}
