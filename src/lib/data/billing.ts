import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId, isSuperadmin } from "@/lib/auth/permissions"

export type BillingStatus =
  | "trial"
  | "paid"
  | "pending"
  | "overdue"
  | "suspended"
  | "none"

export type HoldingBilling = {
  paymentMethod: string | null
  monthlyFee: number | null
  dueDate: string | null
  paid: boolean
  suspendOn: string | null
  /** Fim do teste grátis (YYYY-MM-DD). NULL = sem trial. */
  trialEndsAt: string | null
}

/** Hoje em America/Sao_Paulo, formato YYYY-MM-DD (pra comparar com date). */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/** Dias entre hoje e uma data YYYY-MM-DD (positivo = no futuro). */
export function daysUntil(dateISO: string, today = todayISO()): number {
  const a = new Date(`${today}T00:00:00-03:00`).getTime()
  const b = new Date(`${dateISO}T00:00:00-03:00`).getTime()
  return Math.round((b - a) / 86_400_000)
}

export const TRIAL_DAYS = 7

/** Soma dias a uma data YYYY-MM-DD (fuso SP) e devolve YYYY-MM-DD. */
function addDaysToDate(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00-03:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Fim EFETIVO do teste grátis: ANCORADO na data do cadastro
 * (createdAt + TRIAL_DAYS) e nunca além disso. Assim o trial não pode ser
 * estendido nem reiniciado — cancelar a assinatura NÃO renova o teste (evita
 * burlar: assinar → cancelar → ganhar 7 dias de novo). `createdAt` pode vir
 * como timestamp ou date; usamos só a parte da data.
 */
export function effectiveTrialEnd(
  trialEndsAt: string | null,
  createdAt: string | null | undefined,
): string | null {
  if (!trialEndsAt) return null
  if (!createdAt) return trialEndsAt
  const cap = addDaysToDate(createdAt.slice(0, 10), TRIAL_DAYS)
  return trialEndsAt < cap ? trialEndsAt : cap
}

/** Status de cobrança a partir dos campos + a data de hoje. */
export function computeBillingStatus(
  b: HoldingBilling,
  today = todayISO(),
): BillingStatus {
  if (b.paid) return "paid"
  // Teste grátis: dentro do prazo libera; vencido e sem pagar → suspende.
  if (b.trialEndsAt) {
    return today <= b.trialEndsAt ? "trial" : "suspended"
  }
  if (b.suspendOn && today >= b.suspendOn) return "suspended"
  if (b.dueDate && today > b.dueDate) return "overdue"
  if (b.dueDate) return "pending"
  return "none"
}

/**
 * Status de cobrança da empresa (holding) do usuário logado — usado pro
 * bloqueio de acesso e pro aviso de atraso. Fail-safe: se a coluna não existir
 * ou não der pra resolver, devolve null (não bloqueia).
 */
export async function getCurrentHoldingBilling(): Promise<{
  status: BillingStatus
  dueDate: string | null
  suspendOn: string | null
  trialEndsAt: string | null
  planTier: string | null
} | null> {
  try {
    const holdingId = await getCurrentHoldingId()
    if (!holdingId) return null
    const admin = createAdminClient()
    const { data } = await admin
      .from("holdings")
      .select(
        "created_at, payment_method, monthly_fee, due_date, paid, suspend_on, trial_ends_at, plan_tier",
      )
      .eq("id", holdingId)
      .maybeSingle()
    if (!data) return null
    const b: HoldingBilling = {
      paymentMethod: (data.payment_method as string | null) ?? null,
      monthlyFee:
        data.monthly_fee != null ? Number(data.monthly_fee) : null,
      dueDate: (data.due_date as string | null) ?? null,
      paid: (data.paid as boolean | null) ?? true,
      suspendOn: (data.suspend_on as string | null) ?? null,
      // Trial ANCORADO no cadastro (não renova ao cancelar).
      trialEndsAt: effectiveTrialEnd(
        (data.trial_ends_at as string | null) ?? null,
        (data.created_at as string | null) ?? null,
      ),
    }
    return {
      status: computeBillingStatus(b),
      dueDate: b.dueDate,
      suspendOn: b.suspendOn,
      trialEndsAt: b.trialEndsAt,
      planTier: (data.plan_tier as string | null) ?? null,
    }
  } catch {
    return null
  }
}

/**
 * Hierarquia dos planos self-service. Cada tier é superset do anterior:
 * essencial (delivery) < pro (+ financeiro) < ai (+ DeliveryOS AI).
 */
const PLAN_RANK: Record<string, number> = { essencial: 0, pro: 1, ai: 2 }
function planRank(tier: string | null): number {
  return PLAN_RANK[tier ?? "essencial"] ?? 0
}

/**
 * True quando a conta tem acesso aos módulos Pro (Fluxo de Caixa etc.).
 * Super-admin (dono do SaaS) sempre; no teste grátis tudo é liberado; fora do
 * trial vale o plano EFETIVAMENTE PAGO (plan_tier), do Pro pra cima.
 */
export async function isProPlan(): Promise<boolean> {
  if (await isSuperadmin()) return true
  const b = await getCurrentHoldingBilling()
  if (!b) return false
  if (b.status === "trial") return true
  return planRank(b.planTier) >= PLAN_RANK.pro
}

/**
 * True quando a conta tem o DeliveryOS AI (diagnóstico + plano de ação por IA).
 * Super-admin sempre; teste grátis libera; fora do trial só o tier "ai" pago.
 */
export async function isAiPlan(): Promise<boolean> {
  if (await isSuperadmin()) return true
  const b = await getCurrentHoldingBilling()
  if (!b) return false
  if (b.status === "trial") return true
  return planRank(b.planTier) >= PLAN_RANK.ai
}
