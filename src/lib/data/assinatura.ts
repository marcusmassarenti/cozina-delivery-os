import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentHoldingId } from "@/lib/auth/permissions"
import { aplicarDescontos, type DescontoNegociado } from "@/lib/data/descontos"
import {
  computeBillingStatus,
  daysUntil,
  effectiveTrialEnd,
  todayISO,
  type BillingStatus,
} from "@/lib/data/billing"
import {
  ACRESCIMO_12X_PADRAO,
  cicloDoBanco,
  mesesDoCiclo,
  valorCobranca,
  valorMensalExibido,
  type BillingCycle,
  type RegraCiclos,
} from "@/lib/pricing"

/**
 * Preço da assinatura self-service — POR LOJA, em três planos (bate com a
 * landing): Essencial, Pro e DeliveryOS AI. Mensalidade = preço-por-loja ×
 * nº de lojas ativas.
 *
 * Clientes que o DONO cobra na mão (holdings.monthly_fee preenchido) seguem
 * pela conta antiga (base + lojas extras) e não escolhem plano.
 */
export type PlanId = "essencial" | "pro" | "ai"

export const PLANOS_META: Record<PlanId, { label: string; desc: string }> = {
  essencial: { label: "Essencial", desc: "Pra ver seu lucro no delivery" },
  pro: { label: "Pro", desc: "Gestão financeira completa" },
  ai: { label: "DeliveryOS AI", desc: "IA que lê a loja e monta o plano de ação" },
}

/** Preço de um plano: PRIMEIRA loja + cada loja ADICIONAL (base anual/mês). */
export type PrecoPlano = { first: number; add: number }
export type PrecosPlano = Record<PlanId, PrecoPlano>

/** Preços por plano — fallback caso a tabela ainda não tenha as colunas. */
export const PRECO_PADRAO: PrecosPlano = {
  essencial: { first: 49, add: 19 },
  pro: { first: 99, add: 39 },
  ai: { first: 149, add: 49 },
}

/** Preços dos planos (editáveis pelo dono em /plataforma). Modelo "primeira
 *  loja + adicionais": *_per_unit = primeira loja, *_add = cada loja extra. */
export async function getDefaultPlan(): Promise<PrecosPlano> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from("platform_settings")
      .select(
        "essencial_per_unit, essencial_add, pro_per_unit, pro_add, ai_per_unit, ai_add",
      )
      .eq("id", 1)
      .maybeSingle()
    if (!data) return PRECO_PADRAO
    const num = (v: unknown, fb: number) => (v != null ? Number(v) : fb)
    return {
      essencial: {
        first: num(data.essencial_per_unit, PRECO_PADRAO.essencial.first),
        add: num(data.essencial_add, PRECO_PADRAO.essencial.add),
      },
      pro: {
        first: num(data.pro_per_unit, PRECO_PADRAO.pro.first),
        add: num(data.pro_add, PRECO_PADRAO.pro.add),
      },
      ai: {
        first: num(data.ai_per_unit, PRECO_PADRAO.ai.first),
        add: num(data.ai_add, PRECO_PADRAO.ai.add),
      },
    }
  } catch {
    return PRECO_PADRAO
  }
}

/**
 * Acréscimo do anual em 12x sobre a base (editável em Clientes → Preços dos
 * planos). Toda conta que envolve ciclo passa por aqui — ver o aviso em
 * `@/lib/pricing` sobre por que o parâmetro é obrigatório.
 */
export async function getRegraCiclos(): Promise<RegraCiclos> {
  try {
    const { data } = await createAdminClient()
      .from("platform_settings")
      .select("acrescimo_12x_pct")
      .eq("id", 1)
      .maybeSingle()
    const v = data?.acrescimo_12x_pct
    return {
      acrescimo12xPct:
        v != null && !Number.isNaN(Number(v)) ? Number(v) : ACRESCIMO_12X_PADRAO,
    }
  } catch {
    return { acrescimo12xPct: ACRESCIMO_12X_PADRAO }
  }
}

/** Soma meses a uma data YYYY-MM-DD. */
function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

/**
 * Fim do período pago — a data da PRÓXIMA cobrança.
 *
 * ⚠️ `due_date` NÃO significa a mesma coisa em todo lugar. O webhook do Asaas
 * grava o vencimento da cobrança que ACABOU de ser paga (o INÍCIO do período),
 * enquanto o checkout simulado e a cobrança manual gravam o próximo vencimento
 * (o FIM). Ler o início como fim fazia duas coisas erradas: a tela dizia
 * "próxima cobrança: hoje" pra quem acabou de pagar, e a proração do upgrade
 * dava zero — no anual, um ano de plano AI de graça.
 *
 * Então: data no passado é início, e o fim é ela + o ciclo; data no futuro já
 * é o fim. No 12x a resposta é direta: `parcelado_ate`.
 */
