/**
 * Autenticação no Cardápio Web — OAuth 2.0 Authorization Code + PKCE.
 *
 * Modelo (diferente de iFood e 99): a credencial é DO LOJISTA, não nossa.
 * Cada loja autoriza o nosso app no portal dele e devolve um access_token
 * de 2h + refresh_token. Somos um **cliente público**: não existe
 * client_secret, e é justamente por isso que o PKCE é obrigatório — o
 * code_verifier é o que prova que quem troca o código é quem iniciou o
 * fluxo.
 *
 * Uma instalação = uma LOJA. O Cardápio Web não tem endpoint que liste as
 * lojas de uma rede, e um token de uma loja não enxerga outra. Rede de 70
 * lojas = 70 instalações, cada uma com seu par de tokens.
 *
 * Onde mora cada coisa:
 *  - client_id / redirect_uri → env var (é do nosso app, não do lojista)
 *  - access_token / refresh_token → Supabase Vault, via as RPCs da 0102
 *  - code_verifier → cardapioweb_oauth_states, por ~10 min
 */
import "server-only"

import { createHash, randomBytes } from "node:crypto"

import { createAdminClient } from "@/lib/supabase/admin"

export type CwAmbiente = "sandbox" | "producao"

/** Base das chamadas de API (recursos ficam sob /api/partner/v1). */
const BASE_URL: Record<CwAmbiente, string> = {
  sandbox: "https://integracao.sandbox.cardapioweb.com",
  producao: "https://integracao.cardapioweb.com",
}

/** Portal onde o LOJISTA autoriza (tela de consentimento). */
const PORTAL_URL: Record<CwAmbiente, string> = {
  sandbox: "https://portal.sandbox.cardapioweb.com/cw-apps",
  producao: "https://www.portal.cardapioweb.com/cw-apps",
}

/** Renova o token 5 min antes de expirar, pra não estourar no meio de um sync. */
const SAFETY_MS = 5 * 60 * 1000
/** O state/PKCE vale 10 min — tempo de o lojista concluir o consentimento. */
export const STATE_TTL_MS = 10 * 60 * 1000

export function cwBaseUrl(ambiente: CwAmbiente): string {
  return BASE_URL[ambiente]
}

/**
 * O cadastro em sandbox e em produção é independente no Cardápio Web —
 * são client_ids diferentes, por isso a env var é por ambiente.
 */
export function cwClientId(ambiente: CwAmbiente): string {
  const key =
    ambiente === "producao"
      ? "CARDAPIOWEB_CLIENT_ID"
      : "CARDAPIOWEB_CLIENT_ID_SANDBOX"
  const value = process.env[key]
  if (!value) {
    throw new Error(
      `Falta ${key} nas variáveis de ambiente (client_id do app no Cardápio Web).`,
    )
  }
  return value
}

/**
 * Precisa ser IDÊNTICA à cadastrada no app — o Cardápio Web compara string
 * a string e recusa divergência.
 */
export function cwRedirectUri(): string {
  const value = process.env.CARDAPIOWEB_REDIRECT_URI
  if (!value) {
    throw new Error(
      "Falta CARDAPIOWEB_REDIRECT_URI (deve bater exatamente com a cadastrada no app).",
    )
  }
  return value
}

// ─── PKCE ───────────────────────────────────────────────────────────────

function base64url(buf: Buffer): string {
  return buf.toString("base64url")
}

/** Verifier: 43–128 chars. 32 bytes em base64url dá 43. */
export function gerarCodeVerifier(): string {
  return base64url(randomBytes(32))
}

/** Challenge = base64url(SHA-256(verifier)) — método S256. */
export function gerarCodeChallenge(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest())
}

/** State: protege contra CSRF e amarra o callback ao pedido que o originou. */
export function gerarState(): string {
  return base64url(randomBytes(24))
}

/**
 * Monta a URL do portal pra onde o lojista é redirecionado.
 *
 * Os escopos NÃO vão na URL: eles vêm do cadastro do app no Cardápio Web,
 * e o portal concede todos os que o app pediu. Escopo faltando vira 403 na
 * hora da chamada, não aqui.
 */
export function montarUrlAutorizacao(p: {
  ambiente: CwAmbiente
  state: string
  codeChallenge: string
}): string {
  const url = new URL(PORTAL_URL[p.ambiente])
  url.searchParams.set("client_id", cwClientId(p.ambiente))
  url.searchParams.set("redirect_uri", cwRedirectUri())
  url.searchParams.set("state", p.state)
  url.searchParams.set("code_challenge", p.codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")
  return url.toString()
}

// ─── Troca e renovação de token ─────────────────────────────────────────

type TokenResponse = {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  scope?: string
}

export type CwTokens = {
  accessToken: string
  refreshToken: string | null
  /** Quando o access_token expira (já com o expires_in aplicado). */
  expiresAt: Date
  scopes: string[]
}

/** O endpoint de token é form-urlencoded, não JSON. */
async function postToken(
  ambiente: CwAmbiente,
  form: Record<string, string>,
): Promise<CwTokens> {
  const res = await fetch(`${BASE_URL[ambiente]}/api/partner/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(form).toString(),
    cache: "no-store",
  })

  const texto = await res.text()
  if (!res.ok) {
    throw new Error(
      `Cardápio Web recusou o token (HTTP ${res.status}): ${texto.slice(0, 300)}`,
    )
  }

  let json: TokenResponse
  try {
    json = JSON.parse(texto) as TokenResponse
  } catch {
    throw new Error(
      `Resposta de token do Cardápio Web não é JSON: ${texto.slice(0, 200)}`,
    )
  }
  if (!json.access_token) {
    throw new Error("Resposta de token do Cardápio Web veio sem access_token.")
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 7200) * 1000),
    scopes: json.scope ? json.scope.split(/[\s,]+/).filter(Boolean) : [],
  }
}

/** Passo final do fluxo: authorization_code + code_verifier → tokens. */
export async function trocarCodigoPorTokens(p: {
  ambiente: CwAmbiente
  code: string
  codeVerifier: string
}): Promise<CwTokens> {
  return postToken(p.ambiente, {
    grant_type: "authorization_code",
    code: p.code,
    redirect_uri: cwRedirectUri(),
    client_id: cwClientId(p.ambiente),
    code_verifier: p.codeVerifier,
  })
}

export async function renovarTokens(p: {
  ambiente: CwAmbiente
  refreshToken: string
}): Promise<CwTokens> {
  return postToken(p.ambiente, {
    grant_type: "refresh_token",
    refresh_token: p.refreshToken,
    client_id: cwClientId(p.ambiente),
  })
}

/** Revoga o acesso (usado quando o cliente desconecta a loja). */
export async function revogarToken(p: {
  ambiente: CwAmbiente
  token: string
}): Promise<boolean> {
  const res = await fetch(`${BASE_URL[p.ambiente]}/api/partner/oauth/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      token: p.token,
      client_id: cwClientId(p.ambiente),
    }).toString(),
    cache: "no-store",
  })
  return res.ok
}

