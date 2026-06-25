"use server"

import { isSuperadmin } from "@/lib/auth/permissions"
import {
  fetchAllReviews,
  getReview,
  getReviewSummary,
  getReviewsPage,
  replyToReview,
  type IfoodReview,
} from "@/lib/ifood/review"

/** Loja sandbox do app de teste (a única que o app de teste enxerga). */
const REVIEW_TEST_MERCHANT = "500f2b4d-1807-4a9c-9e7d-93e87c128891"

async function guard() {
  if (!(await isSuperadmin())) throw new Error("Sem permissão")
}

export type ReviewProbeState = {
  ok: boolean
  status?: number
  /** JSON cru pra exibição. */
  raw?: string
  /** Métricas/criterios derivados. */
  meta?: {
    total?: number
    pageCount?: number
    count?: number
    statuses?: string[]
    visibilities?: string[]
    firstReviewId?: string | null
    hasReplies?: boolean
    /** Eco dos parâmetros usados na listagem (pro vídeo mostrar o filtro). */
    sizeUsed?: number
    dateFrom?: string
    dateTo?: string
  }
  error?: string
}

/** Lista avaliações (página 1, addCount) e deriva os critérios de homologação. */
export async function probeReviews(
  _prev: ReviewProbeState,
  formData: FormData,
): Promise<ReviewProbeState> {
  await guard()
  const merchantId =
    String(formData.get("merchantId") ?? "").trim() || REVIEW_TEST_MERCHANT
  // size: livre (o checklist pede testar o limite de página = 100). dateFrom/
  // dateTo: filtro por data (YYYY-MM-DD), opcionais.
  const size = Math.max(1, Math.min(100, Number(formData.get("size")) || 10))
  const dateFrom = String(formData.get("dateFrom") ?? "").trim() || undefined
  const dateTo = String(formData.get("dateTo") ?? "").trim() || undefined
  try {
    const r = await getReviewsPage(merchantId, {
      page: 1,
      size,
      addCount: true,
      dateFrom,
      dateTo,
    })
    if (!r.ok || !r.data) {
      return { ok: false, status: r.status, raw: r.raw, error: r.error }
    }
    const reviews = r.data.reviews ?? []
    return {
      ok: true,
      status: r.status,
      raw: r.raw.slice(0, 4000),
      meta: {
        ...deriveMeta(reviews, r.data.total, r.data.pageCount),
        sizeUsed: size,
        dateFrom,
        dateTo,
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Detalhe de uma avaliação. */
export async function probeReviewDetail(
  _prev: ReviewProbeState,
  formData: FormData,
): Promise<ReviewProbeState> {
  await guard()
  const merchantId =
    String(formData.get("merchantId") ?? "").trim() || REVIEW_TEST_MERCHANT
  const reviewId = String(formData.get("reviewId") ?? "").trim()
  if (!reviewId) return { ok: false, error: "Informe o reviewId." }
  try {
    const r = await getReview(merchantId, reviewId)
    return {
      ok: r.ok,
      status: r.status,
      raw: r.raw.slice(0, 4000),
      error: r.ok ? undefined : r.error,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Resumo/desempenho da loja. */
export async function probeSummary(
  _prev: ReviewProbeState,
  formData: FormData,
): Promise<ReviewProbeState> {
  await guard()
  const merchantId =
    String(formData.get("merchantId") ?? "").trim() || REVIEW_TEST_MERCHANT
  try {
    const r = await getReviewSummary(merchantId)
    // 404 "Summary not found" é esperado quando a loja não tem avaliações.
    return {
      ok: r.ok || r.status === 404,
      status: r.status,
      raw: r.raw.slice(0, 4000),
      error: r.ok || r.status === 404 ? undefined : r.error,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Responde uma avaliação (só funciona em NOT_REPLIED). */
export async function probeReply(
  _prev: ReviewProbeState,
  formData: FormData,
): Promise<ReviewProbeState> {
  await guard()
  const merchantId =
    String(formData.get("merchantId") ?? "").trim() || REVIEW_TEST_MERCHANT
  const reviewId = String(formData.get("reviewId") ?? "").trim()
  // NÃO faz trim aqui: o caso "texto inválido" do checklist precisa enviar
  // texto vazio/inválido pra demonstrar a recusa DA API (não um bloqueio nosso).
  const text = String(formData.get("text") ?? "")
  if (!reviewId) return { ok: false, error: "Informe o reviewId." }
  try {
    const r = await replyToReview(merchantId, reviewId, text)
    return {
      ok: r.ok,
      status: r.status,
      raw: r.raw.slice(0, 4000),
      error: r.ok ? undefined : r.error,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Roda tudo (paginação completa) e devolve um panorama dos critérios. */
export async function probeAll(
  _prev: ReviewProbeState,
  formData: FormData,
): Promise<ReviewProbeState> {
  await guard()
  const merchantId =
    String(formData.get("merchantId") ?? "").trim() || REVIEW_TEST_MERCHANT
  try {
    const all = await fetchAllReviews(merchantId, { size: 10, maxPages: 20 })
    if (!all.ok) {
      return { ok: false, status: all.firstStatus, error: all.error }
    }
    return {
      ok: true,
      status: all.firstStatus,
      raw: JSON.stringify(all.reviews.slice(0, 5), null, 2),
      meta: {
        ...deriveMeta(all.reviews, all.total, undefined),
        count: all.reviews.length,
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

function deriveMeta(
  reviews: IfoodReview[],
  total?: number,
  pageCount?: number,
): ReviewProbeState["meta"] {
  const statuses = [
    ...new Set(reviews.map((r) => r.status).filter(Boolean) as string[]),
  ]
  const visibilities = [
    ...new Set(reviews.map((r) => r.visibility).filter(Boolean) as string[]),
  ]
  return {
    total,
    pageCount,
    count: reviews.length,
    statuses,
    visibilities,
    firstReviewId: reviews[0]?.id ?? null,
    hasReplies: reviews.some((r) => (r.replies?.length ?? 0) > 0),
  }
}