export function fimDoPeriodo(
  dueDate: string | null,
  cycle: BillingCycle,
  parceladoAte: string | null,
  hoje = todayISO(),
): string | null {
  if (cycle === "anual_12x") return parceladoAte
  if (!dueDate) return null
  return dueDate < hoje ? addMonths(dueDate, mesesDoCiclo(cycle)) : dueDate
}

/** Mensalidade (base) de um plano = primeira loja + adicional × (lojas − 1). */
export function precoDoPlano(
  precos: PrecosPlano,
  plan: PlanId,
  activeUnits: number,
): number {
  const p = precos[plan]
  const units = Math.max(1, activeUnits)
  return p.first + p.add * (units - 1)
}

export type PlanoOption = {
  id: PlanId
  label: string
  desc: string
  /** Preço da primeira loja e de cada adicional (base anual/mês). */
  first: number
  add: number
  total: number
}

export type PlanoAtual = {
  /** Forma de cobrança no Asaas. "CREDIT_CARD" é o padrão de quem não pediu outra. */
  billingType: string
  holdingId: string
  name: string
  status: BillingStatus
  trialEndsAt: string | null
  activeUnits: number
  /** Preço custom definido pelo dono? (então ignora os planos por loja) */
  precoCustom: boolean
  /** Planos por loja disponíveis (self-service). */
  planos: PlanoOption[]
  /** Plano já escolhido pela empresa (null = ainda não escolheu). */
  selectedPlan: PlanId | null
  /** Valor mensal a cobrar agora (custom, ou plano selecionado/Essencial). */
  mensalidade: number
  /** Nome do plano escolhido (ex.: "Essencial"), se houver. */
  planLabel: string | null
  dueDate: string | null
  paymentMethod: string | null
  customerId: string | null
  subscriptionId: string | null
  /** Ciclo gravado. Nulo no banco = anual (a base). */
  cycle: BillingCycle
  regra: RegraCiclos
  /**
   * Valor por mês DO CICLO: mensal +30%, 12x = a parcela. `mensalidade` é a
   * base e fica como está (o checkout aplica o ciclo que o cliente escolher).
   */
  valorMensalCiclo: number
  /** Fim do período pago = data da próxima cobrança (ver `fimDoPeriodo`). */
  proximaCobranca: string | null
  /** Anual em 12x: parcelamento vigente, fim do período e se vai renovar. */
  installmentId: string | null
  parceladoAte: string | null
  naoRenovar: boolean
  /**
   * Parcelamento esperando pagamento — o do 1º ano (checkout que não terminou)
   * ou a renovação já emitida. Null = nada a pagar no 12x.
   */
  parceladoPendenteId: string | null
  /** Histórico de pagamentos da empresa (mais recentes primeiro). */
  payments: { paidOn: string; amount: number; method: string | null }[]
}

