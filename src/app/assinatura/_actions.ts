"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import { getPlanoAtual } from "@/lib/data/assinatura"
import { todayISO } from "@/lib/data/billing"
import {
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
  if (plano.mensalidade <= 0)
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
        value: plano.mensalidade,
        nextDueDate,
        cycle: "MONTHLY",
        description: `Delivery OS — assinatura mensal (${plano.name})`,
        externalReference: holdingId,
      })
      subscriptionId = sub.id
      await admin
        .from("holdings")
        .update({
          asaas_subscription_id: subscriptionId,
          payment_method: "Asaas",
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
