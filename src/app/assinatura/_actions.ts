"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { createClient } from "@/lib/supabase/server"
import { aplicarDescontos } from "@/lib/data/descontos"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import {
  getDefaultPlan,
  getPlanoAtual,
  getUpgradeAiInfo,
  precoDoPlano,
  valorAssinaturaDoPlano,
  type PlanId,
} from "@/lib/data/assinatura"
import { todayISO } from "@/lib/data/billing"
import {
  asaasCycle,
  valorCobranca,
  type BillingCycle,
} from "@/lib/pricing"
import {
  asaasCancelSubscription,
  asaasCreateCustomer,
  asaasCreatePayment,
  asaasCreateSubscription,
  type AsaasBillingType,
  asaasFirstInvoiceUrl,
  asaasIsMock,
  asaasSetSubscriptionInvoiceSettings,
  asaasUpdateSubscription,
} from "@/lib/asaas/client"
import { acharIndicadorPorCodigo } from "@/lib/data/indicacoes"
import { fiscalInvoiceSettings } from "@/lib/asaas/fiscal"

export type AssinarState = {
  ok: boolean
  message?: string
  checkoutUrl?: string
}

const onlyDigits = (s: string) => s.replace(/\D/g, "")

/** URL base do app (montada dos headers) — pro Asaas redirecionar de volta. */
async function appBaseUrl(): Promise<string | null> {
  try {
    const h = await headers()
    const host = h.get("host")
    if (!host) return null
    const proto =
      h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https")
    return `${proto}://${host}`
  } catch {
    return null
  }
}

/**
 * Link de pagamento da assinatura JÁ CRIADA (pendente). Não recria nada —
 * só busca a fatura da 1ª cobrança pra o cliente pagar. Evita refazer o
 * cadastro/assinatura quando falta só pagar.
 */
export async function linkPagamentoPendente(): Promise<{
  ok: boolean
  message?: string
  checkoutUrl?: string
}> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, message: "Sessão expirada." }
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, message: "Empresa não encontrada." }

  const admin = createAdminClient()
  const { data: h } = await admin
    .from("holdings")
    .select("asaas_subscription_id")
    .eq("id", holdingId)
    .maybeSingle()
  const subscriptionId = h?.asaas_subscription_id as string | null
  if (!subscriptionId)
    return { ok: false, message: "Nenhuma assinatura pra pagar." }

  try {
    const checkoutUrl = await asaasFirstInvoiceUrl(subscriptionId)
    if (!checkoutUrl)
      return {
        ok: false,
        message: "O link de pagamento ainda está sendo gerado. Tente de novo em instantes.",
      }
    return { ok: true, checkoutUrl }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Erro ao buscar o pagamento.",
    }
  }
}

