/**
 * Settlements API v3 — iFood Merchant API.
 *
 * Endpoint:
 *   GET /financial/v3.0/merchants/{merchantId}/settlements
 *   ?beginDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *
 * Consolida o resultado financeiro de um período em "títulos" (REPASSE,
 * BOLETO, REGISTRO_RECEBIVEIS, RENEGOCIADA) — cada título é uma transação
 * bancária real ou um registro de retenção.
 *
 * Doc: https://developer.ifood.com.br/pt-BR/docs/guides/modules/financial/api-settlement/
 */
import "server-only"

import { fetchIfood, type IfoodFetchResult } from "./client"

const SETTLEMENTS_PATH_TPL = "/financial/v3.0/merchants/{merchantId}/settlements"

export type IfoodSettlementItem = {
  id?: string
  type?: "REPASSE" | "BOLETO" | "REGISTRO_RECEBIVEIS" | "RENEGOCIADA" | string
  product?: string
  amount?: number
  status?: string
  transactionId?: string
  accountDetails?: {
    bankName?: string
    bankNumber?: string
    branchCode?: string
    accountNumber?: string
    accountDigit?: string
    documentNumber?: string
  }
  paymentDate?: string
  originDetails?: unknown
}

export type IfoodSettlementPeriod = {
  startDateCalculation?: string
  endDateCalculation?: string
  closingItems?: IfoodSettlementItem[]
}

export type IfoodSettlementsResponse = {
  beginDate?: string
  endDate?: string
  balance?: number
  merchantId?: string
  settlements?: IfoodSettlementPeriod[]
}

export async function getSettlements(
  merchantId: string,
  beginDate: string,
  endDate: string,
): Promise<IfoodFetchResult<IfoodSettlementsResponse>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(beginDate)) {
    throw new Error(`beginDate deve ser YYYY-MM-DD (recebido: ${beginDate})`)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new Error(`endDate deve ser YYYY-MM-DD (recebido: ${endDate})`)
  }
  const path = SETTLEMENTS_PATH_TPL.replace(
    "{merchantId}",
    encodeURIComponent(merchantId),
  )
  return fetchIfood<IfoodSettlementsResponse>({
    path,
    method: "GET",
    query: { beginDate, endDate },
    responseType: "json",
    merchantId,
    endpointLabel: "GET /financial/v3.0/merchants/{id}/settlements",
  })
}

export type SettlementsMetrics = {
  countItems: number
  byType: Record<string, { count: number; sum: number }>
  byStatus: Record<string, number>
}

export function summarizeSettlements(
  resp: IfoodSettlementsResponse,
): SettlementsMetrics {
  const byType: Record<string, { count: number; sum: number }> = {}
  const byStatus: Record<string, number> = {}
  let countItems = 0
  for (const period of resp.settlements ?? []) {
    for (const it of period.closingItems ?? []) {
      countItems++
      const t = it.type ?? "UNKNOWN"
      const s = it.status ?? "UNKNOWN"
      if (!byType[t]) byType[t] = { count: 0, sum: 0 }
      byType[t].count++
      byType[t].sum += Number(it.amount ?? 0)
      byStatus[s] = (byStatus[s] ?? 0) + 1
    }
  }
  return { countItems, byType, byStatus }
}
