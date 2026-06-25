/**
 * Review API v2 — iFood Merchant API (módulo Avaliações).
 *
 * Endpoints (app "review"):
 *   GET  /review/v2.0/merchants/{merchantId}/reviews?page&size&addCount&dateFrom&dateTo
 *   GET  /review/v2.0/merchants/{merchantId}/reviews/{reviewId}
 *   GET  /review/v2.0/merchants/{merchantId}/summary
 *   POST /review/v2.0/merchants/{merchantId}/reviews/{reviewId}/answers   { text }
 *
 * ⚠️ V1 está DESCONTINUADO (410 Gone) — sempre V2.
 *
 * Ciclo de vida da avaliação (homologação testa todos):
 *   CREATED → NOT_REPLIED → REPLIED → PUBLISHED
 *   - Avaliação tem janela interna de ~24h antes de poder ser respondida.
 *   - Só responde quem está em NOT_REPLIED.
 *   - Não respondida vira PUBLISHED automaticamente em ~5 dias.
 *
 * Doc: https://developer.ifood.com.br/pt-BR/docs/guides/modules/review/
 */
import "server-only"

import { fetchIfood, type IfoodFetchResult } from "./client"

const BASE = "/review/v2.0/merchants"

/** Resposta (réplica) do lojista a uma avaliação. */
export type IfoodReviewReply = {
  text?: string
  addedAt?: string
}

/** Uma avaliação do iFood (campos opcionais — o layout varia por versão). */
export type IfoodReview = {
  id: string
  orderId?: string
  score?: number // 1..5
  comment?: string
  /** CREATED | NOT_REPLIED | REPLIED | PUBLISHED */
  status?: string
  /** PUBLIC | PRIVATE */
  visibility?: string
  version?: string
  createdAt?: string
  publishedAt?: string
  replies?: IfoodReviewReply[]
  customer?: { id?: string; name?: string }
  order?: { id?: string; shortId?: string; createdAt?: string }
  moderation?: unknown
}

export type IfoodReviewsPage = {
  page: number
  size: number
  /** Só vem quando addCount=true. */
  total?: number
  pageCount?: number
  reviews: IfoodReview[]
}

export type ReviewListOpts = {
  page?: number
  /** Itens por página. ⚠️ A API envia como `pageSize` (não `size` — esse é
   *  ignorado!) e o MÁX é 50 (acima → HTTP 400 "page size can't exceed 50").
   *  Validado ao vivo contra a sandbox. Clampado pra 1..50 antes de enviar. */
  size?: number
  /** Inclui total/pageCount na resposta. */
  addCount?: boolean
  /** Filtro de data (YYYY-MM-DD). */
  dateFrom?: string
  dateTo?: string
  /** ASC | DESC */
  sort?: "ASC" | "DESC"
}

/**
 * O filtro de data do GET /reviews exige ISO-8601 com HORA (`...T00:00:00.000Z`).
 * Mandar só `YYYY-MM-DD` devolve HTTP 400 (validado contra a sandbox). Por isso
 * normalizamos: data-only vira início (from) ou fim (to) do dia, em UTC.
 */
function toIsoDay(d: string | undefined, edge: "start" | "end"): string | undefined {
  if (!d) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return edge === "start" ? `${d}T00:00:00.000Z` : `${d}T23:59:59.999Z`
  }
  return d // já veio com hora — repassa como está
}

/** GET de uma página de avaliações. */
export async function getReviewsPage(
  merchantId: string,
  opts: ReviewListOpts = {},
): Promise<IfoodFetchResult<IfoodReviewsPage>> {
  return fetchIfood<IfoodReviewsPage>({
    app: "review",
    path: `${BASE}/${encodeURIComponent(merchantId)}/reviews`,
    method: "GET",
    query: {
      page: Math.max(1, opts.page ?? 1),
      // ⚠️ É `pageSize` (não `size`) e clampado a 1..50 — a API recusa >50.
      pageSize: Math.min(50, Math.max(1, opts.size ?? 10)),
      addCount: opts.addCount ?? true,
      dateFrom: toIsoDay(opts.dateFrom, "start"),
      dateTo: toIsoDay(opts.dateTo, "end"),
      sort: opts.sort,
    },
    responseType: "json",
    merchantId,
    endpointLabel: "GET /review/v2.0/merchants/{id}/reviews",
  })
}