export async function getPlanoAtual(): Promise<PlanoAtual | null> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return null

  const admin = createAdminClient()
  const { data: h } = await admin
    .from("holdings")
    .select(
      "id, name, created_at, monthly_fee, price_per_unit, included_units, plan_tier, pending_plan_tier, due_date, paid, suspend_on, trial_ends_at, payment_method, asaas_customer_id, asaas_subscription_id, asaas_billing_type, billing_cycle, asaas_installment_id, parcelado_ate, asaas_installment_renovacao_id, parcelado_nao_renovar, desconto_tipo, desconto_valor, desconto_ate",
    )
    .eq("id", holdingId)
    .maybeSingle()
  if (!h) return null

  // Lojas ativas da holding (base do cálculo por loja).
  const { data: brands } = await admin
    .from("brands")
    .select("id")
    .eq("holding_id", holdingId)
  const brandIds = (brands ?? []).map((b) => b.id)
  let activeUnits = 0
  if (brandIds.length) {
    const { count } = await admin
      .from("units")
      .select("id", { count: "exact", head: true })
      .in("brand_id", brandIds)
      .eq("active", true)
    activeUnits = count ?? 0
  }

  const precos = await getDefaultPlan()
  const planos: PlanoOption[] = (Object.keys(PLANOS_META) as PlanId[]).map(
    (id) => ({
      id,
      label: PLANOS_META[id].label,
      desc: PLANOS_META[id].desc,
      first: precos[id].first,
      add: precos[id].add,
      total: precoDoPlano(precos, id, activeUnits),
    }),
  )

  const precoCustom = h.monthly_fee != null
  // Plano PAGO (plan_tier) tem prioridade; se ainda não pagou, mostra o
  // escolhido/pendente (pra exibição e cálculo do valor). O que LIBERA as
  // features é só o plan_tier (ver isProPlan/isAiPlan).
  const selectedPlan =
    ((h.plan_tier as PlanId | null) ??
      (h.pending_plan_tier as PlanId | null)) ??
    null

  let mensalidade: number
  if (precoCustom) {
    // Cliente cobrado na mão: base + lojas extras (conta antiga).
    const includedUnits = (h.included_units as number | null) ?? 1
    const pricePerUnit = Number(h.price_per_unit ?? 0)
    const extraUnits = Math.max(0, activeUnits - includedUnits)
    mensalidade = Number(h.monthly_fee) + extraUnits * pricePerUnit
  } else {
    mensalidade = precoDoPlano(precos, selectedPlan ?? "essencial", activeUnits)
  }

  // Trial ANCORADO no cadastro (createdAt + 7): não renova ao cancelar.
  const trialEndsAt = effectiveTrialEnd(
    (h.trial_ends_at as string | null) ?? null,
    (h.created_at as string | null) ?? null,
  )
  const status = computeBillingStatus({
    paymentMethod: (h.payment_method as string | null) ?? null,
    monthlyFee: h.monthly_fee != null ? Number(h.monthly_fee) : null,
    dueDate: (h.due_date as string | null) ?? null,
    paid: (h.paid as boolean | null) ?? true,
    suspendOn: (h.suspend_on as string | null) ?? null,
    trialEndsAt,
  })

  // Histórico de pagamentos da empresa (últimos 12).
  const { data: pagamentos } = await admin
    .from("holding_payments")
    .select("paid_on, amount, method")
    .eq("holding_id", holdingId)
    .order("paid_on", { ascending: false })
    .limit(12)
  const payments = (pagamentos ?? []).map((p) => ({
    paidOn: p.paid_on as string,
    amount: Number(p.amount),
    method: (p.method as string | null) ?? null,
  }))

  const regra = await getRegraCiclos()
  const cycle = cicloDoBanco(h.billing_cycle)
  const hoje = todayISO()
  /* O que o cliente PAGA por mês: ciclo + desconto negociado. Preço combinado
   * não leva multiplicador (já é o valor fechado), mas leva o desconto.
   *
   * Sem o desconto, a tela de Assinatura da Tech Assessoria (AI, 4 lojas,
   * mensal, 20% acordado) mostraria R$ 579,80 enquanto a cobrança sai de
   * R$ 463,84 — o mesmo número que a assinatura do Asaas tem. */
  const negociado: DescontoNegociado = {
    tipo: (h.desconto_tipo ?? null) as DescontoNegociado["tipo"],
    valor: Number(h.desconto_valor ?? 0),
    ate: (h.desconto_ate as string | null) ?? null,
  }
  const valorMensalCiclo = aplicarDescontos(
    precoCustom ? mensalidade : valorMensalExibido(mensalidade, cycle, regra),
    negociado,
    0,
    hoje,
  ).valor
  const parceladoAte = (h.parcelado_ate as string | null) ?? null
  const installmentId = (h.asaas_installment_id as string | null) ?? null
  const renovacaoId = (h.asaas_installment_renovacao_id as string | null) ?? null
  const parceladoPendenteId =
    renovacaoId ??
    (installmentId &&
    status !== "paid" &&
    (!parceladoAte || parceladoAte > hoje)
      ? installmentId
      : null)

  const planLabel = selectedPlan
    ? PLANOS_META[selectedPlan].label
    : precoCustom
      ? "Personalizado"
      : null

  return {
    holdingId,
    name: h.name,
    // Forma de cobrança do cliente. Nulo = cartão (o padrão). A TELA usa isto
    // pra não prometer "pagamento no cartão" pra quem fechou em Pix.
    billingType: (h.asaas_billing_type as string | null) ?? "CREDIT_CARD",
    status,
    trialEndsAt,
    activeUnits,
    precoCustom,
    planos,
    selectedPlan,
    mensalidade,
    planLabel,
    dueDate: (h.due_date as string | null) ?? null,
    paymentMethod: (h.payment_method as string | null) ?? null,
    customerId: (h.asaas_customer_id as string | null) ?? null,
    subscriptionId: (h.asaas_subscription_id as string | null) ?? null,
    cycle,
    regra,
    valorMensalCiclo,
    proximaCobranca: fimDoPeriodo(
      (h.due_date as string | null) ?? null,
      cycle,
      parceladoAte,
      hoje,
    ),
    installmentId,
    parceladoAte,
    naoRenovar: h.parcelado_nao_renovar === true,
    parceladoPendenteId,
    payments,
  }
}

