import "server-only"

/**
 * O link self-service de autorização do 99.
 *
 * ── O QUE ELE RESOLVE ────────────────────────────────────────────────────
 * Até aqui, conectar uma loja no 99 exigia alguém do NOSSO lado entrar no
 * Portal do Parceiro e clicar "Vincular" loja por loja, digitando à mão o
 * identificador. Com 59 lojas cadastradas e sem vínculo (42 só da DG FOODS),
 * isso não escala.
 *
 * Este endpoint devolve uma página do 99 onde o próprio dono da loja vê os
 * estabelecimentos dele e autoriza sozinho.
 *
 * ── POR QUE GERAR NA HORA DO CLIQUE ──────────────────────────────────────
 * A URL vale 7 dias. Mandar por e-mail cria um prazo pra alguém perder: o
 * link vence, o cliente clica, não funciona, e vira chamado. Gerando no
 * clique, o link tem segundos de vida e o prazo nunca importa. O limite do
 * 99 é 100 chamadas por minuto, folgado pro nosso volume.
 *
 * ── AS TRÊS ARMADILHAS (a doc do 99 é explícita) ─────────────────────────
 * 1. Só quem é SUPER-ADMIN da loja no 99 consegue usar. Gerente comum abre e
 *    não vê nada — por isso a tela precisa dizer isso ANTES do clique.
 * 2. A URL é do APP, não de uma loja: quem abre vê todas as lojas da conta
 *    dele. Se clicar na errada, o mapeamento sai errado — a própria doc
 *    manda orientar qual escolher.
 * 3. Quem gera o `app_shop_id` aqui é o 99 (sai um UUID), não nós. Então o
 *    vínculo NÃO pode ser resolvido pelo nome do slug — ver `bind-webhook.ts`,
 *    que resolve por `shop_id`.
 *
 * Sai em nome da LAB OF CHANGE LTDA, que é quem assina as integrações — não
 * da Cozina Foods.
 */
import { createHash } from "node:crypto"

const BASE = "https://openapi.99food.com"

/**
 * Assina no padrão do 99: params ordenados por chave, "k=v" unidos por "&",
 * com o app_secret colado no fim. Cobre TODOS os parâmetros enviados.
 */
function assinar(
  params: Record<string, string | number>,
  appSecret: string,
): string {
  const base = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&")
  return createHash("md5").update(base + appSecret).digest("hex")
}

/**
 * Token de app do v3 (`retailer`/`secret`). Os endpoints novos do 99 exigem
 * ELE **e** a assinatura no corpo — descobrir isso custou uma tarde; ver
 * a memória `reference-99food-v3-auth`.
 */
async function tokenV3(appId: string, appSecret: string): Promise<string> {
  const res = await fetch(`${BASE}/v3/auth/authtoken/signIn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ retailer: appId, secret: appSecret }),
    cache: "no-store",
  })
  const json = (await res.json()) as {
    data?: { accessToken?: string }
    accessToken?: string
    errmsg?: string
  }
  const token = json.data?.accessToken ?? json.accessToken
  if (!token) throw new Error(json.errmsg ?? "99 não devolveu accessToken")
  return token
}

export type LinkAutorizacao99 =
  | { ok: true; url: string }
  | { ok: false; error: string }

/** Gera a URL self-service. Sempre nova — não guarda em cache (ver acima). */
export async function gerarLinkAutorizacao99(): Promise<LinkAutorizacao99> {
  const appId = process.env.NINEFOOD_APP_ID
  const appSecret = process.env.NINEFOOD_APP_SECRET
  if (!appId || !appSecret) {
    return { ok: false, error: "Faltam as credenciais do 99 no servidor." }
  }

  try {
    const token = await tokenV3(appId, appSecret)
    const timestamp = Math.floor(Date.now() / 1000)
    const sign = assinar({ app_id: appId, timestamp }, appSecret)

    /* ⚠️ `app_id` tem 19 dígitos e NÃO cabe num double: `Number()` devolve
     * 5764607791719778000 onde o valor é ...8299, e o 99 responde
     * "Can't get app". Vai como marcador e volta a ser número cru na string
     * final — o mesmo cuidado que `lojas.ts` toma com o `shop_id`. */
    const body = JSON.stringify({
      app_id: "@@APPID@@",
      timestamp,
      sign,
    }).replace('"@@APPID@@"', appId)

    const res = await fetch(`${BASE}/v1/auth/authorizationpage/getUrl`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body,
      cache: "no-store",
    })
    const json = (await res.json()) as {
      errno?: number
      errmsg?: string
      data?: { url?: string }
    }
    if (json.errno !== 0 || !json.data?.url) {
      return {
        ok: false,
        error: json.errmsg ?? `99 respondeu errno ${json.errno}`,
      }
    }
    return { ok: true, url: json.data.url }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