/** Soma meses a uma data YYYY-MM-DD (fuso SP) e devolve YYYY-MM-DD. */
function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00-03:00`)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

/**
 * Cria (ou reaproveita) o cliente + a assinatura recorrente no Asaas e devolve
 * o link de pagamento da 1ª cobrança. O cliente paga no cartão de crédito
 * (que renova sozinho todo mês); o webhook confirma e libera o acesso.
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
  const planId: PlanId =
    planEscolhido === "pro"
      ? "pro"
      : planEscolhido === "ai"
        ? "ai"
        : "essencial"
  // Ciclo escolhido (self-service). Clientes com preço custom seguem mensal.
  const ciclo: BillingCycle =
    !plano.precoCustom && String(formData.get("ciclo") ?? "") === "anual"
      ? "anual"
      : String(formData.get("ciclo") ?? "") === "mensal"
        ? "mensal"
        : plano.precoCustom
          ? "mensal"
          : "anual"

  // Valor cobrado: anual = 12× à vista (1 cobrança); mensal = base +30%.
  let valor: number
  if (plano.precoCustom) {
    valor = plano.mensalidade // negociado, cobrado mensal
  } else {
    const precos = await getDefaultPlan()
    const base = precoDoPlano(precos, planId, plano.activeUnits)
    valor = valorCobranca(base, ciclo)
  }
  if (valor <= 0)
    return {
      ok: false,
      message: "Plano sem valor definido. Fale com o suporte.",
    }

  const admin = createAdminClient()

  /* ── CUPOM DE INDICAÇÃO ────────────────────────────────────────────────
   * O desconto já existia (`desconto_primeira_fatura_pct` na holding), mas só
   * era aplicado na cobrança MANUAL — quem assina pelo Asaas pagava cheio.
   * Duas portas alimentam o mesmo campo: o código digitado aqui e o que veio
   * do /cadastro.
   *
   * ⚠️ POR QUE NÃO DÁ PRA SÓ BAIXAR O VALOR DA ASSINATURA: no Asaas a
   * assinatura tem UM valor, repetido em todo ciclo. Baixar pra R$ 3.000 daria
   * desconto pra sempre. O campo `discount` de lá também não serve — é
   * desconto por pagamento antecipado, e vale em todos os meses.
   *
   * Então o 1º mês vira uma COBRANÇA AVULSA (com desconto) e a assinatura
   * começa no ciclo seguinte, no valor cheio. É o mesmo mecanismo do pacote
   * de créditos do Nino, que já roda em produção.
   */
  const cupomDigitado = String(formData.get("cupom") ?? "").trim()
  const { data: hRow } = await admin
    .from("holdings")
    .select(
      "desconto_primeira_fatura_pct, indicado_por, asaas_subscription_id, asaas_billing_type, desconto_tipo, desconto_valor, desconto_ate",
    )
    .eq("id", holdingId)
    .maybeSingle()
  const jaAssinou = !!(hRow as { asaas_subscription_id?: string } | null)
    ?.asaas_subscription_id
  const billingType =
    ((hRow as { asaas_billing_type?: string } | null)?.asaas_billing_type ??
      null) as AsaasBillingType | null

  let descontoPct = Number(
    (hRow as { desconto_primeira_fatura_pct?: number } | null)
      ?.desconto_primeira_fatura_pct ?? 0,
  )
  let indicadorId =
    (hRow as { indicado_por?: string } | null)?.indicado_por ?? null

  if (cupomDigitado && !jaAssinou) {
    const ind = await acharIndicadorPorCodigo(cupomDigitado)
    if (!ind)
      return { ok: false, message: "Cupom inválido ou expirado. Confira o código." }
    // Cupom digitado agora ganha do que veio do cadastro: é a intenção mais
    // recente do cliente, e ele está olhando o valor na tela.
    descontoPct = ind.descontoPct
    indicadorId = ind.id
  }

  // Cupom não vale pra quem já tem assinatura: seria desconto de "primeira
  // fatura" em cliente que já pagou várias.
  if (jaAssinou) descontoPct = 0

  /* ── DESCONTO NEGOCIADO ────────────────────────────────────────────────
   * Ele valia SÓ na cobrança manual. Quem tinha 20% acordado e assinava aqui
   * voltava a pagar cheio, sem aviso nenhum — e a conta do Asaas é a que
   * renova sozinha todo mês, então o erro se repetiria pra sempre.
   *
   * A regra (e o motivo de cupom e negociado não somarem) mora em
   * @/lib/data/descontos, o mesmo módulo que a emissão de faturas usa. */
  const hd = hRow as {
    desconto_tipo?: "percentual" | "valor" | null
    desconto_valor?: number | string | null
    desconto_ate?: string | null
  } | null
  const negociado = {
    tipo: (hd?.desconto_tipo ?? null) as "percentual" | "valor" | null,
    valor: Number(hd?.desconto_valor ?? 0),
    ate: (hd?.desconto_ate ?? null) as string | null,
  }

  const valorCheio = valor
  const res = aplicarDescontos(valorCheio, negociado, descontoPct, todayISO())
  // O 1º mês leva o melhor desconto; a assinatura recorrente segue com o
  // negociado (que é o que vale "enquanto ele for cliente").
  const valorComDesconto = res.valor
  const valorRecorrente = res.valorNegociado ?? valorCheio
  const temDesconto = valorComDesconto < valorRecorrente
  const rotuloDesconto =
    res.origem === "cupom"
      ? `com cupom de indicação (${descontoPct}%)`
      : res.origem === "negociado"
        ? `com desconto negociado`
        : ""

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
      // Endereço (pra Nota Fiscal). Obrigatório CEP + número; resto opcional.
      const cep = onlyDigits(String(formData.get("cep") ?? ""))
      const addressNumber = String(formData.get("numero") ?? "").trim()
      if (cep.length !== 8)
        return { ok: false, message: "Informe um CEP válido (8 dígitos)." }
      if (!addressNumber)
        return { ok: false, message: "Informe o número do endereço." }
      const telefone = onlyDigits(String(formData.get("telefone") ?? ""))
      const customer = await asaasCreateCustomer({
        name: nome,
        cpfCnpj,
        email: auth.user.email ?? undefined,
        externalReference: holdingId,
        postalCode: cep,
        address: String(formData.get("logradouro") ?? "").trim() || undefined,
        addressNumber,
        complement: String(formData.get("complemento") ?? "").trim() || undefined,
        province: String(formData.get("bairro") ?? "").trim() || undefined,
        mobilePhone: telefone || undefined,
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
      const base = await appBaseUrl()

      /* Com desconto, o 1º mês vira cobrança AVULSA e a assinatura só começa
       * no ciclo seguinte. Sem isso o desconto valeria pra sempre (assinatura
       * no Asaas tem um valor só). O link devolvido ao cliente é o da avulsa —
       * é o que ele precisa pagar AGORA. */
      let linkPrimeiraCobranca: string | null = null
      let primeiroVencimento = nextDueDate
      if (temDesconto) {
        const avulsa = await asaasCreatePayment({
          customer: customerId,
          value: valorComDesconto,
          dueDate: nextDueDate,
          description: `Delivery OS — 1ª mensalidade ${rotuloDesconto} (de R$ ${valorCheio.toFixed(2)} por R$ ${valorComDesconto.toFixed(2)})`,
          externalReference: holdingId,
          ...(base
            ? { callback: { successUrl: `${base}/?assinou=1`, autoRedirect: true } }
            : {}),
        })
        linkPrimeiraCobranca = avulsa.invoiceUrl
        // Assinatura começa um ciclo depois, no valor cheio.
        const d = new Date(`${nextDueDate}T12:00:00Z`)
        d.setUTCMonth(d.getUTCMonth() + (ciclo === "anual" ? 12 : 1))
        primeiroVencimento = d.toISOString().slice(0, 10)
      }

      const sub = await asaasCreateSubscription({
        customer: customerId,
        // Valor que RENOVA: já com o desconto negociado, que vale enquanto ele
        // for cliente. O do cupom fica só na avulsa acima, uma vez só.
        value: valorRecorrente,
        // Forma de cobrança do cliente (nulo = cartão, o padrão). PIX e BOLETO
        // NÃO debitam sozinhos: o Asaas emite uma cobrança por ciclo e o
        // cliente paga cada uma. Combinado assim com a DG FOODS.
        ...(billingType ? { billingType } : {}),
        nextDueDate: primeiroVencimento,
        cycle: asaasCycle(ciclo),
        description: `Delivery OS — plano ${planId} (${plano.name}) · ${ciclo}`,
        externalReference: holdingId,
        // Depois de pagar, volta pro app com a tela de boas-vindas.
        ...(base
          ? { callback: { successUrl: `${base}/?assinou=1`, autoRedirect: true } }
          : {}),
      })
      subscriptionId = sub.id

      // Liga a emissão automática de NF nessa assinatura. É uma config POR
      // assinatura — sem ela, o Asaas só emite nota na mão, uma por uma.
      // Falha "de leve" de propósito: se der erro, o cliente NÃO pode ficar
      // sem o link de pagamento por causa da nota. A gente reconfigura depois
      // pelo /api/admin/nf-setup.
      try {
        await asaasSetSubscriptionInvoiceSettings(
          subscriptionId,
          fiscalInvoiceSettings(),
        )
      } catch (e) {
        console.error(
          `[nf] falhou ao configurar emissão automática na assinatura ${subscriptionId}:`,
          e,
        )
      }

      await admin
        .from("holdings")
        .update({
          asaas_subscription_id: subscriptionId,
          payment_method: "Asaas",
          billing_cycle: ciclo,
          // Grava só como PENDENTE. O plan_tier (que libera as features) só é
          // concedido pelo webhook quando o pagamento confirmar de verdade.
          ...(plano.precoCustom ? {} : { pending_plan_tier: planId }),
          // Registra a indicação e QUEIMA o cupom. Consumir aqui e não no
          // pagamento é proposital: se ficasse gravado, uma segunda tentativa
          // de assinar geraria outra cobrança com desconto.
          ...(indicadorId ? { indicado_por: indicadorId, indicado_em: new Date().toISOString() } : {}),
          ...(temDesconto ? { desconto_primeira_fatura_pct: null } : {}),
        })
        .eq("id", holdingId)

      // Com desconto, o que o cliente paga AGORA é a avulsa — devolver o link
      // da assinatura mandaria ele pagar o valor cheio.
      if (linkPrimeiraCobranca) {
        return {
          ok: true,
          checkoutUrl: linkPrimeiraCobranca,
          message: `1ª mensalidade ${rotuloDesconto}: R$ ${valorComDesconto.toFixed(2)} em vez de R$ ${valorCheio.toFixed(2)}. A partir do próximo ciclo, R$ ${valorRecorrente.toFixed(2)}.`,
        }
      }
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

export type UpgradeState = {
  ok: boolean
  message?: string
  checkoutUrl?: string | null
  /** Upgrade liberado na hora (proração ínfima, sem cobrança). */
  imediato?: boolean
}

/**
 * Inicia o upgrade pro plano DeliveryOS AI (cliente que JÁ tem assinatura ativa
 * num plano menor). Cobra a diferença proporcional AGORA no checkout do Asaas
 * (cartão já lembrado) e sobe o valor da assinatura pros próximos ciclos. O AI
 * é liberado quando a proração confirmar (webhook, branch "upgrade:").
 */
export async function iniciarUpgradeAi(): Promise<UpgradeState> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, message: "Sessão expirada." }
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, message: "Empresa não encontrada." }

  const info = await getUpgradeAiInfo()
  if (!info) return { ok: false, message: "Não foi possível carregar seu plano." }
  if (!info.podeUpgrade) {
    const msg =
      info.motivo === "custom"
        ? "Seu plano é personalizado — fale com o suporte pra ativar o Nino AI."
        : info.motivo === "ja-ai"
          ? "Você já está no plano DeliveryOS AI."
          : "Você ainda não tem uma assinatura ativa. Assine primeiro."
    return { ok: false, message: msg }
  }

  const admin = createAdminClient()
  const { data: h } = await admin
    .from("holdings")
    .select("asaas_customer_id, asaas_subscription_id")
    .eq("id", holdingId)
    .maybeSingle()
  const customerId = (h?.asaas_customer_id as string | null) ?? null
  const subscriptionId = (h?.asaas_subscription_id as string | null) ?? null
  if (!customerId || !subscriptionId)
    return { ok: false, message: "Assinatura não encontrada. Fale com o suporte." }

  // Asaas não cobra abaixo de ~R$5. Se a proração for ínfima, sobe o valor da
  // assinatura e libera o AI de cortesia, sem cobrança agora.
  const MIN_ASAAS = 5

  try {
    if (info.proracaoAgora < MIN_ASAAS) {
      await asaasUpdateSubscription(subscriptionId, {
        value: info.aiValorCiclo,
        description: "Delivery OS — plano ai",
      })
      await admin
        .from("holdings")
        .update({ plan_tier: "ai", pending_plan_tier: null })
        .eq("id", holdingId)
      revalidatePath("/nino")
      revalidatePath("/", "layout")
      return { ok: true, imediato: true }
    }

    // Marca o AI como pendente — o webhook concede quando a proração confirmar.
    await admin
      .from("holdings")
      .update({ pending_plan_tier: "ai" })
      .eq("id", holdingId)

    const base = await appBaseUrl()
    const pay = await asaasCreatePayment({
      customer: customerId,
      value: info.proracaoAgora,
      dueDate: todayISO(),
      description:
        "Delivery OS — upgrade pro DeliveryOS AI (diferença proporcional até a renovação)",
      externalReference: `upgrade:${holdingId}:ai`,
      // Depois de pagar, cai direto no Nino (o que ele veio buscar).
      ...(base
        ? { callback: { successUrl: `${base}/consultor-ia`, autoRedirect: true } }
        : {}),
    })
    if (!pay.invoiceUrl)
      return {
        ok: false,
        message:
          "Cobrança criada, mas o link de pagamento ainda está sendo gerado. Tente de novo em instantes.",
      }
    return { ok: true, checkoutUrl: pay.invoiceUrl }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Erro ao iniciar o upgrade.",
    }
  }
}

/**
 * MODO SIMULADO do UPGRADE: espelha o branch "upgrade:" do webhook — concede o
 * plano AI e sobe o valor da assinatura. Só age em modo de teste (sem Asaas).
 */
export async function simularUpgrade(): Promise<{
  ok: boolean
  message?: string
}> {
  if (!asaasIsMock()) return { ok: false, message: "Só vale no modo de teste." }
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, message: "Sessão expirada." }
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, message: "Empresa não encontrada." }

  const info = await getUpgradeAiInfo()
  const admin = createAdminClient()
  const { data: hh } = await admin
    .from("holdings")
    .select("asaas_subscription_id")
    .eq("id", holdingId)
    .maybeSingle()
  const subId = (hh?.asaas_subscription_id as string | null) ?? null

  await admin
    .from("holdings")
    .update({ plan_tier: "ai", pending_plan_tier: null })
    .eq("id", holdingId)
  if (subId) {
    try {
      const novoValor = await valorAssinaturaDoPlano(holdingId, "ai")
      await asaasUpdateSubscription(subId, { value: novoValor }) // no-op no mock
    } catch {
      /* mock */
    }
  }
  await admin.from("holding_payments").insert({
    holding_id: holdingId,
    paid_on: todayISO(),
    amount: info?.proracaoAgora ?? 0,
    method: "Asaas (Simulado) · upgrade AI",
    note: `Simulado upgrade ${holdingId}`,
  })
  revalidatePath("/nino")
  revalidatePath("/", "layout")
  return { ok: true }
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
    .select("id, asaas_subscription_id, pending_plan_tier, billing_cycle")
    .eq("id", holdingId)
    .maybeSingle()
  if (!h || h.asaas_subscription_id !== subscriptionId)
    return { ok: false, message: "Assinatura não confere com a empresa." }

  const hoje = todayISO()
  const plano = await getPlanoAtual()
  const pendingTier = (h.pending_plan_tier as string | null) ?? null
  // Anual paga o ano; o próximo vencimento é daqui a 12 meses (mensal = 1).
  const mesesAteRenovar = h.billing_cycle === "anual" ? 12 : 1
  await admin
    .from("holdings")
    .update({
      paid: true,
      trial_ends_at: null,
      suspend_on: null,
      due_date: addMonths(hoje, mesesAteRenovar),
      payment_method: "Asaas (Simulado)",
      // Espelha o webhook: pagamento confirmado concede o plano pendente.
      ...(pendingTier ? { plan_tier: pendingTier, pending_plan_tier: null } : {}),
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
