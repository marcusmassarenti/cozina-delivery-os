/**
 * Webhook do 99Food — recebe eventos (pedidos / financeiro) da Plataforma
 * Aberta da 99 (https://delivery.cozinafoods.com/api/webhooks/99food).
 *
 * - GET:  verificação da URL. Algumas plataformas "pingam" pra validar o
 *         endereço; respondemos 200 e ecoamos um challenge se vier.
 * - POST: recebe o evento, grava cru (dedupe por event_id) e responde 200.
 *         Responder 200 É o acknowledgment — a 99 considera entregue e não
 *         reenvia. Gravar antes de processar evita perder evento.
 *
 * Segurança: webhook é endpoint público (a 99 precisa alcançar). Por ora
 * grava tudo e dá ack; a validação de assinatura/secret entra na homologação,
 * quando a 99 informar o esquema. A tabela tem RLS (só service_role escreve).
 */
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const str = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim()
  return s === "" ? null : s
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const challenge =
    url.searchParams.get("challenge") ??
    url.searchParams.get("echostr") ??
    url.searchParams.get("verify")
  if (challenge) return new Response(challenge, { status: 200 })
  return Response.json({ ok: true, webhook: "99food" })
}

export async function POST(req: Request) {
  let payload: Record<string, unknown> = {}
  try {
    payload = (await req.json()) as Record<string, unknown>
  } catch {
    // Alguns webhooks mandam form/texto em vez de JSON.
    const text = await req.text().catch(() => "")
    payload = text ? { raw: text } : {}
  }

  try {
    const eventId =
      str(payload.event_id) ??
      str(payload.eventId) ??
      str(payload.id) ??
      str(payload.messageId) ??
      str(payload.msgId)
    const eventType =
      str(payload.event_type) ??
      str(payload.eventType) ??
      str(payload.type) ??
      str(payload.event)
    const storeId =
      str(payload.store_id) ??
      str(payload.storeId) ??
      str(payload.merchant_id) ??
      str(payload.merchantId) ??
      str(payload.shopId)
    const orderId =
      str(payload.order_id) ??
      str(payload.orderId) ??
      str(payload.order_no) ??
      str(payload.orderNo)

    const admin = createAdminClient()
    const { error } = await admin.from("ninefood_webhook_events").insert({
      event_id: eventId,
      event_type: eventType,
      store_id: storeId,
      order_id: orderId,
      payload,
    })
    // 23505 = unique_violation → evento duplicado (dedupe). Não é erro real.
    if (error && error.code !== "23505") {
      console.error("99food webhook: falha ao gravar evento:", error.message)
    }
  } catch (e) {
    // Mesmo se a gravação falhar, respondemos 200 pra não entrar em loop de
    // reenvio; o erro fica no log pra investigar.
    console.error("99food webhook: erro inesperado:", e)
  }

  return Response.json({ ok: true })
}
