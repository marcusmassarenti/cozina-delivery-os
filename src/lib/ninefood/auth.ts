/**
 * Autenticação na API do 99 Food (DiDi Food Open Platform).
 *
 * Modelo (diferente do iFood): a credencial do app (app_id/app_secret) é usada
 * pra obter um **auth_token POR LOJA** (app_shop_id). As chamadas de loja
 * (pedidos, cardápio, financeiro) usam esse auth_token.
 *
 * Endpoints (https://openapi.didi-food.com):
 *   GET /v1/auth/authtoken/get?app_id&app_secret&app_shop_id     → auth_token
 *   GET /v1/auth/authtoken/refresh?app_id&app_secret&app_shop_id → gera novo
 *
 * Credenciais NUNCA no banco nem no client — só env var server-only.
 */
import "server-only"

const BASE = "https://openapi.didi-food.com"
const SAFETY_MS = 5 * 60 * 1000 // renova 5 min antes de expirar

type TokenCache = { token: string; expiresAt: number }
// Cache POR LOJA (app_shop_id), em memória do servidor.
const cache = new Map<string, TokenCache>()

function creds(): { appId: string; appSecret: string } {
  const appId = process.env.NINEFOOD_APP_ID
  const appSecret = process.env.NINEFOOD_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error(
      "Faltam NINEFOOD_APP_ID / NINEFOOD_APP_SECRET nas variáveis de ambiente.",
    )
  }
  return { appId, appSecret }
}

type StandardResponse = {
  errno?: number
  errmsg?: string
  data?: {
    auth_token?: string
    token_expiration_time?: number
  } | null
}

async function callAuth(
  path: "get" | "refresh",
  appShopId: string,
): Promise<StandardResponse> {
  const { appId, appSecret } = creds()
  const url = new URL(`${BASE}/v1/auth/authtoken/${path}`)
  url.searchParams.set("app_id", appId)
  url.searchParams.set("app_secret", appSecret)
  url.searchParams.set("app_shop_id", appShopId)

  const res = await fetch(url, { method: "GET", cache: "no-store" })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Auth 99 (${path}) HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  let json: StandardResponse
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Auth 99 (${path}): resposta não-JSON: ${text.slice(0, 300)}`)
  }
  if (json.errno != null && json.errno !== 0) {
    throw new Error(`Auth 99 (${path}) errno ${json.errno}: ${json.errmsg ?? ""}`)
  }
  return json
}

/**
 * Devolve um auth_token válido da loja (app_shop_id), cacheado. Se ainda não
 * houver token (ou expirou), tenta um refresh antes.
 */
export async function getNinefoodAuthToken(appShopId: string): Promise<string> {
  const cached = cache.get(appShopId)
  if (cached && cached.expiresAt > Date.now() + SAFETY_MS) return cached.token

  // Tenta pegar o token. Se a autorização da loja expirou (errno 10102) ou
  // ainda não há token, faz um refresh e tenta de novo — assim a auth se
  // auto-renova (o token da loja dura ~dias e expira sozinho).
  let json: StandardResponse | null = null
  try {
    json = await callAuth("get", appShopId)
  } catch {
    json = null // ex.: "store authorization expired" → resolve com refresh
  }
  if (!json?.data?.auth_token) {
    await callAuth("refresh", appShopId)
    json = await callAuth("get", appShopId)
  }
  const token = json.data?.auth_token
  if (!token) {
    throw new Error(
      `Auth 99: loja ${appShopId} sem auth_token (loja vinculada/autorizada?).`,
    )
  }
  const expSec = json.data?.token_expiration_time
  const expiresAt = expSec ? expSec * 1000 : Date.now() + 60 * 60 * 1000
  cache.set(appShopId, { token, expiresAt })
  return token
}

/** Gera um token novo pra loja (refresh) e devolve. */
export async function refreshNinefoodAuthToken(
  appShopId: string,
): Promise<string> {
  await callAuth("refresh", appShopId)
  cache.delete(appShopId)
  return getNinefoodAuthToken(appShopId)
}

/** Limpa o cache (testes / após erro). */
export function clearNinefoodTokenCache(): void {
  cache.clear()
}
