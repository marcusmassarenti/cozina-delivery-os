/**
 * Autenticação na API do iFood — modelo CENTRALIZADO (client_credentials).
 *
 * Uma credencial única (clientId/clientSecret, em env var) acessa todos os
 * merchants da rede. O token (bearer) expira em algumas horas; cacheamos em
 * memória e renovamos por demanda.
 *
 * Credenciais NUNCA no banco nem no client — só em env var server-only.
 */
import "server-only"

const TOKEN_URL =
  "https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token"

type TokenCache = { accessToken: string; expiresAt: number }
let cache: TokenCache | null = null

/** Margem de segurança: renova 5 min antes de expirar. */
const SAFETY_MS = 5 * 60 * 1000

/**
 * Devolve um access token válido do iFood (cacheado). Lança erro claro se as
 * credenciais não estiverem configuradas ou se o iFood recusar.
 */
export async function getIfoodToken(): Promise<string> {
  if (cache && cache.expiresAt > Date.now() + SAFETY_MS) {
    return cache.accessToken
  }

  const clientId = process.env.IFOOD_CLIENT_ID
  const clientSecret = process.env.IFOOD_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error(
      "Faltam IFOOD_CLIENT_ID / IFOOD_CLIENT_SECRET nas variáveis de ambiente.",
    )
  }

  // iFood usa form-urlencoded com campos em camelCase.
  const body = new URLSearchParams({
    grantType: "client_credentials",
    clientId,
    clientSecret,
  })

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  })

  if (!res.ok) {
    const txt = await res.text().catch(() => "")
    throw new Error(`Auth iFood falhou (HTTP ${res.status}): ${txt.slice(0, 300)}`)
  }

  const json = (await res.json()) as {
    accessToken?: string
    expiresIn?: number
    type?: string
  }
  if (!json.accessToken) {
    throw new Error("Auth iFood: resposta sem accessToken.")
  }

  cache = {
    accessToken: json.accessToken,
    expiresAt: Date.now() + (json.expiresIn ?? 10800) * 1000,
  }
  return cache.accessToken
}

/** Limpa o cache do token (útil em testes / após erro de 401). */
export function clearIfoodTokenCache(): void {
  cache = null
}
