import "server-only"

/**
 * Fluxo do app DISTRIBUÍDO do iFood — o lojista autoriza sozinho, por código.
 *
 * Como funciona, em três passos:
 *
 *   1. `pedirUserCode()` → o iFood devolve um código curto ("HJLX-LPSQ"), a URL
 *      do Portal do Parceiro e um `authorizationCodeVerifier` que fica SÓ com a
 *      gente.
 *   2. O lojista digita o código no portal dele (ou clica no link já montado).
 *   3. `trocarPorToken()` com o `authorizationCode` que ele devolve + o
 *      verifier → access_token e refresh_token daquela loja.
 *
 * ⚠️ POR QUE ISTO EXISTE, e não é firula: no app CENTRALIZADO que usamos hoje,
 * cada loja nova exige alguém entrar no Portal do DESENVOLVEDOR e pedir
 * autorização por CNPJ, um a um. Fora o trabalho, são dois passos que não
 * controlamos: em 13/ago/26 o lojista aprovou (e-mail do iFood às 17:47 e
 * 18:08) e a API seguiu devolvendo 403 no merchant e omitindo-o da listagem 40
 * minutos depois. Aqui o único passo humano é o lojista digitar o código.
 *
 * ⚠️ O `codeVerifier` PRECISA SOBREVIVER À TROCA DE PÁGINA. Ele nasce no passo
 * 1 e só é usado no passo 3, que pode acontecer minutos depois, em outro
 * request — guardar em memória perderia a conexão de quem demora a autorizar.
 * Por isso vai pra `ifood_conexoes_distribuidas.code_verifier` (migration
 * 0194), e é apagado assim que o token chega.
 *
 * ⚠️ NÃO SUBSTITUI O CENTRALIZADO. As 67 lojas já autorizadas continuam lá.
 * Uma loja usa um caminho ou o outro, nunca os dois — senão o mesmo merchant
 * sincronizaria por duas credenciais e duplicaria chamada e log.
 */

const BASE = "https://merchant-api.ifood.com.br/authentication/v1.0"

function credenciais(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.IFOOD_DIST_CLIENT_ID
  const clientSecret = process.env.IFOOD_DIST_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

export type UserCode = {
  userCode: string
  /** Guardar: sem ele a troca pelo token falha. */
  codeVerifier: string
  verificationUrl: string
  /** A mesma URL já com o código — dá pra mandar de link pro lojista. */
  verificationUrlComplete: string
  expiraEm: Date
}

export type TokenDistribuido = {
  accessToken: string
  refreshToken: string | null
  expiraEm: Date
}

/** Erro com a mensagem do iFood preservada — é ela que diz o que fazer. */
export class ErroIfoodDistribuido extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly corpo: string,
  ) {
    super(message)
    this.name = "ErroIfoodDistribuido"
  }
}

async function postForm(
  caminho: string,
  campos: Record<string, string>,
): Promise<unknown> {
  const r = await fetch(`${BASE}${caminho}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(campos),
  })
  const texto = await r.text()
  if (!r.ok) {
    // "Grant type not authorized for client" = o app ainda é CENTRALIZADO.
    // É o erro esperado enquanto o app distribuído não estiver criado, e foi
    // exatamente o que os dois apps atuais devolveram no teste de 13/ago.
    throw new ErroIfoodDistribuido(
      `iFood ${caminho} → ${r.status}`,
      r.status,
      texto.slice(0, 500),
    )
  }
  try {
    return JSON.parse(texto)
  } catch {
    throw new ErroIfoodDistribuido(
      `iFood ${caminho}: resposta não é JSON`,
      r.status,
      texto.slice(0, 500),
    )
  }
}

/** Passo 1 — pede o código que o lojista vai digitar. */
export async function pedirUserCode(): Promise<UserCode> {
  const cred = credenciais()
  if (!cred) {
    throw new ErroIfoodDistribuido(
      "Faltam IFOOD_DIST_CLIENT_ID / IFOOD_DIST_CLIENT_SECRET no ambiente.",
      0,
      "",
    )
  }
  const j = (await postForm("/oauth/userCode", {
    clientId: cred.clientId,
  })) as {
    userCode?: string
    authorizationCodeVerifier?: string
    verificationUrl?: string
    verificationUrlComplete?: string
    expiresIn?: number
  }

  if (!j.userCode || !j.authorizationCodeVerifier) {
    throw new ErroIfoodDistribuido(
      "iFood não devolveu userCode/verifier.",
      200,
      JSON.stringify(j).slice(0, 300),
    )
  }
  const url = j.verificationUrl ?? "https://portal.ifood.com.br/apps/code"
  return {
    userCode: j.userCode,
    codeVerifier: j.authorizationCodeVerifier,
    verificationUrl: url,
    verificationUrlComplete:
      j.verificationUrlComplete ??
      `${url}?c=${encodeURIComponent(j.userCode)}`,
    // `expiresIn` vem em segundos. Sem ele, 10 min é o default do iFood.
    expiraEm: new Date(Date.now() + (j.expiresIn ?? 600) * 1000),
  }
}

function lerToken(j: unknown): TokenDistribuido {
  const o = (j ?? {}) as {
    accessToken?: string
    refreshToken?: string
    expiresIn?: number
  }
  if (!o.accessToken) {
    throw new ErroIfoodDistribuido(
      "iFood não devolveu accessToken.",
      200,
      JSON.stringify(o).slice(0, 300),
    )
  }
  // 30s de folga: o token não pode vencer no meio de uma rodada de sync.
  const segundos = (o.expiresIn ?? 6 * 60 * 60) - 30
  return {
    accessToken: o.accessToken,
    refreshToken: o.refreshToken ?? null,
    expiraEm: new Date(Date.now() + segundos * 1000),
  }
}

/** Passo 3 — troca o código autorizado pelo token daquela loja. */
export async function trocarPorToken(
  authorizationCode: string,
  codeVerifier: string,
): Promise<TokenDistribuido> {
  const cred = credenciais()
  if (!cred) {
    throw new ErroIfoodDistribuido("Credenciais do app distribuído ausentes.", 0, "")
  }
  return lerToken(
    await postForm("/oauth/token", {
      grantType: "authorization_code",
      clientId: cred.clientId,
      clientSecret: cred.clientSecret,
      authorizationCode,
      authorizationCodeVerifier: codeVerifier,
    }),
  )
}

/** Renova antes de vencer. O refresh pode ou não rotacionar — ver a RPC. */
export async function renovarToken(
  refreshToken: string,
): Promise<TokenDistribuido> {
  const cred = credenciais()
  if (!cred) {
    throw new ErroIfoodDistribuido("Credenciais do app distribuído ausentes.", 0, "")
  }
  return lerToken(
    await postForm("/oauth/token", {
      grantType: "refresh_token",
      clientId: cred.clientId,
      clientSecret: cred.clientSecret,
      refreshToken,
    }),
  )
}

/** O app distribuído está configurado neste ambiente? */
export function distribuidoConfigurado(): boolean {
  return credenciais() !== null
}
