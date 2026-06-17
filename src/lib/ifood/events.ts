/**
 * Financial Events API v3 — iFood Merchant API.
 *
 * Endpoint:
 *   GET /financial/v3.0/merchants/{merchantId}/financial-events
 *   ?beginDate=YYYY-MM-DD&endDate=YYYY-MM-DD&page=N&size=100
 *
 * Restrições:
 *   - endDate >= beginDate
 *   - intervalo ≤ 33 dias (iFood retorna 400 se exceder)
 *   - recomendado períodos semanais (seg–dom) pra performance
 *
 * Resposta:
 *   { page, size, hasNextPage, financialEvents: [{
 *     name, description, product, trigger, competence,
 *     period: { beginDate, endDate },
 *     reference: { type, id, date },
 *     hasTransferImpact,        ← campo "impacto_no_repasse" no nosso domínio
 *     amount: { value },
 *     billing: { baseValue, feePercentage, installments: {reference, referenceDate} },
 *     settlement: { expectedDate },
 *     receiver: { merchantId, merchantDocument },
 *     payment: { method, brand, liability }
 *   }] }
 *
 * Critérios de homologação:
 *   - Consulta por período ≤ 33 dias ✓
 *   - Paginação completa (itera até hasNextPage=false) ✓
 *   - Trata 401 (reauth via client.ts) e 429/5xx (backoff via client.ts) ✓
 *   - Apresenta tipo+trigger+valor com sinal+data evento+data repasse+impacto ✓
 *
 * Doc: https://developer.ifood.com.br/pt-BR/docs/guides/modules/financial/api-financial-events/
 */
import "server-only"

import { fetchIfood, type IfoodFetchResult } from "./client"

const EVENTS_PATH_TPL = "/financial/v3.0/merchants/{merchantId}/financial-events"

export type IfoodFinancialEvent = {
  name: string
  description?: string
  product?: string
  trigger?: string
  competence?: string
  period?: { beginDate?: string; endDate?: string }
  reference?: { type?: string; id?: string; date?: string }
  hasTransferImpact?: boolean
  amount?: { value?: string | number }
  billing?: {
    baseValue?: string | number
    feePercentage?: string | number
    installments?: { reference?: string; referenceDate?: string }
  }
  settlement?: { expectedDate?: string }
  receiver?: { merchantId?: string; merchantDocument?: string }
  payment?: { method?: string; brand?: string; liability?: string }
}

export type IfoodFinancialEventsPage = {
  page: number
  size: number
  hasNextPage: boolean
  financialEvents: IfoodFinancialEvent[]
}

const MAX_RANGE_DAYS = 33

/** Diferença em dias (calendário) entre 2 datas YYYY-MM-DD, inclusive. */
function daysBetween(begin: string, end: string): number {
  const b = new Date(begin + "T00:00:00Z").getTime()
  const e = new Date(end + "T00:00:00Z").getTime()
  return Math.floor((e - b) / 86_400_000) + 1
}

/** GET de uma página específica. */
export async function getFinancialEventsPage(
  merchantId: string,
  beginDate: string,
  endDate: string,
  page = 1,
  size = 100,
): Promise<IfoodFetchResult<IfoodFinancialEventsPage>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(beginDate)) {
    throw new Error(`beginDate deve ser YYYY-MM-DD (recebido: ${beginDate})`)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error(`endDate deve ser YYYY-MM-DD (recebido: ${endDate})`)
  }
  if (endDate < beginDate) {
    throw new Error("endDate deve ser ≥ beginDate")
  }
  if (daysBetween(beginDate, endDate) > MAX_RANGE_DAYS) {
    throw new Error(
      `Intervalo de ${daysBetween(beginDate, endDate)} dias excede o máximo ` +
        `de ${MAX_RANGE_DAYS} dias do iFood`,
    )
  }
  const path = EVENTS_PATH_TPL.replace(
    "{merchantId}",
    encodeURIComponent(merchantId),
  )
  return fetchIfood<IfoodFinancialEventsPage>({
    path,
    method: "GET",
    query: {
      beginDate,
      endDate,
      page: String(page),
      size: String(size),
    },
    responseType: "json",
    merchantId,
    endpointLabel: "GET /financial/v3.0/merchants/{id}/financial-events",
  })
}

export type FetchAllResult = {
  ok: boolean
  pagesFetched: number
  totalEvents: number
  events: IfoodFinancialEvent[]
  firstStatus?: number
  lastStatus?: number
  totalDurationMs: number
  retries: number
  /** Soma de amount.value onde hasTransferImpact = true (repasse líquido) */
  netTransfer: number
  /** Quantidade de eventos com hasTransferImpact = true / false */
  countImpact: { true: number; false: number }
  error?: string
  rawSample?: string
}

/**
 * Itera paginação até hasNextPage=false. Devolve tudo + métricas.
 *
 * Limita em `maxPages` (default 50) como guard contra loop infinito caso o
 * iFood devolva sempre hasNextPage=true por bug — em homologação isso seria
 * 5000 eventos (50 × 100), volume mais que suficiente pra demonstração.
 */
export async function fetchAllFinancialEvents(
  merchantId: string,
  beginDate: string,
  endDate: string,
  opts: { size?: number; maxPages?: number } = {},
): Promise<FetchAllResult> {
  const size = opts.size ?? 100
  const maxPages = opts.maxPages ?? 50
  const t0 = Date.now()

  let page = 1
  let pagesFetched = 0
  let firstStatus: number | undefined
  let lastStatus: number | undefined
  let retries = 0
  const events: IfoodFinancialEvent[] = []
  let rawSample: string | undefined

  while (page <= maxPages) {
    const r = await getFinancialEventsPage(
      merchantId,
      beginDate,
      endDate,
      page,
      size,
    )
    if (firstStatus === undefined) firstStatus = r.status
    lastStatus = r.status
    retries += r.retries
    if (page === 1) rawSample = r.raw.slice(0, 5_000)

    if (!r.ok || !r.data) {
      return {
        ok: false,
        pagesFetched,
        totalEvents: events.length,
        events,
        firstStatus,
        lastStatus,
        totalDurationMs: Date.now() - t0,
        retries,
        netTransfer: 0,
        countImpact: { true: 0, false: 0 },
        error: r.error ?? `HTTP ${r.status} na página ${page}`,
        rawSample,
      }
    }

    pagesFetched++
    events.push(...(r.data.financialEvents ?? []))
    if (!r.data.hasNextPage) break
    page++
  }

  // Métricas pra demonstração de homologação
  let netTransfer = 0
  let countTrue = 0
  let countFalse = 0
  for (const ev of events) {
    const v = Number(ev.amount?.value ?? 0)
    if (ev.hasTransferImpact === true) {
      countTrue++
      if (Number.isFinite(v)) netTransfer += v
    } else if (ev.hasTransferImpact === false) {
      countFalse++
    }
  }

  return {
    ok: true,
    pagesFetched,
    totalEvents: events.length,
    events,
    firstStatus,
    lastStatus,
    totalDurationMs: Date.now() - t0,
    retries,
    netTransfer,
    countImpact: { true: countTrue, false: countFalse },
    rawSample,
  }
}
