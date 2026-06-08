/**
 * Financial API do 99 Food — repasse/conciliação (Settlements + Bill).
 *
 * ⚠️ É um sub-sistema SEPARADO do operacional:
 *   - Host diferente: https://openapi.99food.com (não openapi.didi-food.com)
 *   - Auth próprio (app-level, NÃO por loja): POST /v3/auth/authtoken/signIn
 *     body { retailer: app_id, secret: app_secret } → { accessToken, expiresIn }
 *
 * Reusa as mesmas credenciais (NINEFOOD_APP_ID / NINEFOOD_APP_SECRET).
 */
import "server-only"

const FIN_BASE = "https://openapi.99food.com"
const SAFETY_MS = 5 * 60 * 1000 // renova 5 min antes de expirar

let tokenCache: { token: string; expiresAt: number } | null = null

function creds(): { appId: string; appSecret: string } {
  const appId = process.env.NINEFOOD_APP_ID
  const appSecret = process.env.NINEFOOD_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error(
      "Faltam NINEFOOD_APP_ID / NINEFOOD_APP_SECRET nas variáveis de ambiente.",
    )
  }
  return { appId, appSecret }
}

type SignInResponse = {
  errno?: number
  errmsg?: string
  // a resposta pode vir no topo ou aninhada em data — tratamos os dois.
  accessToken?: string
  expiresIn?: number
  data?: { accessToken?: string; expiresIn?: number } | null
}

/**
 * Devolve um accessToken válido da Financial API (app-level), cacheado.
 * POST /v3/auth/authtoken/signIn com { retailer, secret }.
 */
export async function getNinefoodFinancialToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + SAFETY_MS) {
    return tokenCache.token
  }
  const { appId, appSecret } = creds()
  const res = await fetch(`${FIN_BASE}/v3/auth/authtoken/signIn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ retailer: appId, secret: appSecret }),
    cache: "no-store",
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Financial auth 99 HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  let json: SignInResponse
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Financial auth 99: resposta não-JSON: ${text.slice(0, 300)}`)
  }
  if (json.errno != null && json.errno !== 0) {
    throw new Error(`Financial auth 99 errno ${json.errno}: ${json.errmsg ?? ""}`)
  }
  const token = json.data?.accessToken ?? json.accessToken
  const expiresIn = json.data?.expiresIn ?? json.expiresIn
  if (!token) {
    throw new Error(
      `Financial auth 99: sem accessToken. Resposta: ${JSON.stringify(json).slice(0, 300)}`,
    )
  }
  // expiresIn = duração em segundos (assumido). Guard pra valores absurdos.
  const ttlMs =
    typeof expiresIn === "number" && expiresIn > 0 && expiresIn < 86_400 * 7
      ? expiresIn * 1000
      : 60 * 60 * 1000
  tokenCache = { token, expiresAt: Date.now() + ttlMs }
  return token
}

/** Limpa o cache do token financeiro (testes / após erro). */
export function clearNinefoodFinancialCache(): void {
  tokenCache = null
}

// ───────────────────────── Bill Data (getShopBillDetail) ─────────────────────
//
// Extrato financeiro pedido-a-pedido. ⚠️ "Special Authorization Needed":
// o app precisa ter a permissão liberada pela 99 (pedida por e-mail).
// TODOS os valores monetários vêm em CENTAVOS (int). Divida por 100 pra ter R$.
// commissionRate vem em 1/100 de % (ex.: 3500 = 35,00%).

/** orderType do Bill Data. */
export const NINEFOOD_ORDER_TYPE = {
  1: "Receita do pedido",
  2: "Reembolso do pedido",
  3: "Reembolso parcial (na venda)",
  4: "Reembolso pós-venda",
  5: "Pedido sem acompanhamento (ex.: taxa mensal)",
} as const

export type NinefoodBillRow = {
  shopId: number
  shopName: string
  contractorId: number
  contractorName: string
  cityId: number
  cityName: string
  orderId: string
  orderIndex: string
  /** 1 receita · 2 reembolso · 3 reembolso parcial · 4 pós-venda · 5 sem acompanhamento */
  orderType: number
  /** 0 sem entrega · 1 entrega plataforma · 2 entrega loja · 20 terceiro */
  deliveryType: number
  businessTs: number
  businessDateTime: string
  mealOriginalAmount: number
  shopActivityOutcome: number
  shopActivitySubsidy: number
  shopDeliveryAmount: number
  shopPreTips: number
  freeDeliveryOutcome: number
  freeDeliverySubsidy: number
  commissionBaseAmount: number
  /** 1/100 de % → 3500 = 35% */
  commissionRate: number
  commissionAmount: number
  commissionSubsidyAmount: number
  b2pDeliveryAmount: number
  payCommissionAmount: number
  minValueDifferenceAmount: number
  orderAmount: number
  paymentMethod: number
  paymentChannel: number
  paymentMethodDetail: number
  cardBrand: string
  cancelDateTime: string
  cancelTs: number
  cancelReason: number
  cashBalance: number
  mealVoucherAmount: number
  /** ⭐ líquido a repassar pra loja nesta transação (centavos) */
  settlementAmount: number
  expectSettleDate: string
  dayPaymentId: string
  mealLossDeductAmount: number
  vatAmount: number
  merchantAppealAmount: number
  monthlyServicePrice?: number
  gmv?: number
  monthlyServiceBasePrice?: number
  monthlyServiceCalculationCycle?: string
}

