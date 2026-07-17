import "server-only"

/**
 * Cliente HTTP mínimo pro gateway Asaas (assinaturas recorrentes).
 *
 * - Auth: header `access_token` (NÃO é Bearer).
 * - Base: sandbox por padrão. Em produção, definir ASAAS_BASE_URL =
 *   https://api.asaas.com/v3 (o sandbox é https://api-sandbox.asaas.com/v3).
 * - A chave (ASAAS_API_KEY) é segredo — só em .env.local / Vercel, nunca
 *   comitada, nunca com prefixo NEXT_PUBLIC_.
 */

const BASE = (
  process.env.ASAAS_BASE_URL ?? "https://api-sandbox.asaas.com/v3"
).replace(/\/+$/, "")

function apiKey(): string {
  const k = process.env.ASAAS_API_KEY
  if (!k) throw new Error("ASAAS_API_KEY não configurada no ambiente.")
  return k
}

/**
 * Método de cobrança da assinatura. Padrão CREDIT_CARD: é o único que cobra
 * SOZINHO todo mês (cartão fica salvo, Asaas debita automático) — boleto/Pix
 * comum geram uma cobrança que o cliente teria que pagar manualmente a cada
 * ciclo, e boleto ainda leva dias pra compensar. Pra mudar, defina
 * ASAAS_BILLING_TYPE = CREDIT_CARD | PIX | BOLETO | UNDEFINED (todos).
 */
// Pagamento é SEMPRE cartão de crédito (renova sozinho todo mês). Boleto/Pix
// ficam de fora por decisão de produto — não dependemos de env pra isso.
const BILLING_TYPE = "CREDIT_CARD"

/**
 * Modo simulado: sem ASAAS_API_KEY, não batemos na API real — geramos IDs
 * falsos e um "checkout" interno (/assinatura/simulado) pra percorrer o fluxo
 * inteiro sem cobrar de ninguém. Assim que a chave entrar, some sozinho.
 */
export function asaasIsMock(): boolean {
  return !process.env.ASAAS_API_KEY
}

const mockId = (prefix: string) =>
  `mock_${prefix}_${globalThis.crypto.randomUUID().slice(0, 8)}`

type AsaasErrorBody = { errors?: Array<{ code?: string; description?: string }> }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "DeliveryOS",
      access_token: apiKey(),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  })
  const text = await res.text()
  const json: unknown = text ? JSON.parse(text) : {}
  if (!res.ok) {
    const desc = (json as AsaasErrorBody)?.errors?.[0]?.description
    throw new Error(desc ? `Asaas: ${desc}` : `Asaas respondeu ${res.status}.`)
  }
  return json as T
}

export type AsaasCustomer = { id: string }

