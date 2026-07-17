/**
 * Webhook do Asaas — recebe os eventos de cobrança da assinatura e sincroniza
 * o status de pagamento da holding (libera / bloqueia o acesso).
 *
 * Segurança (FAIL-CLOSED): exigimos SEMPRE que o Asaas envie o header
 * `asaas-access-token` igual ao ASAAS_WEBHOOK_TOKEN (configurado no painel do
 * Asaas). Se o segredo não estiver setado no ambiente, RECUSAMOS o webhook
 * (500) em vez de aceitar tudo — caso contrário qualquer um poderia forjar um
 * "pagamento confirmado" e liberar plano de graça. Comparação timing-safe.
 * Eventos válidos são respondidos com 200 pra não entrar em loop de reenvio.
 *
 * Eventos que importam:
 *  - PAGO (confirmado/recebido) → paid=true, encerra o trial, limpa suspensão.
 *  - VENCIDO (overdue)          → paid=false, agenda suspensão (vencimento + 7).
 *  - ESTORNADO/removido         → paid=false.
 */
import { timingSafeEqual } from "node:crypto"

import { createAdminClient } from "@/lib/supabase/admin"

/** Comparação de segredo em tempo constante (evita timing attack). */
function tokenOk(expected: string, got: string | null): boolean {
  if (!got) return false
  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CONFIRMADO = new Set([
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_RECEIVED_IN_CASH",
])
const VENCIDO = new Set(["PAYMENT_OVERDUE"])
const ESTORNADO = new Set([
  "PAYMENT_REFUNDED",
  "PAYMENT_DELETED",
  "PAYMENT_REVERSED",
  "PAYMENT_CHARGEBACK_REQUESTED",
])

/** Soma dias a uma data YYYY-MM-DD (fuso SP) e devolve YYYY-MM-DD. */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00-03:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

type AsaasPayment = {
  id?: string
  customer?: string
  subscription?: string
  value?: number
  dueDate?: string
  paymentDate?: string
  confirmedDate?: string
  billingType?: string
  status?: string
  /** "ia-pack:<holdingId>" marca a compra de pacote do Consultor IA. */
  externalReference?: string
}

export async function GET() {
  return Response.json({ ok: true, webhook: "asaas" })
}

export async function POST(req: Request) {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN
  if (!expected) {
    // Fail-closed: sem segredo configurado, não processamos nada. O Asaas
    // reenvia; assim que a env var entrar na Vercel, os eventos são aplicados.
    console.error(
      "asaas webhook: ASAAS_WEBHOOK_TOKEN ausente — recusando (fail-closed)",
    )
    return new Response("webhook misconfigured", { status: 500 })
  }
  if (!tokenOk(expected, req.headers.get("asaas-access-token"))) {
    return new Response("unauthorized", { status: 401 })
  }

  let body: { id?: string; event?: string; payment?: AsaasPayment } = {}
  try {
    body = (await req.json()) as typeof body
  } catch {
    return Response.json({ ok: true })
  }

  const event = String(body.event ?? "")
  const payment = body.payment ?? {}
  // Chave única do evento (id do envelope do Asaas; senão evento+cobrança).
  const eventKey = body.id
    ? `evt:${body.id}`
    : payment.id
      ? `${event}:${payment.id}`
      : ""
  const subscriptionId = payment.subscription ? String(payment.subscription) : null
  const customerId = payment.customer ? String(payment.customer) : null

  try {
    const admin = createAdminClient()

    // Acha a holding pela assinatura (ou, no pior caso, pelo cliente).
    let holdingId: string | null = null
    let pendingPlanTier: string | null = null
    if (subscriptionId) {
      const { data } = await admin
        .from("holdings")
        .select("id, pending_plan_tier")
        .eq("asaas_subscription_id", subscriptionId)
        .maybeSingle()
      holdingId = data?.id ?? null
      pendingPlanTier = (data?.pending_plan_tier as string | null) ?? null
    }
    if (!holdingId && customerId) {
      const { data } = await admin
        .from("holdings")
        .select("id, pending_plan_tier")
        .eq("asaas_customer_id", customerId)
        .maybeSingle()
      holdingId = data?.id ?? null
      pendingPlanTier = (data?.pending_plan_tier as string | null) ?? null
    }
    if (!holdingId) {
      console.warn("asaas webhook: holding não encontrada", {
        event,
        subscriptionId,
        customerId,
      })
      return Response.json({ ok: true })
    }

    // Idempotência / anti-replay: registra o evento ANTES de aplicar. Se já
    // existe (reenvio do Asaas ou replay de evento antigo), não reaplica.
    // O insert com onConflict é atômico (PK), então não há corrida.
    if (eventKey) {
      const { data: inserted, error: insErr } = await admin
        .from("asaas_processed_events")
        .upsert(
          { event_key: eventKey, event, holding_id: holdingId },
          { onConflict: "event_key", ignoreDuplicates: true },
        )
        .select("event_key")
      if (!insErr && (!inserted || inserted.length === 0)) {
        return Response.json({ ok: true, deduped: true })
      }
    }

    // ── Compra de PACOTE do Consultor IA (cobrança avulsa, não assinatura) ──
    // Marcada por externalReference "ia-pack:<holdingId>". Não mexe em
    // paid/plan_tier — só credita as perguntas quando confirma.
    const extRef = String(payment.externalReference ?? "")
    if (extRef.startsWith("ia-pack:")) {
      if (CONFIRMADO.has(event)) {
        const { data: cfg } = await admin
          .from("platform_settings")
          .select("ia_pack_size")
          .maybeSingle()
        const qtd = cfg?.ia_pack_size != null ? Number(cfg.ia_pack_size) : 100
        await admin.rpc("ia_chat_creditar", { p_holding: holdingId, p_qtd: qtd })
        // Registra no histórico com nota distinta (não é mensalidade).
        if (payment.id) {
          const note = `Asaas ${payment.id} · pacote IA`
          const { data: exists } = await admin
            .from("holding_payments")
            .select("id")
            .eq("holding_id", holdingId)
            .eq("note", note)
            .maybeSingle()
          if (!exists) {
            await admin.from("holding_payments").insert({
              holding_id: holdingId,
              paid_on: String(
                payment.paymentDate ??
                  payment.confirmedDate ??
                  new Date().toISOString().slice(0, 10),
              ),
              amount: Number(payment.value ?? 0),
              method: `Asaas${payment.billingType ? ` (${payment.billingType})` : ""} · pacote IA`,
              note,
            })
          }
        }
      }
      // Pacote não altera assinatura/plano — encerra aqui.
      return Response.json({ ok: true, pacote: true })
    }

    const patch: Record<string, unknown> = {
      asaas_last_event: {
        event,
        at: new Date().toISOString(),
        paymentId: payment.id ?? null,
      },
    }

    if (CONFIRMADO.has(event)) {
      patch.paid = true
      patch.trial_ends_at = null // deixou de ser trial, virou pagante
      patch.suspend_on = null
      patch.payment_method = "Asaas"
      if (payment.dueDate) patch.due_date = String(payment.dueDate)
      // Pagamento confirmado → CONCEDE o plano escolhido (pending → plan_tier).
      // É aqui, e só aqui, que a feature é liberada. Limpa o pendente.
      if (pendingPlanTier) {
        patch.plan_tier = pendingPlanTier
        patch.pending_plan_tier = null
      }
    } else if (VENCIDO.has(event)) {
      patch.paid = false
      if (payment.dueDate) {
        patch.due_date = String(payment.dueDate)
        patch.suspend_on = addDays(String(payment.dueDate), 7) // 7 dias de tolerância
      }
    } else if (ESTORNADO.has(event)) {
      patch.paid = false
    }

    await admin.from("holdings").update(patch).eq("id", holdingId)

    // Histórico de pagamento (dedupe pelo id da cobrança do Asaas).
    if (CONFIRMADO.has(event) && payment.id) {
      const note = `Asaas ${payment.id}`
      const { data: exists } = await admin
        .from("holding_payments")
        .select("id")
        .eq("holding_id", holdingId)
        .eq("note", note)
        .maybeSingle()
      if (!exists) {
        await admin.from("holding_payments").insert({
          holding_id: holdingId,
          paid_on: String(
            payment.paymentDate ??
              payment.confirmedDate ??
              payment.dueDate ??
              new Date().toISOString().slice(0, 10),
          ),
          amount: Number(payment.value ?? 0),
          method: `Asaas${payment.billingType ? ` (${payment.billingType})` : ""}`,
          note,
        })
      }
    }
  } catch (e) {
    console.error("asaas webhook: erro", e)
  }

  return Response.json({ ok: true })
}
