/**
 * Módulo Sales (Order) — Merchant API do iFood.
 *
 * Endpoint mínimo pra homologação: GET de um pedido por id. Validamos:
 *   - Token funcional
 *   - Header x-request-homologation em sandbox
 *   - 401 → re-auth, 429/5xx → backoff (no client.ts)
 *
 * Em produção, esse mesmo endpoint vira a base do receiver de webhooks
 * de pedido (futuro).
 */
import "server-only"

import { fetchIfood, type IfoodFetchResult } from "./client"

/** Resposta simplificada do iFood pra um pedido — campos que importam pra audit. */
export type IfoodOrder = {
  id: string
  displayId?: string
  createdAt?: string
  orderType?: string
  orderTiming?: string
  isTest?: boolean
  total?: {
    orderAmount?: number
    subTotal?: number
    deliveryFee?: number
    benefits?: number
  }
  merchant?: {
    id: string
    name?: string
  }
  customer?: {
    id?: string
    name?: string
  }
  // raw guarda o JSON inteiro (útil pra debug/log)
  _raw?: unknown
}

/**
 * GET /order/v1.0/orders/{id}
 * Retorna o pedido cru + metadados da chamada (status, retries, duração).
 */
export async function getIfoodOrder(
  orderId: string,
): Promise<IfoodFetchResult<IfoodOrder>> {
  return fetchIfood<IfoodOrder>({
    path: `/order/v1.0/orders/${encodeURIComponent(orderId)}`,
    method: "GET",
    responseType: "json",
    endpointLabel: "GET /order/v1.0/orders/{id}",
  })
}
