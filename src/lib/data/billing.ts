import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"

export type BillingStatus = "paid" | "pending" | "overdue" | "suspended" | "none"

export type HoldingBilling = {
  paymentMethod: string | null
  monthlyFee: number | null
  dueDate: string | null
  paid: boolean
  suspendOn: string | null
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

/** Status de cobrança a partir dos campos + a data de hoje. */
export function computeBillingStatus(
  b: HoldingBilling,
  today = todayISO(),
): BillingStatus {
  if (b.paid) return "paid"
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
} | null> {
  try {
    const holdingId = await getCurrentHoldingId()
    if (!holdingId) return null
    const admin = createAdminClient()
    const { data } = await admin
      .from("holdings")
      .select("payment_method, monthly_fee, due_date, paid, suspend_on")
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
    }
    return {
      status: computeBillingStatus(b),
      dueDate: b.dueDate,
      suspendOn: b.suspendOn,
    }
  } catch {
    return null
  }
}
