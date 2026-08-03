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
 * Segurança: webhook é endpoint público (a 99 precisa alcançar). Proteção
 * opcional por token compartilhado: se NINEFOOD_WEBHOOK_SECRET estiver setado,
 * exigimos ?token=<secret> (ou header x-webhook-token) — configure o mesmo
 * valor na URL do webhook no portal da 99. Sem o secret setado, mantém o
 * comportamento antigo (aceita e loga aviso), pra não quebrar a homologação.
 * Também limita o tamanho do payload. A tabela tem RLS (só service_role escreve).
 */
import { timingSafeEqual } from "node:crypto"

import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Limite do corpo do webhook (evita poluir o banco com payload gigante). */
const MAX_BODY_BYTES = 256 * 1024

const str = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim()
  return s === "" ? null : s
}

/** Compara segredo em tempo constante. */
function secretOk(expected: string, got: string | null): boolean {
  if (!got) return false
  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
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

/**
 * Envolve em aspas todo inteiro com 16+ dígitos ANTES do JSON.parse.
 *
 * O `order_id` do 99 tem 19 dígitos e vem no JSON como número, sem aspas.
 * `JSON.parse` transforma isso em double, que só guarda 15–16 dígitos com
 * exatidão — e o resto vira zero. O pedido 5764677071083212473 virava
 * 5764677071083213000, e a corrupção era gravada assim no banco.
 *
 * Não dava pra consertar depois: quando o valor chega no código já é o número
 * arredondado, e `String()` só formata o estrago. Tem que ser no texto cru.
 *
 * Custou caro: 4.663 pedidos (100% dos que entraram por webhook) ficaram com
 * id inválido, e a chave `unit_id + pedido_id` é a trava de duplicidade —
 * dois pedidos diferentes cujo id arredondado coincidisse virariam um só.
 */
function protegerIdsLongos(texto: string): string {
  return texto.replace(/:(\s*)(-?\d{16,})(\s*[,}\]])/g, ':$1"$2"$3')
}

export async function POST(req: Request) {
  // Proteção PROGRESSIVA (webhook de ALTO volume, ~33k eventos/mês): enquanto
  // NINEFOOD_WEBHOOK_SECRET não estiver setado, aceita (pra não derrubar a
  // conexão viva da 99). Assim que o secret for setado na Vercel E no ?token=
  // da URL no portal da 99, passa a EXIGIR — sem downtime. Ver docs/segurança.
  const secret = process.env.NINEFOOD_WEBHOOK_SECRET
  if (secret) {
    const url = new URL(req.url)
    const got =
      url.searchParams.get("token") ?? req.headers.get("x-webhook-token")
    if (!secretOk(secret, got)) {
      return new Response("unauthorized", { status: 401 })
    }
  } else {
    console.warn(
      "99food webhook: sem NINEFOOD_WEBHOOK_SECRET — endpoint aberto. Defina o secret (Vercel + ?token= na URL da 99) pra travar.",
    )
  }

  // Limite de tamanho do corpo.
  const raw = await req.text().catch(() => "")
  if (raw.length > MAX_BODY_BYTES) {
    return new Response("payload too large", { status: 413 })
  }

  let payload: Record<string, unknown> = {}
  try {
    payload = raw ? (JSON.parse(protegerIdsLongos(raw)) as Record<string, unknown>) : {}
  } catch {
    // Alguns webhooks mandam form/texto em vez de JSON.
    payload = raw ? { raw } : {}
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