export async function asaasCreateCustomer(input: {
  name: string
  cpfCnpj: string
  email?: string
  mobilePhone?: string
  externalReference?: string
  // Endereço (necessário pra emissão de Nota Fiscal). Asaas resolve
  // cidade/estado a partir do postalCode.
  postalCode?: string
  address?: string
  addressNumber?: string
  complement?: string
  province?: string
}): Promise<AsaasCustomer> {
  if (asaasIsMock()) return { id: mockId("cus") }
  return call<AsaasCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

/** Dados que compõem a Nota Fiscal (guardados no cliente do Asaas). */
export type AsaasNfFields = {
  name?: string
  cpfCnpj?: string
  email?: string
  mobilePhone?: string
  postalCode?: string
  address?: string
  addressNumber?: string
  complement?: string
  province?: string
}

export type AsaasCustomerFull = AsaasNfFields & {
  id: string
  city?: number | string
  cityName?: string
  state?: string
}

/** Lê o cadastro completo do cliente no Asaas (pra exibir os dados de NF). */
export async function asaasGetCustomer(
  id: string,
): Promise<AsaasCustomerFull | null> {
  if (asaasIsMock()) {
    return {
      id,
      name: "Cliente (simulado)",
      cpfCnpj: "00000000000",
      postalCode: "00000000",
      address: "Rua Exemplo",
      addressNumber: "123",
      province: "Centro",
      cityName: "São Paulo",
      state: "SP",
    }
  }
  try {
    return await call<AsaasCustomerFull>(`/customers/${id}`)
  } catch {
    return null
  }
}

/** Atualiza os dados do cliente no Asaas (Asaas usa POST em /customers/{id}). */
export async function asaasUpdateCustomer(
  id: string,
  input: AsaasNfFields,
): Promise<void> {
  if (asaasIsMock()) return
  await call(`/customers/${id}`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export type AsaasSubscription = { id: string }

export async function asaasCreateSubscription(input: {
  customer: string
  value: number
  nextDueDate: string // YYYY-MM-DD
  cycle: "MONTHLY" | "YEARLY"
  description?: string
  externalReference?: string
}): Promise<AsaasSubscription> {
  if (asaasIsMock()) return { id: mockId("sub") }
  return call<AsaasSubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({ billingType: BILLING_TYPE, ...input }),
  })
}

type AsaasPaymentList = {
  data?: Array<{ invoiceUrl?: string; bankSlipUrl?: string }>
}

/** Link de pagamento (fatura) da 1ª cobrança gerada pela assinatura. */
export async function asaasFirstInvoiceUrl(
  subscriptionId: string,
): Promise<string | null> {
  // Simulado: manda pro checkout interno de teste.
  if (asaasIsMock()) return `/assinatura/simulado?sub=${subscriptionId}`
  const list = await call<AsaasPaymentList>(
    `/subscriptions/${subscriptionId}/payments?limit=10`,
  )
  for (const p of list.data ?? []) {
    if (p.invoiceUrl) return p.invoiceUrl
    if (p.bankSlipUrl) return p.bankSlipUrl
  }
  return null
}

/**
 * Cria uma cobrança AVULSA (fora da assinatura) e devolve o link do checkout
 * hospedado do Asaas. Usado pra vender o pacote de perguntas extras do
 * Consultor IA — o cliente paga na página do Asaas (o cartão nunca passa pelo
 * nosso servidor), e o webhook credita quando confirma.
 *
 * `externalReference` marca a cobrança (ex.: "ia-pack:<holdingId>") pra o
 * webhook saber que é pacote, e NÃO tratar como pagamento de assinatura.
 */
export async function asaasCreatePayment(input: {
  customer: string
  value: number
  dueDate: string // YYYY-MM-DD
  description: string
  externalReference: string
}): Promise<{ id: string; invoiceUrl: string | null }> {
  if (asaasIsMock()) {
    return { id: mockId("pay"), invoiceUrl: `/assinatura/simulado?pack=1` }
  }
  const p = await call<{ id: string; invoiceUrl?: string }>("/payments", {
    method: "POST",
    body: JSON.stringify({ billingType: BILLING_TYPE, ...input }),
  })
  return { id: p.id, invoiceUrl: p.invoiceUrl ?? null }
}

/** Nota fiscal (NFS-e) emitida pelo Asaas. `pdfUrl`/`xmlUrl` só vêm quando a
 *  nota já foi autorizada pela prefeitura (status AUTHORIZED). */
export type AsaasInvoice = {
  id: string
  /** SCHEDULED | SYNCHRONIZED | AUTHORIZED | CANCELED | ERROR | ... */
  status?: string | null
  number?: string | null
  value?: number | null
  effectiveDate?: string | null // YYYY-MM-DD
  pdfUrl?: string | null
  xmlUrl?: string | null
  serviceDescription?: string | null
}

/**
 * Notas fiscais do cliente no Asaas, pro PORTAL do lojista (mais recentes
 * primeiro).
 *
 * Esconde as canceladas: pro cliente elas são ruído — não valem como
 * documento e não tem o que fazer com elas. (Pra ver TODAS, incluindo as
 * canceladas, é o painel do Asaas.)
 *
 * Falha "de leve": se o módulo de NF não estiver configurado ou a API der erro,
 * devolve lista vazia — a tela só não mostra notas, nunca quebra.
 */
export async function asaasListInvoices(
  customerId: string,
): Promise<AsaasInvoice[]> {
  if (asaasIsMock()) return []
  try {
    const list = await call<{ data?: AsaasInvoice[] }>(
      `/invoices?customer=${encodeURIComponent(customerId)}&limit=24`,
    )
    return (list.data ?? [])
      .filter((n) => n.status !== "CANCELED" && n.status !== "ERROR")
      .sort((a, b) =>
        (b.effectiveDate ?? "").localeCompare(a.effectiveDate ?? ""),
      )
  } catch {
    return []
  }
}

/**
 * Lê a config de emissão automática de uma assinatura. É a FONTE DA VERDADE
 * sobre "essa assinatura emite nota sozinha?" — a lista de notas agendadas é
 * só um reflexo dela, e cancelar uma nota não apaga a config.
 * Devolve null se a assinatura não tem config (ou se o Asaas devolveu erro).
 */
export async function asaasGetSubscriptionInvoiceSettings(
  subscriptionId: string,
): Promise<Record<string, unknown> | null> {
  if (asaasIsMock()) return null
  try {
    return await call<Record<string, unknown>>(
      `/subscriptions/${subscriptionId}/invoiceSettings`,
    )
  } catch {
    return null
  }
}

/**
 * Serviço municipal cadastrado no painel do Asaas (Configurações fiscais →
 * Serviços cadastrados). É de onde sai o código que vai na nota.
 */
export type AsaasMunicipalService = {
  id?: string | null
  description?: string | null
  issTax?: number | null
}

/** Lista os serviços municipais da conta — usado pra conferir o código certo. */
export async function asaasListMunicipalServices(): Promise<
  AsaasMunicipalService[]
> {
  if (asaasIsMock()) return []
  const list = await call<{ data?: AsaasMunicipalService[] }>(
    "/invoices/municipalServices?limit=50",
  )
  return list.data ?? []
}

/**
 * Liga a emissão AUTOMÁTICA de nota fiscal numa assinatura.
 *
 * Sem isso, ter o módulo de NF configurado na conta só permite emitir na mão,
 * uma por uma. Esta config é POR ASSINATURA: manda o Asaas emitir sozinho a
 * cada cobrança, no período definido em `effectiveDatePeriod`.
 *
 * `taxes` é obrigatório na API — os valores vêm de FISCAL (asaas/fiscal.ts),
 * espelhando o serviço padrão cadastrado no painel.
 */
export async function asaasSetSubscriptionInvoiceSettings(
  subscriptionId: string,
  input: {
    municipalServiceId?: string
    municipalServiceCode?: string
    municipalServiceName?: string
    observations?: string
    deductions?: number
    effectiveDatePeriod?:
      | "ON_PAYMENT_CONFIRMATION"
      | "ON_PAYMENT_DUE_DATE"
      | "BEFORE_PAYMENT_DUE_DATE"
      | "ON_DUE_DATE_MONTH"
      | "ON_NEXT_MONTH"
    receivedOnly?: boolean
    taxes: {
      retainIss: boolean
      iss: number
      cofins: number
      csll: number
      inss: number
      ir: number
      pis: number
    }
  },
): Promise<void> {
  if (asaasIsMock()) return
  await call(`/subscriptions/${subscriptionId}/invoiceSettings`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

/** Cancela a assinatura recorrente no Asaas (para de cobrar). */
export async function asaasCancelSubscription(
  subscriptionId: string,
): Promise<void> {
  if (asaasIsMock()) return
  await call(`/subscriptions/${subscriptionId}`, { method: "DELETE" })
}
