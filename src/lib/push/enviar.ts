/**
 * Envio de push para os dispositivos de um usuário.
 *
 * Sem as chaves VAPID no ambiente isto vira no-op registrado — o sistema segue
 * funcionando e o log diz que está montado mas parado. Mesma escolha do
 * `enviarEmail`: notificação que derruba um cron é pior que notificação não
 * enviada.
 */
import "server-only"

import webpush from "web-push"

import { createAdminClient } from "@/lib/supabase/admin"

const PUB = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const PRIV = process.env.VAPID_PRIVATE_KEY
const CONTATO = process.env.VAPID_SUBJECT ?? "mailto:suporte@deliveryos.food"

let configurado = false
function configurar(): boolean {
  if (!PUB || !PRIV) return false
  if (!configurado) {
    webpush.setVapidDetails(CONTATO, PUB, PRIV)
    configurado = true
  }
  return true
}

export type PushPayload = {
  titulo: string
  corpo: string
  /** Pra onde o clique leva. Default: /inicio */
  url?: string
  /** Notificação do mesmo `tag` substitui a anterior em vez de empilhar. */
  tag?: string
}

export type ResultadoPush = {
  enviados: number
  invalidadas: number
  semChave?: boolean
}

export async function enviarPush(
  userIds: string[],
  payload: PushPayload,
): Promise<ResultadoPush> {
  if (userIds.length === 0) return { enviados: 0, invalidadas: 0 }
  if (!configurar()) {
    console.warn("push: VAPID ausente — nada enviado")
    return { enviados: 0, invalidadas: 0, semChave: true }
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", userIds)
    .is("invalid_since", null)

  const assinaturas = (data ?? []) as {
    id: string
    endpoint: string
    p256dh: string
    auth: string
  }[]
  if (assinaturas.length === 0) return { enviados: 0, invalidadas: 0 }

  const corpo = JSON.stringify(payload)
  let enviados = 0
  const mortas: { id: string; motivo: string }[] = []

  await Promise.all(
    assinaturas.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          corpo,
        )
        enviados++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        // 404/410 = o navegador diz que essa assinatura não existe mais (app
        // desinstalado, permissão revogada). Insistir nela é queimar cota e
        // poluir log pra sempre.
        if (status === 404 || status === 410) {
          mortas.push({ id: s.id, motivo: `HTTP ${status}` })
        } else {
          console.error("push: falha", status, (e as Error).message)
        }
      }
    }),
  )

  for (const m of mortas) {
    await admin
      .from("push_subscriptions")
      .update({ invalid_since: new Date().toISOString(), invalid_reason: m.motivo })
      .eq("id", m.id)
  }

  if (enviados > 0) {
    await admin
      .from("push_subscriptions")
      .update({ last_sent_at: new Date().toISOString() })
      .in(
        "id",
        assinaturas.filter((s) => !mortas.some((m) => m.id === s.id)).map((s) => s.id),
      )
  }

  return { enviados, invalidadas: mortas.length }
}
