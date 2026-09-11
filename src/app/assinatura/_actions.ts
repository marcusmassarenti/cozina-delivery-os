"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { createClient } from "@/lib/supabase/server"
import { aplicarDescontos } from "@/lib/data/descontos"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import {
  fimDoPeriodo,
  getDefaultPlan,
  getPlanoAtual,
  getRegraCiclos,
  getUpgradeAiInfo,
  PLANOS_META,
  precoDoPlano,
  valorAssinaturaDoPlano,
  type PlanId,
  type PrecosPlano,
} from "@/lib/data/assinatura"
import { todayISO } from "@/lib/data/billing"
import {
  asaasCycle,
  cicloDoBanco,
  mesesDoCiclo,
  PARCELAS_12X,
  valorCobranca,
  type BillingCycle,
} from "@/lib/pricing"
import {
  asaasCancelSubscription,
  asaasCreateCustomer,
  asaasCreateInstallment,
  asaasCreatePayment,
  asaasCreateSubscription,
  asaasDeleteInstallment,
  type AsaasBillingType,
  asaasFirstInvoiceUrl,
  asaasGetCustomer,
  asaasInstallmentInvoiceUrl,
  asaasIsMock,
  asaasUpdateSubscription,
} from "@/lib/asaas/client"
import { acharIndicadorPorCodigo } from "@/lib/data/indicacoes"
import {
  ativarAdesaoEEnviar,
  cancelarAdesao,
  cancelarAdesoesPendentes,
  registrarAdesao,
  vincularAdesaoAoAsaas,
} from "@/lib/data/contrato-adesao"
import { fmtDoc } from "@/lib/data/proposta-aceite"
import { TERMO_VERSAO, type DadosAdesao } from "@/lib/contrato-adesao-texto"

export type AssinarState = {
  ok: boolean
  message?: string
  checkoutUrl?: string
}

const onlyDigits = (s: string) => s.replace(/\D/g, "")

/** 2026-09-11 → 11/09/2026. */
const fmtBR = (iso: string) => iso.split("-").reverse().join("/")

/**
 * IP e navegador de quem aceitou o termo. Mesma regra do aceite da proposta:
 * o primeiro endereço do `x-forwarded-for` (borda da Vercel) é o cliente. Sem
 * ele, fica vazio — comprovante sem IP ainda vale; com IP errado, vale menos.
 */
async function origemDaRequisicao(): Promise<{ ip: string; ua: string }> {
  try {
    const h = await headers()
    const ff = h.get("x-forwarded-for") ?? ""
    return {
      ip: (ff.split(",")[0] ?? "").trim() || (h.get("x-real-ip") ?? ""),
      ua: h.get("user-agent") ?? "",
    }
  } catch {
    return { ip: "", ua: "" }
  }
}

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
 * Link de pagamento do que JÁ FOI CRIADO e falta pagar — a 1ª cobrança da
 * assinatura, ou o parcelamento do 12x (o do 1º ano ou a renovação). Não
 * recria nada: evita refazer cadastro, cobrança e termo quando falta só pagar.
 */
