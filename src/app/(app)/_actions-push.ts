"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"

export type PushState = { ok: boolean; message?: string }

/**
 * Guarda a assinatura de push do dispositivo atual.
 *
 * A chave é o ENDPOINT, não o usuário: a mesma pessoa instala no celular e no
 * tablet, e cada instalação recebe seu próprio endereço. Upsert por endpoint
 * também torna a operação idempotente — reabrir o app não cria linha nova.
 */
export async function salvarAssinaturaPush(
  sub: { endpoint: string; p256dh: string; auth: string; userAgent?: string },
): Promise<PushState> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) return { ok: false, message: "Faça login pra ativar os avisos." }

  if (!sub.endpoint || !sub.p256dh || !sub.auth) {
    return { ok: false, message: "Assinatura incompleta." }
  }

  const { error } = await createAdminClient()
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        holding_id: await getCurrentHoldingId(),
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        user_agent: sub.userAgent ?? null,
        // Reassinar limpa a marca de morta: é o mesmo aparelho voltando.
        invalid_since: null,
        invalid_reason: null,
      },
      { onConflict: "endpoint" },
    )
  if (error) return { ok: false, message: error.message }
  return { ok: true, message: "Avisos ativados neste aparelho." }
}

/** Desliga os avisos deste aparelho (não mexe nos outros da pessoa). */
export async function removerAssinaturaPush(endpoint: string): Promise<PushState> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user?.id) return { ok: false }
  await createAdminClient()
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", auth.user.id)
  return { ok: true, message: "Avisos desligados neste aparelho." }
}
