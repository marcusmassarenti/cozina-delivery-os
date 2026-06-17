/**
 * Anticipation API v3 — iFood Pago / Merchant API.
 *
 * Antecipações dos repasses (planos D+1 ou D+7). Estrutura igual ao Settlement
 * mas com campos extra: feePercentage, feeAmount, originalPaymentDate,
 * anticipatedPaymentDate.
 *
 * Endpoint:
 *   GET /financial/v3.0/merchants/{merchantId}/anticipations
 *   ?beginCalculationDate=YYYY-MM-DD&endCalculationDate=YYYY-MM-DD
 *   OU ?beginAnticipatedPaymentDate=...&endAnticipatedPaymentDate=...
 *
 * Doc: https://developer.ifood.com.br/pt-BR/docs/guides/modules/financial/api-anticipation/
 */
import "server-only"

import { fetchIfood, type IfoodFetchResult } from "./client"

const ANTI_PATH_TPL = "/financial/v3.0/merchants/{merchantId}/anticipations"

export type IfoodAnticipationItem = {
  type?: string
  originalPaymentAmount?: number
  feePercentage?: number
  feeAmount?: number
  anticipatedPaymentAmount?: number
  status?: string
  accountDetails?: {
    bankName?: string
    bankNumber?: string
    branchCode?: string
    accountNumber?: string
    accountDigit?: string
  }
  originalPaymentDate?: string
  anticipatedPaymentDate?: string
}

export type IfoodAnticipationPeriod = {
  startDateCalculation?: string
  endDateCalculation?: string
  closingItems?: IfoodAnticipationItem[]
}

export type IfoodAnticipationsResponse = {
  beginDate?: string
  endDate?: string
  balance?: number
  merchantId?: string
  settlements?: IfoodAnticipationPeriod[]
}

export async function getAnticipations(
  merchantId: string,
  beginDate: string,
  endDate: string,
): Promise<IfoodFetchResult<IfoodAnticipationsResponse>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(beginDate)) {
    throw new Error(`beginDate deve ser YYYY-MM-DD (recebido: ${beginDate})`)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error(`endDate deve ser YYYY-MM-DD (recebido: ${endDate})`)
  }
  const path = ANTI_PATH_TPL.replace(
    "{merchantId}",
    encodeURIComponent(merchantId),
  )
  return fetchIfood<IfoodAnticipationsResponse>({
    path,
    method: "GET",
    query: {
      beginCalculationDate: beginDate,
      endCalculationDate: endDate,
    },
    responseType: "json",
    merchantId,
    endpointLabel: "GET /financial/v3.0/merchants/{id}/anticipations",
  })
}

export type AnticipationsMetrics = {
  countItems: number
  sumOriginal: number
  sumFee: number
  sumAnticipated: number
  byStatus: Record<string, number>
}

export function summarizeAnticipations(
  resp: IfoodAnticipationsResponse,
): AnticipationsMetrics {
  let countItems = 0
  let sumOriginal = 0
  let sumFee = 0
  let sumAnticipated = 0
  const byStatus: Record<string, number> = {}
  for (const period of resp.settlements ?? []) {
    for (const it of period.closingItems ?? []) {
      countItems++
      sumOriginal += Number(it.originalPaymentAmount ?? 0)
      sumFee += Number(it.feeAmount ?? 0)
      sumAnticipated += Number(it.anticipatedPaymentAmount ?? 0)
      const s = it.status ?? "UNKNOWN"
      byStatus[s] = (byStatus[s] ?? 0) + 1
    }
  }
  return { countItems, sumOriginal, sumFee, sumAnticipated, byStatus }
}