export async function linkPagamentoPendente(): Promise<{
  ok: boolean
  message?: string
  checkoutUrl?: string
}> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, message: "Sessão expirada." }
  const plano = await getPlanoAtual()
  if (!plano) return { ok: false, message: "Empresa não encontrada." }
  if (!plano.subscriptionId && !plano.parceladoPendenteId)
    return { ok: false, message: "Nenhuma assinatura pra pagar." }

  try {
    const checkoutUrl = plano.subscriptionId
      ? await asaasFirstInvoiceUrl(plano.subscriptionId)
      : await asaasInstallmentInvoiceUrl(plano.parceladoPendenteId!)
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
  const usuario = auth.user

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
  const cicloPedido = String(formData.get("ciclo") ?? "")
  const ciclo: BillingCycle = plano.precoCustom
    ? "mensal"
    : cicloPedido === "mensal" || cicloPedido === "anual_12x"
      ? cicloPedido
      : "anual"

  /* O ACEITE DO TERMO. A caixinha do formulário é `required`, mas o que vale é
   * o que chega aqui: sem aceite, nenhuma cobrança é criada. */
  if (formData.get("aceite") !== "on")
    return {
      ok: false,
      message: "Para assinar, marque que leu e aceita o Termo de Adesão e o Contrato.",
    }

  // Valor por ciclo: anual = 12× à vista; 12x = total do ano; mensal = base +30%.
  const regra = await getRegraCiclos()
  let valor: number
  let precos: PrecosPlano | null = null
  if (plano.precoCustom) {
    valor = plano.mensalidade // negociado, cobrado mensal
  } else {
    precos = await getDefaultPlan()
    const base = precoDoPlano(precos, planId, plano.activeUnits)
    valor = valorCobranca(base, ciclo, regra)
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
      "desconto_primeira_fatura_pct, indicado_por, asaas_subscription_id, asaas_installment_id, asaas_billing_type, desconto_tipo, desconto_valor, desconto_ate, razao_social, doc_cpf_cnpj, nf_cep, nf_logradouro, nf_numero, nf_complemento, nf_bairro, nf_cidade, nf_uf",
    )
    .eq("id", holdingId)
    .maybeSingle()
  const hr = (hRow ?? {}) as Record<string, string | null | undefined>
  // Já assinou alguma vez (assinatura ou 12x)? Então cupom de 1ª fatura não vale.
  const jaAssinou = !!(hr.asaas_subscription_id || hr.asaas_installment_id)
  const billingType = (hr.asaas_billing_type ?? null) as AsaasBillingType | null
  // O 12x é parcelamento no CARTÃO. Boleto parcelado vira carnê, e aí o cliente
  // pode parar no meio — justamente o que esta opção existe pra evitar.
  if (ciclo === "anual_12x" && (billingType === "PIX" || billingType === "BOLETO"))
    return {
      ok: false,
      message: "O anual em 12x é só no cartão de crédito. Escolha o anual à vista ou o mensal.",
    }

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

    /* ── TERMO DE ADESÃO: quem está contratando e o quê ─────────────────
     * Identidade do formulário (1ª assinatura) ou do cadastro — quem já é
     * cliente no Asaas não vê esses campos de novo. O quadro-resumo é
     * congelado aqui e o hash cobre ele e o texto das condições. */
    const f = (k: string) => String(formData.get(k) ?? "").trim()
    let contratanteNome = f("nome") || hr.razao_social || ""
    let contratanteDoc = onlyDigits(f("cpfCnpj")) || onlyDigits(hr.doc_cpf_cnpj ?? "")
    const cepContrato = onlyDigits(f("cep")) || onlyDigits(hr.nf_cep ?? "")
    let endereco = [
      [f("logradouro") || hr.nf_logradouro, f("numero") || hr.nf_numero]
        .filter(Boolean)
        .join(", "),
      f("complemento") || hr.nf_complemento,
      f("bairro") || hr.nf_bairro,
      [hr.nf_cidade, hr.nf_uf].filter(Boolean).join("/"),
      cepContrato ? `CEP ${cepContrato}` : "",
    ]
      .filter(Boolean)
      .join(" — ")
    if (!contratanteNome || !contratanteDoc || !endereco) {
      try {
        const c = (await asaasGetCustomer(customerId)) as unknown as Record<
          string,
          string | null | undefined
        > | null
        if (c) {
          contratanteNome ||= c.name ?? ""
          contratanteDoc ||= onlyDigits(c.cpfCnpj ?? "")
          if (!endereco)
            endereco = [
              [c.address, c.addressNumber].filter(Boolean).join(", "),
              c.province,
              c.postalCode ? `CEP ${onlyDigits(c.postalCode)}` : "",
            ]
              .filter(Boolean)
              .join(" — ")
        }
      } catch {
        // Sem o cadastro do Asaas, o termo sai com o que houver.
      }
    }
    const { data: perfil } = await admin
      .from("profiles")
      .select("full_name")
      .eq("user_id", usuario.id)
      .maybeSingle()
    const signatario =
      (perfil?.full_name as string | null) ||
      (usuario.user_metadata?.full_name as string | undefined) ||
      contratanteNome ||
      usuario.email ||
      ""
    const hojeAceite = todayISO()
    // 1ª cobrança respeita os dias de teste que ainda restam.
    const primeiroVenc =
      plano.trialEndsAt && plano.trialEndsAt > hojeAceite ? plano.trialEndsAt : hojeAceite
    const dadosTermo: DadosAdesao = {
      versaoTermo: TERMO_VERSAO,
      contratante: {
        nome: contratanteNome || plano.name,
        documento: contratanteDoc ? fmtDoc(contratanteDoc) : "",
        endereco,
        email: usuario.email ?? "",
      },
      plano:
        plano.precoCustom || !precos
          ? {
              id: "personalizado",
              nome: plano.planLabel ?? "Personalizado",
              precoPrimeiraLoja: null,
              precoAdicional: null,
              personalizado: true,
            }
          : {
              id: planId,
              nome: PLANOS_META[planId].label,
              precoPrimeiraLoja: precos[planId].first,
              precoAdicional: precos[planId].add,
              personalizado: false,
            },
      lojas: plano.activeUnits,
      ciclo,
      valorMensal:
        ciclo === "mensal"
          ? valorRecorrente
          : Math.round((valorRecorrente / 12) * 100) / 100,
      valorCiclo: valorRecorrente,
      parcelas: ciclo === "anual_12x" ? PARCELAS_12X : null,
      acrescimo12xPct: ciclo === "anual_12x" ? regra.acrescimo12xPct : null,
      primeiraCobranca: temDesconto
        ? { valor: valorComDesconto, motivo: rotuloDesconto.replace(/^com /, "") }
        : null,
      formaPagamento:
        ciclo === "anual_12x"
          ? "Cartão de crédito em 12x"
          : billingType === "PIX"
            ? "Pix"
            : billingType === "BOLETO"
              ? "Boleto"
              : billingType === "UNDEFINED"
                ? "Cartão, Pix ou boleto"
                : "Cartão de crédito",
      inicio: hojeAceite,
      fimPrimeiroPeriodo: ciclo === "mensal" ? null : addMonths(primeiroVenc, 12),
    }
    const { ip, ua } = await origemDaRequisicao()
    const registrarTermo = () =>
      registrarAdesao({
        holdingId,
        dados: dadosTermo,
        userId: usuario.id,
        nome: signatario,
        email: usuario.email ?? "",
        ip,
        userAgent: ua,
      })

    /* ── ANUAL EM 12x: parcelamento, não assinatura ──────────────────────
     * O termo é gravado ANTES da cobrança: se o registro do aceite falhar,
     * nada é cobrado. Se a cobrança falhar depois, o termo vira "cancelado". */
    if (ciclo === "anual_12x") {
      // Já existe parcelamento esperando pagamento: devolve o link dele, sem
      // criar outro (nem outro termo).
      if (plano.parceladoPendenteId) {
        const url = await asaasInstallmentInvoiceUrl(plano.parceladoPendenteId)
        return url
          ? { ok: true, checkoutUrl: url }
          : {
              ok: false,
              message: "O link de pagamento ainda está sendo gerado. Tente de novo em instantes.",
            }
      }
      const termo = await registrarTermo()
      if (!termo.ok)
        return { ok: false, message: `Não foi possível registrar o aceite: ${termo.erro}` }
      try {
        const base = await appBaseUrl()
        const fim = addMonths(primeiroVenc, 12)
        // Com cupom, o 1º ano sai com desconto nas 12 parcelas; a renovação
        // volta ao valor cheio (o que o termo diz).
        const parcelaAno1 = Math.round((valorComDesconto / PARCELAS_12X) * 100) / 100
        const inst = await asaasCreateInstallment({
          customer: customerId,
          installmentValue: parcelaAno1,
          installmentCount: PARCELAS_12X,
          dueDate: primeiroVenc,
          description: `Delivery OS — plano ${PLANOS_META[planId].label} · anual em 12x (${fmtBR(primeiroVenc)} a ${fmtBR(fim)})`,
          externalReference: holdingId,
          ...(base
            ? { callback: { successUrl: `${base}/?assinou=1`, autoRedirect: true } }
            : {}),
        })
        await vincularAdesaoAoAsaas(termo.id, inst.installmentId)
        await admin
          .from("holdings")
          .update({
            asaas_installment_id: inst.installmentId,
            asaas_installment_renovacao_id: null,
            parcelado_ate: fim,
            parcelado_nao_renovar: false,
            payment_method: "Asaas",
            billing_cycle: ciclo,
            // Só PENDENTE: o plano (que libera as features) vem do webhook.
            pending_plan_tier: planId,
            ...(indicadorId
              ? { indicado_por: indicadorId, indicado_em: new Date().toISOString() }
              : {}),
            ...(temDesconto ? { desconto_primeira_fatura_pct: null } : {}),
          })
          .eq("id", holdingId)
        const url =
          inst.invoiceUrl ?? (await asaasInstallmentInvoiceUrl(inst.installmentId))
        if (!url)
          return {
            ok: false,
            message:
              "Parcelamento criado, mas o link de pagamento ainda está sendo gerado. Tente de novo em alguns segundos.",
          }
        return {
          ok: true,
          checkoutUrl: url,
          ...(temDesconto
            ? {
                message: `1º ano ${rotuloDesconto}: 12x de R$ ${parcelaAno1.toFixed(2)}. Na renovação, o valor cheio.`,
              }
            : {}),
        }
      } catch (e) {
        await cancelarAdesao(termo.id)
        throw e
      }
    }

    // 2) Assinatura (reaproveita se já existe → só busca o link).
    let subscriptionId = plano.subscriptionId
    if (!subscriptionId) {
      const termo = await registrarTermo()
      if (!termo.ok)
        return { ok: false, message: `Não foi possível registrar o aceite: ${termo.erro}` }
      try {
      const nextDueDate = primeiroVenc
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
        cycle: asaasCycle(ciclo === "mensal" ? "mensal" : "anual"),
        description: `Delivery OS — plano ${planId} (${plano.name}) · ${ciclo}`,
        externalReference: holdingId,
        // Depois de pagar, volta pro app com a tela de boas-vindas.
        ...(base
          ? { callback: { successUrl: `${base}/?assinou=1`, autoRedirect: true } }
          : {}),
      })
      subscriptionId = sub.id
      await vincularAdesaoAoAsaas(termo.id, sub.id)

      /* EMISSÃO AUTOMÁTICA DE NF: REMOVIDA (Marcus, 24/08/26).
       *
       * A assinatura nova NASCIA com `effectiveDatePeriod =
       * ON_PAYMENT_CONFIRMATION`, e a nota saía sozinha assim que o cartão
       * era confirmado. Foi desligada por decisão do Marcus.
       *
       * ⚠️ SE ALGUÉM FOR RELIGAR: desligar só no painel do Asaas NÃO basta.
       * A config é por ASSINATURA, então cada cliente novo voltaria a emitir
       * por causa desta linha aqui — era exatamente o buraco que fez a
       * remoção precisar acontecer no código, e não só no painel.
       *
       * O que emitia continua existindo em lib/asaas/fiscal.ts e no client
       * (asaasSetSubscriptionInvoiceSettings), intocados: religar é chamar de
       * novo, com os dados fiscais que já estão lá.
       */

      await admin
        .from("holdings")
        .update({
          asaas_subscription_id: subscriptionId,
          payment_method: "Asaas",
          billing_cycle: ciclo,
          // Um 12x que terminou não pode ficar pendurado ao lado da assinatura nova.
          asaas_installment_id: null,
          asaas_installment_renovacao_id: null,
          parcelado_ate: null,
          parcelado_nao_renovar: false,
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
      } catch (e) {
        await cancelarAdesao(termo.id)
        throw e
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
  // No anual em 12x não há assinatura: a proração é cobrada à parte e o plano
  // novo entra no valor da renovação.
  if (!customerId)
    return { ok: false, message: "Assinatura não encontrada. Fale com o suporte." }

  // Asaas não cobra abaixo de ~R$5. Se a proração for ínfima, sobe o valor da
  // assinatura e libera o AI de cortesia, sem cobrança agora.
  const MIN_ASAAS = 5

  try {
    if (info.proracaoAgora < MIN_ASAAS) {
      if (subscriptionId)
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
  const mesesAteRenovar = mesesDoCiclo(cicloDoBanco(h.billing_cycle))
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

  // Espelha o webhook: o 1º pagamento põe o Termo de Adesão em vigor.
  await ativarAdesaoEEnviar(holdingId)

  revalidatePath("/assinatura")
  revalidatePath("/", "layout")
  return { ok: true }
}

/**
 * MODO SIMULADO do 12x: faz o que o webhook faria quando o parcelamento é
 * pago — libera o acesso até o fim do período e põe o termo em vigor. Só age
 * num parcelamento "mock_..." da própria empresa.
 */
export async function simularPagamentoParcelado(
  installmentId: string,
): Promise<{ ok: boolean; message?: string }> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { ok: false, message: "Sessão expirada." }
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return { ok: false, message: "Empresa não encontrada." }
  if (!installmentId.startsWith("mock_"))
    return { ok: false, message: "Só vale no modo de teste." }

  const admin = createAdminClient()
  const { data: h } = await admin
    .from("holdings")
    .select(
      "id, asaas_installment_id, asaas_installment_renovacao_id, parcelado_ate, pending_plan_tier",
    )
    .eq("id", holdingId)
    .maybeSingle()
  const renovacao = h?.asaas_installment_renovacao_id === installmentId
  if (!h || (h.asaas_installment_id !== installmentId && !renovacao))
    return { ok: false, message: "Parcelamento não confere com a empresa." }

  const hoje = todayISO()
  const fim = renovacao
    ? addMonths((h.parcelado_ate as string | null) ?? hoje, 12)
    : ((h.parcelado_ate as string | null) ?? addMonths(hoje, 12))
  const pendingTier = (h.pending_plan_tier as string | null) ?? null
  const plano = await getPlanoAtual()
  await admin
    .from("holdings")
    .update({
      paid: true,
      trial_ends_at: null,
      suspend_on: null,
      due_date: fim,
      parcelado_ate: fim,
      asaas_installment_id: installmentId,
      asaas_installment_renovacao_id: null,
      payment_method: "Asaas (Simulado)",
      ...(pendingTier ? { plan_tier: pendingTier, pending_plan_tier: null } : {}),
      asaas_last_event: {
        event: "SIMULATED_INSTALLMENT_CONFIRMED",
        at: new Date().toISOString(),
      },
    })
    .eq("id", holdingId)

  await admin.from("holding_payments").insert({
    holding_id: holdingId,
    paid_on: hoje,
    amount: plano?.valorMensalCiclo ?? 0,
    method: "Asaas (Simulado) · 1ª parcela do 12x",
    note: `Simulado ${installmentId}`,
  })

  await ativarAdesaoEEnviar(holdingId)

  revalidatePath("/assinatura")
  revalidatePath("/", "layout")
  return { ok: true }
}

/**
 * Cancela a assinatura. Três casos, porque "cancelar" muda de sentido:
 *
 *  - Assinatura (mensal / anual à vista): para de cobrar no Asaas; o acesso
 *    segue até o FIM do período pago e depois suspende.
 *  - 12x ainda NÃO pago: o parcelamento é removido — o cliente desistiu antes
 *    de pagar, e não há período a respeitar.
 *  - 12x já pago: cancela só a RENOVAÇÃO. As parcelas seguem no cartão (o
 *    banco aprovou a compra inteira) e o acesso vai até `parcelado_ate`. É o
 *    que o Termo de Adesão diz, com essas palavras.
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
    .select(
      "id, asaas_subscription_id, due_date, billing_cycle, asaas_installment_id, asaas_installment_renovacao_id, parcelado_ate",
    )
    .eq("id", holdingId)
    .maybeSingle()
  if (!h) return { ok: false, message: "Empresa não encontrada." }

  const agora = new Date().toISOString()

  if (h.asaas_subscription_id) {
    try {
      await asaasCancelSubscription(h.asaas_subscription_id)
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "Erro ao cancelar no Asaas.",
      }
    }

    /* Acesso segue até o FIM do período pago. Antes isto usava o `due_date`
     * cru — que, vindo do webhook, é o INÍCIO do período — e quem cancelava
     * era suspenso na hora, apesar da tela prometer "até o fim do período". */
    const fimPeriodo =
      fimDoPeriodo(
        (h.due_date as string | null) ?? null,
        cicloDoBanco(h.billing_cycle),
        null,
      ) ?? todayISO()
    await admin
      .from("holdings")
      .update({
        asaas_subscription_id: null,
        paid: false,
        suspend_on: fimPeriodo,
        asaas_last_event: { event: "SUBSCRIPTION_CANCELED", at: agora },
      })
      .eq("id", holdingId)
    // Termo aceito que nunca vigorou (não pagou) perde o efeito.
    await cancelarAdesoesPendentes(holdingId)

    revalidatePath("/assinatura")
    revalidatePath("/", "layout")
    return { ok: true }
  }

  const inst = (h.asaas_installment_id as string | null) ?? null
  const renov = (h.asaas_installment_renovacao_id as string | null) ?? null
  if (!inst && !renov)
    return { ok: false, message: "Nenhuma assinatura ativa pra cancelar." }

  try {
    // Renovação já emitida e não paga: sai. (Paga, ela já teria virado a vigente.)
    if (renov) await asaasDeleteInstallment(renov)

    /* O parcelamento vigente foi pago? O termo dele entra em vigor na 1ª
     * confirmação do Asaas — é o sinal mais firme que temos sem consultar a
     * API, e é exatamente o fato que importa: houve pagamento. */
    let pago = false
    if (inst) {
      const { data: vig } = await admin
        .from("contratos_assinatura")
        .select("id")
        .eq("holding_id", holdingId)
        .eq("asaas_ref", inst)
        .eq("status", "vigente")
        .limit(1)
      pago = (vig ?? []).length > 0
    }

    if (inst && !pago) {
      await asaasDeleteInstallment(inst)
      await admin
        .from("holdings")
        .update({
          asaas_installment_id: null,
          asaas_installment_renovacao_id: null,
          parcelado_ate: null,
          parcelado_nao_renovar: false,
          asaas_last_event: { event: "INSTALLMENT_REMOVED", at: agora },
        })
        .eq("id", holdingId)
      await cancelarAdesoesPendentes(holdingId)
    } else {
      // Pago: acaba em `parcelado_ate`, sem renovar. O cron de vencimentos
      // rebaixa o `paid` nessa data e a suspensão já está marcada.
      await admin
        .from("holdings")
        .update({
          asaas_installment_renovacao_id: null,
          parcelado_nao_renovar: true,
          suspend_on: (h.parcelado_ate as string | null) ?? todayISO(),
          asaas_last_event: { event: "RENOVACAO_12X_CANCELADA", at: agora },
        })
        .eq("id", holdingId)
    }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Erro ao cancelar no Asaas.",
    }
  }

  revalidatePath("/assinatura")
  revalidatePath("/", "layout")
  return { ok: true }
}
