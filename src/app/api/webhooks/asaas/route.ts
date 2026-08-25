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
import { retomarSyncDoCliente } from "@/lib/data/unidades-inativas"

import { createAdminClient } from "@/lib/supabase/admin"
import { valorAssinaturaDoPlano } from "@/lib/data/assinatura"
import { asaasUpdateSubscription } from "@/lib/asaas/client"

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

    // ── UPGRADE de plano (cobrança avulsa da proração) ──
    // externalReference "upgrade:<holdingId>:<plano>". Quando confirma: concede
    // o novo plano e sobe o valor da assinatura pros próximos ciclos. NÃO mexe
    // em paid/due_date/suspend da holding (a assinatura base segue igual), por
    // isso trata à parte — um estorno da proração não pode derrubar a conta.
    if (extRef.startsWith("upgrade:")) {
      if (CONFIRMADO.has(event)) {
        const alvo = extRef.split(":")[2] === "ai" ? "ai" : null
        if (alvo) {
          await admin
            .from("holdings")
            .update({ plan_tier: alvo, pending_plan_tier: null })
            .eq("id", holdingId)
          // Sobe o valor recorrente da assinatura pros próximos ciclos.
          try {
            const { data: hh } = await admin
              .from("holdings")
              .select("asaas_subscription_id")
              .eq("id", holdingId)
              .maybeSingle()
            const subId = (hh?.asaas_subscription_id as string | null) ?? null
            if (subId) {
              const novoValor = await valorAssinaturaDoPlano(holdingId, alvo)
              await asaasUpdateSubscription(subId, {
                value: novoValor,
                description: "Delivery OS — plano ai",
              })
            }
          } catch (e) {
            console.error("[upgrade] falhou ao subir o valor da assinatura:", e)
          }
          // Histórico (nota distinta, dedupe pelo id da cobrança).
          if (payment.id) {
            const note = `Asaas ${payment.id} · upgrade AI`
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
                method: `Asaas${payment.billingType ? ` (${payment.billingType})` : ""} · upgrade AI`,
                note,
              })
            }
          }
        }
      }
      return Response.json({ ok: true, upgrade: true })
    }

    const patch: Record<string, unknown> = {
      asaas_last_event: {
        event,
        at: new Date().toISOString(),
        paymentId: payment.id ?? null,
      },
    }

    let retomouPagamento = false
    if (CONFIRMADO.has(event)) {
      patch.paid = true
      patch.trial_ends_at = null // deixou de ser trial, virou pagante
      patch.suspend_on = null
      // O sync volta com a lacuna a recuperar — ver `retomarSyncDoCliente`.
      // Fora do patch de propósito: mexe em unit_platforms, não em holdings.
      retomouPagamento = true
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

    /**
     * Pagou depois de suspenso: retoma o sync e recupera a lacuna.
     *
     * Depois do update de propósito — `suspend_on` precisa já estar limpo,
     * senão a próxima rodada do sync leria "ainda suspenso" e carimbaria a
     * pausa de novo, desfazendo a retomada.
     *
     * A função sai calada quando não há pausa carimbada, então chamar em todo
     * pagamento confirmado é barato: só age em quem realmente ficou parado.
     */
    if (retomouPagamento) {
      try {
        const r = await retomarSyncDoCliente(holdingId)
        if (r.pausadoEm) {
          console.log(
            `[asaas] sync retomado da holding ${holdingId}: parado desde ${r.pausadoEm}, ${r.lojas} loja(s) na fila de recuperação`,
          )
        }
      } catch (e) {
        // Falhar aqui NÃO pode derrubar o webhook: o Asaas reenviaria o evento
        // e o cliente ficaria sem a confirmação de pagamento por causa de um
        // backfill. A lacuna continua carimbada e a próxima confirmação tenta.
        console.error("[asaas] falha ao retomar sync:", e)
      }
    }

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
        const pagoEm = String(
          payment.paymentDate ??
            payment.confirmedDate ??
            payment.dueDate ??
            new Date().toISOString().slice(0, 10),
        )
        const valor = Number(payment.value ?? 0)
        const { data: novo } = await admin
          .from("holding_payments")
          .insert({
            holding_id: holdingId,
            paid_on: pagoEm,
            amount: valor,
            method: `Asaas${payment.billingType ? ` (${payment.billingType})` : ""}`,
            note,
          })
          .select("id")
          .maybeSingle()

        /**
         * ⚠️ QUITAR A FATURA — ISTO FALTAVA, E TINHA DOIS CUSTOS.
         *
         * O webhook gravava o pagamento em `holding_payments` e marcava a
         * holding como paga, mas nunca mexia em `holding_invoices`. Só o
         * caminho MANUAL (registrar pagamento na tela de clientes) quitava a
         * fatura. Quem paga pelo Asaas — que é o caminho self-service, o
         * principal — deixava a fatura aberta pra sempre.
         *
         * O que isso quebrava, medido em 25/08/26:
         *
         *  1. A COMISSÃO DE INDICAÇÃO NUNCA NASCIA. Ela é criada a partir de
         *     `holding_invoices.status = 'paga'`. A Tech Assessoria, indicada
         *     pelo Diego, pagou em 21/08 e a fatura seguia aberta — então o
         *     painel de Indicações mostrava R$ 0,00 e "nenhuma comissão
         *     ainda", com o cliente pagante em dia.
         *
         *  2. INADIMPLÊNCIA INFLADA. R$ 5.065,76 em faturas "abertas", das
         *     quais R$ 4.371,50 já tinham sido pagos.
         *
         * Não derruba o webhook se falhar: o pagamento em si já está
         * registrado e a conta do cliente já foi liberada, que é o que não
         * pode faltar. Fatura por quitar a gente conserta; cliente barrado
         * depois de pagar, não.
         */
        if (novo?.id) {
          try {
            const { quitarFaturaComPagamento } = await import(
              "@/lib/data/faturas"
            )
            const q = await quitarFaturaComPagamento(
              holdingId,
              novo.id,
              pagoEm,
              valor,
            )
            if (q.ok) {
              const { apurarComissoes } = await import("@/lib/data/indicacoes")
              await apurarComissoes()
            }
          } catch (e) {
            console.error("[asaas] quitar fatura / apurar comissão:", e)
          }
        }
      }
    }
  } catch (e) {
    console.error("asaas webhook: erro", e)
  }

  return Response.json({ ok: true })
}