export type FetchAllReviewsResult = {
  ok: boolean
  reviews: IfoodReview[]
  total?: number
  pagesFetched: number
  firstStatus?: number
  error?: string
}

/** Itera a paginação até esvaziar (guard de maxPages). */
export async function fetchAllReviews(
  merchantId: string,
  opts: { size?: number; maxPages?: number; dateFrom?: string; dateTo?: string } = {},
): Promise<FetchAllReviewsResult> {
  // Clampa a 50 (máx da API). Sem isso, pedir size>50 quebraria o break de
  // paginação (batch.length < size nunca falsearia → para na 1ª página).
  const size = Math.min(50, Math.max(1, opts.size ?? 10))
  const maxPages = opts.maxPages ?? 50
  const reviews: IfoodReview[] = []
  let page = 1
  let pagesFetched = 0
  let firstStatus: number | undefined
  let total: number | undefined

  while (page <= maxPages) {
    const r = await getReviewsPage(merchantId, {
      page,
      size,
      addCount: page === 1,
      dateFrom: opts.dateFrom,
      dateTo: opts.dateTo,
    })
    if (firstStatus === undefined) firstStatus = r.status
    if (!r.ok || !r.data) {
      return {
        ok: false,
        reviews,
        total,
        pagesFetched,
        firstStatus,
        error: r.error ?? `HTTP ${r.status}`,
      }
    }
    if (page === 1) total = r.data.total
    pagesFetched++
    const batch = r.data.reviews ?? []
    reviews.push(...batch)
    if (batch.length < size) break
    page++
  }

  return { ok: true, reviews, total, pagesFetched, firstStatus }
}

/** Detalhe de uma avaliação. */
export async function getReview(
  merchantId: string,
  reviewId: string,
): Promise<IfoodFetchResult<IfoodReview>> {
  return fetchIfood<IfoodReview>({
    app: "review",
    path: `${BASE}/${encodeURIComponent(merchantId)}/reviews/${encodeURIComponent(reviewId)}`,
    method: "GET",
    responseType: "json",
    merchantId,
    endpointLabel: "GET /review/v2.0/merchants/{id}/reviews/{reviewId}",
  })
}

/** Resumo/desempenho de avaliações da loja (nota média, distribuição). */
export type IfoodReviewSummary = {
  score?: number
  totalReviewsCount?: number
  totalCommentsCount?: number
  distribution?: Record<string, number>
}

export async function getReviewSummary(
  merchantId: string,
): Promise<IfoodFetchResult<IfoodReviewSummary>> {
  return fetchIfood<IfoodReviewSummary>({
    app: "review",
    path: `${BASE}/${encodeURIComponent(merchantId)}/summary`,
    method: "GET",
    responseType: "json",
    merchantId,
    endpointLabel: "GET /review/v2.0/merchants/{id}/summary",
  })
}

/**
 * Responde uma avaliação. Só funciona em avaliações com status NOT_REPLIED.
 * Body esperado pelo iFood: { text }.
 */
export async function replyToReview(
  merchantId: string,
  reviewId: string,
  text: string,
): Promise<IfoodFetchResult<unknown>> {
  return fetchIfood<unknown>({
    app: "review",
    path: `${BASE}/${encodeURIComponent(merchantId)}/reviews/${encodeURIComponent(reviewId)}/answers`,
    method: "POST",
    body: { text },
    responseType: "json",
    merchantId,
    endpointLabel: "POST /review/v2.0/merchants/{id}/reviews/{reviewId}/answers",
  })
}
