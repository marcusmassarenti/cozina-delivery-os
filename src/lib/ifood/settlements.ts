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

/**
 * Repasses do merchant no período.
 *
 * ⚠️ Os parâmetros NÃO são `beginDate`/`endDate` — era o que mandávamos, e a
 * API respondia 400 com a lista dos nomes certos. Falhava em silêncio (o
 * chamador só via "não ok"), então ninguém percebeu. Achado em 03/ago/26
 * enquanto eu procurava uma fonte de CNPJ pro auto-vínculo.
 *
 * A API aceita dois recortes, e são coisas diferentes:
 *   - `calculo`   (padrão) → `beginCalculationDate`/`endCalculationDate`:
 *     quando as vendas foram APURADAS. É o que casa com a competência.
 *   - `pagamento`          → `beginPaymentDate`/`endPaymentDate`:
 *     quando o dinheiro CAIU na conta. Use pra conciliar extrato bancário.
 */
export async function getSettlements(
  merchantId: string,
  beginDate: string,
  endDate: string,
  por: "calculo" | "pagamento" = "calculo",
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
  const query =
    por === "pagamento"
      ? { beginPaymentDate: beginDate, endPaymentDate: endDate }
      : { beginCalculationDate: beginDate, endCalculationDate: endDate }
  return fetchIfood<IfoodSettlementsResponse>({
    path,
    method: "GET",
    query,
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
