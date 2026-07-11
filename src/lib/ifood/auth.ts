/**
 * Autenticação na API do iFood — modelo CENTRALIZADO (client_credentials).
 *
 * A rede tem MAIS DE UM app no iFood (cada app = uma categoria de módulos):
 *   - "financial" → conciliação + merchant  (app Delivery OS)
 *   - "review"    → avaliações              (app Delivery OS — Avaliações)
 *
 * Cada app tem credenciais próprias. Em homologação, o app é trocado pelo
 * "app de teste" do iFood (que tem TODOS os módulos + a loja sandbox), via as
 * env vars IFOOD_TEST_*. O token (bearer) expira em horas; cacheamos por app.
 *
 * Credenciais NUNCA no banco nem no client — só em env var server-only.
 */
import "server-only"

const TOKEN_URL =
  "https://merchant-api.ifood.com.br/authentication/v1.0/oauth/token"

/** Apps registrados da rede no iFood. */
export type IfoodApp = "financial" | "review"

type TokenCache = { accessToken: string; expiresAt: number }
const cache: Partial<Record<IfoodApp, TokenCache>> = {}

/** Margem de segurança: renova 5 min antes de expirar. */
const SAFETY_MS = 5 * 60 * 1000

/**
 * Esse app está em homologação? (usa o app de teste do iFood)
 *   - financial: IFOOD_HOMOLOGATION === "true" (legado; hoje produção)
 *   - review: em homologação por padrão até IFOOD_REVIEW_HOMOLOGATION="false"
 *     (o app de produção do Review só funciona depois de aprovado + lojas
 *     vinculadas; antes disso, sempre cai no app de teste).
 */
export function isAppHomologation(app: IfoodApp): boolean {
  if (app === "review") {
    return process.env.IFOOD_REVIEW_HOMOLOGATION !== "false"
  }
  return process.env.IFOOD_HOMOLOGATION === "true"
}

type ResolvedCreds = {
  clientId: string | undefined
  clientSecret: string | undefined
  /** rótulo pra mensagem de erro */
  missingMsg: string
}

/** Trim defensivo: um espaço/newline acidental na env var não deve virar um
 * "400 Client secret is mandatory" confuso — vira erro claro de credencial. */
function envTrim(v: string | undefined): string | undefined {
  const t = v?.trim()
  return t ? t : undefined
}

/** Resolve qual par de credenciais usar pra um app, considerando homologação. */
function resolveCredentials(app: IfoodApp): ResolvedCreds {
  if (isAppHomologation(app)) {
    return {
      clientId: envTrim(process.env.IFOOD_TEST_CLIENT_ID),
      clientSecret: envTrim(process.env.IFOOD_TEST_CLIENT_SECRET),
      missingMsg:
        "Faltam IFOOD_TEST_CLIENT_ID / IFOOD_TEST_CLIENT_SECRET (app de teste / homologação).",
    }
  }
  if (app === "review") {
    return {
      clientId: envTrim(process.env.IFOOD_REVIEW_CLIENT_ID),
      clientSecret: envTrim(process.env.IFOOD_REVIEW_CLIENT_SECRET),
      missingMsg:
        "Faltam IFOOD_REVIEW_CLIENT_ID / IFOOD_REVIEW_CLIENT_SECRET (app de Avaliações).",
    }
  }
  return {
    clientId: envTrim(process.env.IFOOD_CLIENT_ID),
    clientSecret: envTrim(process.env.IFOOD_CLIENT_SECRET),
    missingMsg: "Faltam IFOOD_CLIENT_ID / IFOOD_CLIENT_SECRET nas variáveis de ambiente.",
  }
}

/**
 * Devolve um access token válido do iFood (cacheado por app). Lança erro claro
 * se as credenciais não estiverem configuradas ou se o iFood recusar.
 */
export async function getIfoodToken(app: IfoodApp = "financial"): Promise<string> {
  const cached = cache[app]
  if (cached && cached.expiresAt > Date.now() + SAFETY_MS) {
    return cached.accessToken
  }

  const { clientId, clientSecret, missingMsg } = resolveCredentials(app)
  if (!clientId || !clientSecret) {
    throw new Error(missingMsg)
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

  cache[app] = {
    accessToken: json.accessToken,
    expiresAt: Date.now() + (json.expiresIn ?? 10800) * 1000,
  }
  return json.accessToken
}

/** Limpa o cache do token (de um app específico, ou de todos). */
export function clearIfoodTokenCache(app?: IfoodApp): void {
  if (app) {
    delete cache[app]
  } else {
    delete cache.financial
    delete cache.review
  }
}
