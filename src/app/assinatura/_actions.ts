"use server"

import { revalidatePath } from "next/cache"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import {
  getDefaultPlan,
  getPlanoAtual,
  precoDoPlano,
  type PlanId,
} from "@/lib/data/assinatura"
import { todayISO } from "@/lib/data/billing"
import {
  asaasCancelSubscription,
  asaasCreateCustomer,
  asaasCreateSubscription,
  asaasFirstInvoiceUrl,
} from "@/lib/asaas/client"

export type AssinarState = {
  ok: boolean
  message?: string
  checkoutUrl?: string
}

const onlyDigits = (s: string) => s.replace(/\D/g, "")

/** Soma meses a uma data YYYY-MM-DD (fuso SP) e devolve YYYY-MM-DD. */
function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00-03:00`)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

/**
 * Cria (ou reaproveita) o cliente + a assinatura recorrente no Asaas e devolve
 * o link de pagamento da 1ª cobrança. O cliente paga na página do Asaas
 * (Pix/boleto/cartão); o webhook confirma e libera o acesso.
 */
export async function assinar(
  _prev: AssinarState,
  formData: FormData,
): Promise<AssinarState> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, message: "Sessão expirada. Entre de novo." }

  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, message: "Empresa não encontrada." }

  const plano = await getPlanoAtual()
  if (!plano) return { ok: false, message: "Não foi possível carregar seu plano." }

  // Plano escolhido (self-service). Clientes com preço custom não escolhem.
  const planEscolhido = String(formData.get("plano") ?? "")
  const planId: PlanId = planEscolhido === "pro" ? "pro" : "essencial"
  let valor = plano.mensalidade
  if (!plano.precoCustom) {
    const precos = await getDefaultPlan()
    valor = precoDoPlano(precos, planId, plano.activeUnits)
  }
  if (valor <= 0)
    return {
      ok: false,
      message: "Plano sem valor definido. Fale com o suporte.",
    }

  const admin = createAdminClient()

  try {
    // 1) Cliente no Asaas (só pede nome/documento na primeira vez).
    let customerId = plano.customerId
    if (!customerId) {
      const nome = String(formData.get("nome") ?? "").trim()
      const cpfCnpj = onlyDigits(String(formData.get("cpfCnpj") ?? ""))
      if (nome.length < 2)
        return {
          ok: false,
          message: "Informe o nome do responsável ou a razão social.",
        }
      if (cpfCnpj.length !== 11 && cpfCnpj.length !== 14)
        return {
          ok: false,
          message: "CPF (11 dígitos) ou CNPJ (14 dígitos) inválido.",
        }
      const customer = await asaasCreateCustomer({
        name: nome,
        cpfCnpj,
        email: auth.user.email ?? undefined,
        externalReference: holdingId,
      })
      customerId = customer.id
      await admin
        .from("holdings")
        .update({ asaas_customer_id: customerId })
        .eq("id", holdingId)
    }

    // 2) Assinatura (reaproveita se já existe → só busca o link).
    let subscriptionId = plano.subscriptionId
    if (!subscriptionId) {
      // 1ª cobrança respeita os dias de teste que ainda restam.
      const hoje = todayISO()
      const nextDueDate =
        plano.trialEndsAt && plano.trialEndsAt > hoje ? plano.trialEndsAt : hoje
      const sub = await asaasCreateSubscription({
        customer: customerId,
        value: valor,
        nextDueDate,
        cycle: "MONTHLY",
        description: `Delivery OS — plano ${planId} (${plano.name})`,
        externalReference: holdingId,
      })
      subscriptionId = sub.id
      await admin
        .from("holdings")
        .update({
          asaas_subscription_id: subscriptionId,
          payment_method: "Asaas",
          ...(plano.precoCustom ? {} : { plan_tier: planId }),
        })
        .eq("id", holdingId)
    }

    // 3) Link de pagamento da 1ª cobrança.
    const checkoutUrl = await asaasFirstInvoiceUrl(subscriptionId)
    if (!checkoutUrl)
      return {
        ok: false,
        message:
          "Assinatura criada, mas o link de pagamento ainda está sendo gerado. Tente de novo em alguns segundos.",
      }
    return { ok: true, checkoutUrl }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Erro ao criar a assinatura.",
    }
  }
}

/**
 * MODO SIMULADO (sem Asaas): aprova o pagamento manualmente no checkout de
 * teste. Faz o mesmo que o webhook de pagamento confirmado faria — marca a
 * empresa como paga, encerra o trial e registra o pagamento. Só age numa
 * assinatura "mock_..." da própria empresa do usuário logado (não mexe em real).
 */
export async function simularPagamento(
  subscriptionId: string,
): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, message: "Sessão expirada." }
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, message: "Empresa não encontrada." }
  if (!subscriptionId.startsWith("mock_"))
    return { ok: false, message: "Só vale no modo de teste." }

  const admin = createAdminClient()
  const { data: h } = await admin
    .from("holdings")
    .select("id, asaas_subscription_id")
    .eq("id", holdingId)
    .maybeSingle()
  if (!h || h.asaas_subscription_id !== subscriptionId)
    return { ok: false, message: "Assinatura não confere com a empresa." }

  const hoje = todayISO()
  const plano = await getPlanoAtual()
  await admin
    .from("holdings")
    .update({
      paid: true,
      trial_ends_at: null,
      suspend_on: null,
      due_date: addMonths(hoje, 1),
      payment_method: "Asaas (Simulado)",
      asaas_last_event: {
        event: "SIMULATED_PAYMENT_CONFIRMED",
        at: new Date().toISOString(),
      },
    })
    .eq("id", holdingId)

  await admin.from("holding_payments").insert({
    holding_id: holdingId,
    paid_on: hoje,
    amount: plano?.mensalidade ?? 0,
    method: "Asaas (Simulado)",
    note: `Simulado ${subscriptionId}`,
  })

  revalidatePath("/assinatura")
  revalidatePath("/", "layout")
  return { ok: true }
}

/**
 * Cancela a assinatura recorrente. Para de cobrar no Asaas e libera o acesso
 * até o fim do período já pago (due_date); depois disso, suspende.
 */
export async function cancelarAssinatura(): Promise<{
  ok: boolean
  message?: string
}> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, message: "Sessão expirada." }
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, message: "Empresa não encontrada." }

  const admin = createAdminClient()
  const { data: h } = await admin
    .from("holdings")
    .select("id, asaas_subscription_id, due_date")
    .eq("id", holdingId)
    .maybeSingle()
  if (!h?.asaas_subscription_id)
    return { ok: false, message: "Nenhuma assinatura ativa pra cancelar." }

  try {
    await asaasCancelSubscription(h.asaas_subscription_id)
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Erro ao cancelar no Asaas.",
    }
  }

  // Acesso segue até o fim do período pago; depois suspende.
  const fimPeriodo = (h.due_date as string | null) ?? todayISO()
  await admin
    .from("holdings")
    .update({
      asaas_subscription_id: null,
      paid: false,
      suspend_on: fimPeriodo,
      asaas_last_event: {
        event: "SUBSCRIPTION_CANCELED",
        at: new Date().toISOString(),
      },
    })
    .eq("id", holdingId)

  revalidatePath("/assinatura")
  revalidatePath("/", "layout")
  return { ok: true }
}
