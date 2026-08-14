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
  /** Detalhe usa `status` (AVAILABLE/UNAVAILABLE/DISABLED); a lista não traz. */
  status?: string
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

/** Uma página da listagem. Quem quer a lista inteira usa `listAllIfoodMerchants`. */
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

/** Teto de páginas. 50 × 100 = 5.000 lojas; acima disso é laço maluco, não rede. */
const MAX_PAGINAS = 50

/**
 * TODAS as lojas do app, percorrendo as páginas até acabar.
 *
 * Existe porque a versão anterior pedia UMA página de 100 e tratava o
 * resultado como a lista inteira. Hoje são 67 lojas e funciona — na 101ª
 * pararia de ver o resto, calada. E o resultado desta lista é o que decide
 * quais lojas vinculam e quais entram no sync: uma loja fora dela some do
 * sistema sem nenhum erro aparecer em lugar nenhum.
 *
 * É o mesmo tipo de corte silencioso que já mordeu este projeto duas vezes
 * (a `.limit()` que mostrava "45 lojas" numa rede de 56). Truncar sem avisar
 * é pior que falhar: falha a gente vê.
 */
export async function listAllIfoodMerchants(): Promise<
  IfoodFetchResult<IfoodMerchantList>
> {
  const TAMANHO = 100
  const todos: IfoodMerchant[] = []
  let ultima: IfoodFetchResult<IfoodMerchantList> | null = null

  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const r = await listIfoodMerchants({ page, size: TAMANHO })
    ultima = r
    // Falha no meio NÃO devolve lista parcial como se fosse completa: quem
    // chama trataria 30 lojas como "as que existem" e desvincularia o resto.
    if (!r.ok || !r.data) return r
    todos.push(...r.data)
    if (r.data.length < TAMANHO) break
  }

  return { ...(ultima as IfoodFetchResult<IfoodMerchantList>), data: todos }
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