type BillResponse = {
  errno?: number
  errmsg?: string
  requestId?: string
  data?: {
    data?: NinefoodBillRow[]
    total_num?: number
    total_page?: number
    page_size?: number
    page_no?: number
  } | null
}

export type BillPage = {
  rows: NinefoodBillRow[]
  totalNum: number
  totalPage: number
  pageNo: number
}

const FIN_FINANCE = `${FIN_BASE}/v3/finance/finance`

/**
 * Uma página do extrato financeiro de uma loja (app_shop_id) num período.
 * Datas em YYYYMMDD. Período máx 31 dias, até 3 meses atrás. page_size máx 200.
 */
export async function getShopBillDetail(opts: {
  appShopId: string
  startDate: string
  endDate: string
  pageNo?: number
  pageSize?: number
}): Promise<BillPage> {
  const token = await getNinefoodFinancialToken()
  const res = await fetch(`${FIN_FINANCE}/getShopBillDetail`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      acceptor_code: opts.appShopId,
      page_no: opts.pageNo ?? 1,
      page_size: Math.min(opts.pageSize ?? 200, 200),
      start_date: opts.startDate,
      end_date: opts.endDate,
    }),
    cache: "no-store",
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Bill 99 HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  let json: BillResponse
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Bill 99: resposta não-JSON: ${text.slice(0, 300)}`)
  }
  if (json.errno != null && json.errno !== 0) {
    throw new Error(`Bill 99 errno ${json.errno}: ${json.errmsg ?? ""}`)
  }
  const d = json.data ?? {}
  return {
    rows: d.data ?? [],
    totalNum: d.total_num ?? 0,
    totalPage: d.total_page ?? 0,
    pageNo: d.page_no ?? opts.pageNo ?? 1,
  }
}

/** Pagina tudo do período (loop por page_no até esgotar). */
export async function getAllShopBillDetail(opts: {
  appShopId: string
  startDate: string
  endDate: string
}): Promise<NinefoodBillRow[]> {
  const all: NinefoodBillRow[] = []
  let pageNo = 1
  for (;;) {
    const { rows, totalPage } = await getShopBillDetail({
      ...opts,
      pageNo,
      pageSize: 200,
    })
    all.push(...rows)
    if (rows.length === 0 || pageNo >= (totalPage || 1)) break
    pageNo++
    if (pageNo > 1000) break // trava de segurança
  }
  return all
}

// ─────────────────── Settlements (getShopBillWeek) ──────────────────────────
//
// Repasse bancário SEMANAL (quando/quanto a 99 deposita). Permissão WhiteList.
// Útil pra conciliação de caixa (bater com o extrato bancário). withdrawAmount
// vem em CENTAVOS. dayPaymentIDList liga aos dayPaymentId do Bill Data.

export type NinefoodSettlement = {
  weekPaymentId: string
  /** data do depósito (ISO-8601) */
  withdrawDate: string
  /** valor depositado (CENTAVOS) */
  withdrawAmount: number
  /** entidade responsável pelo pagamento */
  liability: string
  shopId: number
  /** período coberto (YYYYMMDD) */
  settleStartDate: string
  settleEndDate: string
  currency: string
  /** ids dos settlements diários que compõem este saque */
  dayPaymentIDList: string[]
}

type SettlementResponse = {
  errno?: number
  errmsg?: string
  data?: {
    data?: NinefoodSettlement[]
    total_num?: number
    total_page?: number
    page_size?: number
    page_no?: number
  } | null
}

/** Uma página dos repasses semanais de uma loja. Datas YYYYMMDD (máx 31 dias). */
export async function getShopBillWeek(opts: {
  appShopId: string
  startDate: string
  endDate: string
  pageNo?: number
  pageSize?: number
}): Promise<{
  rows: NinefoodSettlement[]
  totalNum: number
  totalPage: number
  pageNo: number
}> {
  const token = await getNinefoodFinancialToken()
  const res = await fetch(`${FIN_FINANCE}/getShopBillWeek`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      acceptor_code: opts.appShopId,
      page_no: opts.pageNo ?? 1,
      page_size: Math.min(opts.pageSize ?? 200, 200),
      start_date: opts.startDate,
      end_date: opts.endDate,
    }),
    cache: "no-store",
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Settlements 99 HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  let json: SettlementResponse
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Settlements 99: resposta não-JSON: ${text.slice(0, 300)}`)
  }
  if (json.errno != null && json.errno !== 0) {
    throw new Error(`Settlements 99 errno ${json.errno}: ${json.errmsg ?? ""}`)
  }
  const d = json.data ?? {}
  return {
    rows: d.data ?? [],
    totalNum: d.total_num ?? 0,
    totalPage: d.total_page ?? 0,
    pageNo: d.page_no ?? opts.pageNo ?? 1,
  }
}
