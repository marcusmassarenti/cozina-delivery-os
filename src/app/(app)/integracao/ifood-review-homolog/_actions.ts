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

/** Avaliação estruturada pra RENDERIZAR na tela (homologação exige tudo visual,
 * não JSON). Achata os aninhados (customer/order) pra facilitar o componente. */
export type ReviewDetail = {
  id: string
  orderId?: string
  orderShortId?: string
  score?: number
  comment?: string
  status?: string
  visibility?: string
  createdAt?: string
  publishedAt?: string
  customerName?: string
  replies?: { text?: string; addedAt?: string }[]
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
    /** Lista das avaliações — completa o suficiente pra exibir cada uma. */
    reviews?: ReviewDetail[]
    /** Detalhe de UMA avaliação (Cenário 2) — renderizado visualmente. */
    detail?: ReviewDetail
    /** Texto da resposta que acabou de ser enviada (Cenário 3). */
    sentReply?: string
    /** Eco dos parâmetros usados na listagem (pro vídeo mostrar o filtro). */
    sizeUsed?: number
    dateFrom?: string
    dateTo?: string
  }
  error?: string
}

/** IfoodReview (com aninhados) → ReviewDetail achatado pra a tela. */
function toDetail(r: IfoodReview): ReviewDetail {
  return {
    id: r.id,
    orderId: r.orderId ?? r.order?.id,
    orderShortId: r.order?.shortId,
    score: r.score,
    comment: r.comment,
    status: r.status,
    visibility: r.visibility,
    createdAt: r.createdAt ?? r.order?.createdAt,
    publishedAt: r.publishedAt,
    customerName: r.customer?.name,
    replies: (r.replies ?? []).map((x) => ({ text: x.text, addedAt: x.addedAt })),
  }
}

/** Lista avaliações (página 1, addCount) e deriva os critérios de homologação. */
export async function probeReviews(
  _prev: ReviewProbeState,
  formData: FormData,
): Promise<ReviewProbeState> {
  await guard()
  const merchantId =
    String(formData.get("merchantId") ?? "").trim() || REVIEW_TEST_MERCHANT
  // size: a API limita a 50 por página (param `pageSize`; >50 → HTTP 400).
  // dateFrom/dateTo: filtro por data, opcionais (o lib normaliza pra ISO).
  const size = Math.max(1, Math.min(50, Number(formData.get("size")) || 10))
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

/**
 * Critério de homologação: pedir MAIS de 50 por página deve devolver
 * 400 "page size can't exceed 50". Aqui o 400 é o resultado ESPERADO (ok=true).
 */
export async function probeOversizePage(
  _prev: ReviewProbeState,
  formData: FormData,
): Promise<ReviewProbeState> {
  await guard()
  const merchantId =
    String(formData.get("merchantId") ?? "").trim() || REVIEW_TEST_MERCHANT
  try {
    const r = await getReviewsPage(merchantId, {
      page: 1,
      size: 100,
      addCount: true,
      unclamped: true, // envia pageSize=100 cru pra forçar o 400
    })
    const esperado = r.status === 400
    return {
      ok: esperado,
      status: r.status,
      raw: r.raw.slice(0, 2000),
      error: esperado ? undefined : `Esperava HTTP 400 (limite 50), veio ${r.status}`,
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
      meta: r.ok && r.data ? { detail: toDetail(r.data) } : undefined,
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
    // Deu certo → relê a avaliação pra mostrar na tela o status REPLIED + a
    // resposta publicada (fluxo completo visível, sem depender de JSON).
    let detail: ReviewDetail | undefined
    if (r.ok) {
      try {
        const d = await getReview(merchantId, reviewId)
        if (d.ok && d.data) detail = toDetail(d.data)
      } catch {
        /* se falhar a releitura, mantém o resto do resultado */
      }
    }
    return {
      ok: r.ok,
      status: r.status,
      raw: r.raw.slice(0, 4000),
      error: r.ok ? undefined : r.error,
      meta: r.ok ? { sentReply: text, detail } : undefined,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Responder com texto inválido — aqui o 400 é o resultado ESPERADO (ok=true):
 * a API recusa "reply should not be blank" / "minimum of 10 and a max of 300".
 */
export async function probeReplyInvalid(
  _prev: ReviewProbeState,
  formData: FormData,
): Promise<ReviewProbeState> {
  await guard()
  const merchantId =
    String(formData.get("merchantId") ?? "").trim() || REVIEW_TEST_MERCHANT
  const reviewId = String(formData.get("reviewId") ?? "").trim()
  const text = String(formData.get("text") ?? "")
  if (!reviewId) return { ok: false, error: "Informe o reviewId." }
  try {
    const r = await replyToReview(merchantId, reviewId, text)
    const esperado = r.status === 400
    return {
      ok: esperado,
      status: r.status,
      raw: r.raw.slice(0, 2000),
      error: esperado
        ? undefined
        : `Esperava HTTP 400 (texto inválido recusado), veio ${r.status}`,
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
    reviews: reviews.slice(0, 10).map(toDetail),
  }
}
