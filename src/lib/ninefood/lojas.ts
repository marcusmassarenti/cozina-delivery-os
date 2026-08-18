import "server-only"

/**
 * As lojas que autorizaram o NOSSO app no 99 Food.
 *
 * ── POR QUE ISSO PRECISOU EXISTIR (18/08/26) ─────────────────────────────
 * O vínculo do 99 só nascia quando chegava o PRIMEIRO WEBHOOK de um pedido e
 * existia uma solicitação pendente com o nome batendo (ver
 * `process-99-webhooks`). Quem autoriza no portal do 99 e não tem solicitação
 * registrada aqui simplesmente não existe pra nós — nem erro, nem aviso.
 *
 * O custo apareceu junto: a Churrasco Royal e a Brooklin estavam vinculadas no
 * portal do 99 e ausentes da nossa tabela. A Brooklin passou a constar no
 * relatório de saúde como "sem API e sem dado novo há 13 dias" — e a causa não
 * era o cliente, era a gente nunca ter perguntado ao 99 quem já autorizou.
 *
 * Esta é a varredura equivalente à do iFood: pergunta a lista e reconcilia.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { createHash } from "node:crypto"

const BASE = "https://openapi.didi-food.com"

export type Loja99 = {
  /** Slug do 99 — é a chave que a nossa tabela usa. Ex.: "royal-pocos-01". */
  appShopId: string
  /** Id numérico, como TEXTO. Ver o aviso de truncamento abaixo. */
  shopId: string
}

/**
 * Lista as lojas autorizadas.
 *
 * ⚠️ OS IDs SÃO LIDOS DO TEXTO CRU, NÃO DO `JSON.parse`.
 * O `shop_id` do 99 tem 19 dígitos e não cabe num double: o parse devolve
 * 5764614502256215000 onde o valor real é 5764614502256214805. Já mordeu este
 * projeto antes (ver a nota sobre o order_id) e voltaria a morder aqui, com o
 * agravante de que o número ERRADO parece perfeitamente válido.
 *
 * O `app_shop_id` é string e não sofre disso — é ele que usamos como chave.
 */
export async function listarLojas99(): Promise<Loja99[]> {
  const appId = process.env.NINEFOOD_APP_ID
  const appSecret = process.env.NINEFOOD_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error("Faltam NINEFOOD_APP_ID / NINEFOOD_APP_SECRET.")
  }

  const timestamp = Math.floor(Date.now() / 1000).toString()
  const query = { app_id: appId, timestamp }
  const base = Object.keys(query)
    .sort()
    .map((k) => `${k}=${query[k as keyof typeof query]}`)
    .join("&")
  const sign = createHash("md5").update(base + appSecret).digest("hex")

  const res = await fetch(`${BASE}/v1/shop/list?${base}&sign=${sign}`, {
    cache: "no-store",
  })
  const raw = await res.text()
  if (!res.ok) {
    throw new Error(`99 shop/list HTTP ${res.status}: ${raw.slice(0, 200)}`)
  }

  // A limitação é 1 chamada a cada 20s: erro de frequência não é falha nossa,
  // e tratar como exceção encheria o log de alarme falso.
  const errno = Number(raw.match(/"errno"\s*:\s*(\d+)/)?.[1] ?? 0)
  if (errno === 10005) return []
  if (errno !== 0) {
    throw new Error(`99 shop/list errno ${errno}: ${raw.slice(0, 200)}`)
  }

  // Casa cada app_shop_id com o shop_id que aparece ANTES dele no mesmo objeto.
  const blocos = raw.split(/"app_id"\s*:/).slice(1)
  const out: Loja99[] = []
  for (const b of blocos) {
    const appShopId = b.match(/"app_shop_id"\s*:\s*"([^"]+)"/)?.[1]
    const shopId = b.match(/"shop_id"\s*:\s*(\d+)/)?.[1]
    if (appShopId && shopId) out.push({ appShopId, shopId })
  }
  return out
}

export type Sincronizacao99 = {
  autorizadas: number
  novas: string[]
  /** Autorizadas no 99 e ainda sem loja nossa apontada. */
  semVinculo: { appShopId: string; shopId: string }[]
}

/**
 * Reconcilia a lista do 99 com a nossa tabela de vínculos.
 *
 * ⚠️ NÃO ADIVINHA A LOJA. Cria a linha com `unit_id` nulo e deixa a escolha pra
 * um humano. O `app_shop_id` é um slug livre ("royal-pocos-01") e casar por
 * semelhança de nome erraria em rede com lojas parecidas — e ligar a loja
 * errada MISTURA o faturamento de dois lojistas, que é bem pior que esperar um
 * clique. É a mesma régua que o webhook já aplica.
 *
 * Também não desativa quem sumiu da lista: no iFood a gente aprendeu que sumir
 * não prova revogação.
 */
export async function sincronizarLojas99(): Promise<Sincronizacao99> {
  const admin = createAdminClient()
  const lojas = await listarLojas99()
  if (lojas.length === 0) {
    return { autorizadas: 0, novas: [], semVinculo: [] }
  }

  const { data: existentes } = await admin
    .from("ninefood_store_links")
    .select("app_shop_id, unit_id")
  const porSlug = new Map(
    ((existentes ?? []) as { app_shop_id: string; unit_id: string | null }[]).map(
      (r) => [r.app_shop_id, r.unit_id],
    ),
  )

  const novas: string[] = []
  for (const l of lojas) {
    if (porSlug.has(l.appShopId)) continue
    const { error } = await admin.from("ninefood_store_links").insert({
      app_shop_id: l.appShopId,
      id_loja: l.shopId,
      active: true,
    })
    if (!error) novas.push(l.appShopId)
  }

  const semVinculo = lojas.filter(
    (l) => novas.includes(l.appShopId) || porSlug.get(l.appShopId) == null,
  )

  return { autorizadas: lojas.length, novas, semVinculo }
}