/* ─────────────────────────── UPGRADE DE PLANO ──────────────────────────── */

/** Conta as lojas ativas de uma holding (base do preço por loja). */
async function contarLojasAtivas(holdingId: string): Promise<number> {
  const admin = createAdminClient()
  const { data: brands } = await admin
    .from("brands")
    .select("id")
    .eq("holding_id", holdingId)
  const brandIds = (brands ?? []).map((b) => b.id)
  if (!brandIds.length) return 0
  const { count } = await admin
    .from("units")
    .select("id", { count: "exact", head: true })
    .in("brand_id", brandIds)
    .eq("active", true)
  return count ?? 0
}

/** Valor recorrente (por ciclo) de um plano pra uma holding — respeita o
 *  ciclo (mensal +30% / anual ×12 / 12x = total do ano) e o nº de lojas. Usado pela ação de upgrade
 *  e pelo webhook (pra atualizar o valor da assinatura no Asaas). */
export async function valorAssinaturaDoPlano(
  holdingId: string,
  plan: PlanId,
): Promise<number> {
  const admin = createAdminClient()
  const { data: h } = await admin
    .from("holdings")
    .select("billing_cycle")
    .eq("id", holdingId)
    .maybeSingle()
  const cycle = cicloDoBanco(h?.billing_cycle)
  const units = await contarLojasAtivas(holdingId)
  const [precos, regra] = await Promise.all([getDefaultPlan(), getRegraCiclos()])
  return valorCobranca(precoDoPlano(precos, plan, units), cycle, regra)
}

export type UpgradeAiInfo = {
  /** Pode fazer o upgrade self-service? */
  podeUpgrade: boolean
  motivo: null | "sem-assinatura" | "ja-ai" | "custom"
  planoAtualLabel: string
  units: number
  /** Preço da primeira loja e de cada adicional no plano AI. */
  aiFirst: number
  aiAdd: number
  /** Novo valor recorrente (por ciclo) já com o plano AI. */
  aiValorCiclo: number
  cycle: BillingCycle
  /** Diferença proporcional a cobrar AGORA (dias restantes até renovar). */
  proracaoAgora: number
  dueDate: string | null
}

/** Monta os números do upgrade pro plano AI (exibição + base da cobrança). */
export async function getUpgradeAiInfo(): Promise<UpgradeAiInfo | null> {
  const holdingId = await getCurrentHoldingId()
  if (!holdingId) return null
  const admin = createAdminClient()
  const { data: h } = await admin
    .from("holdings")
    .select(
      "monthly_fee, plan_tier, billing_cycle, due_date, asaas_subscription_id, asaas_installment_id, parcelado_ate",
    )
    .eq("id", holdingId)
    .maybeSingle()
  if (!h) return null

  const cycle = cicloDoBanco(h.billing_cycle)
  const tierAtual = (h.plan_tier as PlanId | null) ?? "essencial"
  const parceladoAte = (h.parcelado_ate as string | null) ?? null
  // A proração corre até o FIM do período (ver `fimDoPeriodo`).
  const dueDate = fimDoPeriodo(
    (h.due_date as string | null) ?? null,
    cycle,
    parceladoAte,
  )
  const units = await contarLojasAtivas(holdingId)
  const [precos, regra] = await Promise.all([getDefaultPlan(), getRegraCiclos()])

  const aiValorCiclo = valorCobranca(precoDoPlano(precos, "ai", units), cycle, regra)
  const atualValorCiclo = valorCobranca(
    precoDoPlano(precos, tierAtual, units),
    cycle,
    regra,
  )

  // Proração: diferença por ciclo × (dias restantes / dias do ciclo).
  const cycleDays = mesesDoCiclo(cycle) === 12 ? 365 : 30
  const restantes = dueDate
    ? Math.max(0, Math.min(cycleDays, daysUntil(dueDate)))
    : cycleDays
  const diff = Math.max(0, aiValorCiclo - atualValorCiclo)
  const proracaoAgora = Math.round(diff * (restantes / cycleDays) * 100) / 100

  let motivo: UpgradeAiInfo["motivo"] = null
  if (h.monthly_fee != null) motivo = "custom"
  else if (
    !h.asaas_subscription_id &&
    !(h.asaas_installment_id && parceladoAte && parceladoAte > todayISO())
  )
    motivo = "sem-assinatura"
  else if (tierAtual === "ai") motivo = "ja-ai"

  return {
    podeUpgrade: motivo === null,
    motivo,
    planoAtualLabel: PLANOS_META[tierAtual].label,
    units,
    aiFirst: precos.ai.first,
    aiAdd: precos.ai.add,
    aiValorCiclo,
    cycle,
    proracaoAgora,
    dueDate,
  }
}
