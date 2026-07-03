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
const BILLING_TYPE = (process.env.ASAAS_BILLING_TYPE ?? "CREDIT_CARD").toUpperCase()

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
  cycle: "MONTHLY"
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

/** Cancela a assinatura recorrente no Asaas (para de cobrar). */
export async function asaasCancelSubscription(
  subscriptionId: string,
): Promise<void> {
  if (asaasIsMock()) return
  await call(`/subscriptions/${subscriptionId}`, { method: "DELETE" })
}
