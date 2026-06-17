/**
 * Merchant API v1 — iFood Merchant API.
 *
 * Lista todos os merchants liberados pra esse app (a Merchant API só
 * retorna lojas que aceitaram o vínculo na conta do iFood). Esse endpoint
 * é o que destrava o auto-preenchimento de `unit_platforms.api_store_id`:
 *
 *   1. Operador chama GET /merchant/v1.0/merchants no painel de admin
 *   2. Cada item da lista vira uma linha em ifood_merchants (cache local)
 *   3. UI mostra cada merchant e oferece "vincular à Unidade X"
 *
 * Doc: https://developer.ifood.com.br/pt-BR/docs/guides/modules/merchant/
 */
import "server-only"

import { fetchIfood, type IfoodFetchResult } from "./client"

/** Resposta do iFood pra um merchant. */
export type IfoodMerchant = {
  id: string
  name?: string
  corporateName?: string
  description?: string
  averageTicket?: number
  takeoutTime?: number
  deliveryTime?: number
  minimumOrderValue?: number
  merchantState?: string
  documents?: {
    CNPJ?: { value?: string; type?: string }
    CPF?: { value?: string; type?: string }
  }
  phones?: string[]
  address?: {
    formattedAddress?: string
    country?: string
    state?: string
    city?: string
    neighborhood?: string
    streetName?: string
    streetNumber?: string
    postalCode?: string
    complement?: string
    reference?: string
    latitude?: number
    longitude?: number
  }
  type?: string
}

/** GET /merchant/v1.0/merchants — lista paginada. */
export type IfoodMerchantList = IfoodMerchant[]

/**
 * Lista todos os merchants associados ao app.
 *
 * O endpoint costuma aceitar paginação (`page`, `size`), mas em apps
 * Centralizados pequenos cabe tudo numa página. Por enquanto pegamos 100
 * — a Onda 3.5 pode acrescentar iteração se a rede crescer.
 */
export async function listIfoodMerchants(
  opts: { page?: number; size?: number } = {},
): Promise<IfoodFetchResult<IfoodMerchantList>> {
  const page = opts.page ?? 1
  const size = opts.size ?? 100
  return fetchIfood<IfoodMerchantList>({
    path: "/merchant/v1.0/merchants",
    method: "GET",
    query: { page: String(page), size: String(size) },
    responseType: "json",
    endpointLabel: "GET /merchant/v1.0/merchants",
  })
}

/** Detalhe de um merchant específico (útil pra debug). */
export async function getIfoodMerchant(
  merchantId: string,
): Promise<IfoodFetchResult<IfoodMerchant>> {
  return fetchIfood<IfoodMerchant>({
    path: `/merchant/v1.0/merchants/${encodeURIComponent(merchantId)}`,
    method: "GET",
    responseType: "json",
    merchantId,
    endpointLabel: "GET /merchant/v1.0/merchants/{id}",
  })
}
