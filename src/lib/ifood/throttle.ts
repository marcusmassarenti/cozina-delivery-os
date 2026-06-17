/**
 * Throttle por (merchant_id, endpoint) — gate de 6h pras chamadas iFood.
 *
 * Requisito da homologação: o app não pode chamar o mesmo endpoint do mesmo
 * merchant repetidamente. A regra geral é 1 chamada / 6h por (merchant, endpoint).
 * Eventos diários (Reconciliation D-1) usam 1×/dia (24h).
 *
 * Uso típico:
 *   const gate = await checkThrottle(merchantId, "GET financialEvents", 6)
 *   if (!gate.ok) return { skipped: true, reason: gate.reason }
 *   ...chama o iFood...
 *   await recordCall(merchantId, "GET financialEvents", res.status)
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export type ThrottleGate =
  | { ok: true; lastCalledAt: null }
  | { ok: true; lastCalledAt: string }
  | { ok: false; reason: string; nextAllowedAt: string }

/**
 * Verifica se já passou `windowHours` desde a última chamada deste endpoint
 * pro merchant. Não bloqueia — só devolve `ok: false` com a janela; cabe ao
 * caller decidir abortar ou seguir mesmo assim (ex.: força manual no painel).
 */
export async function checkThrottle(
  merchantId: string,
  endpoint: string,
  windowHours = 6,
): Promise<ThrottleGate> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("ifood_api_throttle")
    .select("last_called_at")
    .eq("merchant_id", merchantId)
    .eq("endpoint", endpoint)
    .maybeSingle()

  if (!data) return { ok: true, lastCalledAt: null }

  const last = new Date(data.last_called_at as string)
  const nextAllowed = new Date(last.getTime() + windowHours * 3600 * 1000)
  if (Date.now() < nextAllowed.getTime()) {
    return {
      ok: false,
      reason: `Throttle ativo: chamado há menos de ${windowHours}h (${last.toISOString()})`,
      nextAllowedAt: nextAllowed.toISOString(),
    }
  }
  return { ok: true, lastCalledAt: data.last_called_at as string }
}

/** Registra/atualiza a última chamada — chamar APÓS o request, com sucesso ou erro. */
export async function recordCall(
  merchantId: string,
  endpoint: string,
  status?: number,
  payload?: unknown,
): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from("ifood_api_throttle")
    .upsert(
      {
        merchant_id: merchantId,
        endpoint,
        last_called_at: new Date().toISOString(),
        last_status: status ?? null,
        last_payload: (payload as object) ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "merchant_id,endpoint" },
    )
}