// ─── Persistência (Vault) ───────────────────────────────────────────────

export async function salvarTokens(
  installId: string,
  tokens: CwTokens,
): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.rpc("cardapioweb_salvar_tokens", {
    p_install_id: installId,
    p_access: tokens.accessToken,
    p_refresh: tokens.refreshToken,
    p_expires_at: tokens.expiresAt.toISOString(),
  })
  if (error) {
    throw new Error(`Falha ao guardar tokens no Vault: ${error.message}`)
  }
}

type TokensDoBanco = {
  access_token: string | null
  refresh_token: string | null
  expires_at: string | null
}

async function lerTokens(installId: string): Promise<TokensDoBanco | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc("cardapioweb_ler_tokens", {
    p_install_id: installId,
  })
  if (error) {
    throw new Error(`Falha ao ler tokens do Vault: ${error.message}`)
  }
  const linha = Array.isArray(data) ? data[0] : data
  return (linha as TokensDoBanco | undefined) ?? null
}

/**
 * Devolve um access_token válido pra instalação, renovando se estiver
 * perto de vencer (ou já vencido).
 *
 * Se o refresh falhar, a instalação é desativada com o motivo registrado —
 * normalmente significa que o lojista desinstalou o app ou revogou o
 * acesso, e insistir só gera erro em loop no cron.
 */
export async function getAccessToken(p: {
  installId: string
  ambiente: CwAmbiente
  /** Renova mesmo que o prazo não tenha vencido — usado no 401. */
  forcar?: boolean
}): Promise<string> {
  const atual = await lerTokens(p.installId)
  if (!atual?.access_token) {
    throw new Error(
      `Instalação ${p.installId} não tem token guardado — refazer a conexão.`,
    )
  }

  const expiraEm = atual.expires_at ? new Date(atual.expires_at).getTime() : 0
  const aindaVale = expiraEm - SAFETY_MS > Date.now()
  if (aindaVale && !p.forcar) return atual.access_token

  if (!atual.refresh_token) {
    throw new Error(
      `Token da instalação ${p.installId} expirou e não há refresh_token — refazer a conexão.`,
    )
  }

  try {
    const novos = await renovarTokens({
      ambiente: p.ambiente,
      refreshToken: atual.refresh_token,
    })
    await salvarTokens(p.installId, novos)
    return novos.accessToken
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "falha no refresh"
    await desativarInstall(p.installId, motivo)
    throw new Error(
      `Não consegui renovar o token da instalação ${p.installId}: ${motivo}`,
    )
  }
}

// ─── Headers de autenticação (os dois modos) ────────────────────────────

export type CwAuthMode = "oauth" | "api_key"

/**
 * O token da INTEGRADORA (modo legado). Diferente do token da loja, esse é
 * nosso e vale pra todas — por isso env var, não banco. Só é exigido em
 * catálogo, formas de pagamento e criação de pedido.
 */
function partnerKey(): string | null {
  return process.env.CARDAPIOWEB_PARTNER_KEY ?? null
}

/**
 * Monta o cabeçalho de autenticação conforme o modo da instalação.
 *
 * - oauth   → `Authorization: Bearer`, renovando quando perto de vencer
 * - api_key → `X-API-KEY` com o token da loja (não expira, nada a renovar)
 *
 * `forcar` só faz sentido no OAuth; no legado um 401 significa token
 * inválido de verdade, e insistir não resolve.
 */
export async function montarHeadersAuth(p: {
  installId: string
  ambiente: CwAmbiente
  authMode: CwAuthMode
  forcar?: boolean
}): Promise<Record<string, string>> {
  if (p.authMode === "api_key") {
    const atual = await lerTokens(p.installId)
    if (!atual?.access_token) {
      throw new Error(
        `Instalação ${p.installId} está em modo api_key mas não tem token guardado.`,
      )
    }
    const headers: Record<string, string> = { "X-API-KEY": atual.access_token }
    const parceiro = partnerKey()
    if (parceiro) headers["X-PARTNER-KEY"] = parceiro
    return headers
  }

  const token = await getAccessToken({
    installId: p.installId,
    ambiente: p.ambiente,
    forcar: p.forcar,
  })
  return { Authorization: `Bearer ${token}` }
}

export async function desativarInstall(
  installId: string,
  motivo: string,
): Promise<void> {
  const admin = createAdminClient()
  await admin
    .from("cardapioweb_installs")
    .update({
      active: false,
      inactive_reason: motivo.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", installId)
}
