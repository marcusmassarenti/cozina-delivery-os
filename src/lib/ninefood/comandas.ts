import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getNinefoodAuthToken } from "./auth"

/**
 * A COMANDA de pedidos antigos, buscada um a um na API do 99.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────
 * A 99 NÃO tem endpoint de relatório de itens vendidos. Levantei a árvore
 * inteira da documentação em 25/08/26: os módulos são Authorization, Store,
 * Menu (catálogo — o que a loja VENDE, não o que foi vendido), Order,
 * Logistics e Financial (só `Get Bill Data` e `Get Settlements Data`). Não há
 * nada de analytics.
 *
 * O que existe é o `Get Order Details`, que devolve a comanda de UM pedido.
 * E o `Get Bill Data`, que já usamos, devolve os `order_id` do período — então
 * dá pra percorrer o histórico pedido a pedido.
 *
 * ⚠️ ISSO NÃO APOSENTA A PLANILHA "Dados do item", e é importante não achar
 * que aposenta: ela traz ALCANCE, ADIÇÃO AO CARRINHO e CONVERSÃO por item —
 * funil, que é métrica do lado da plataforma e não existe em nenhum endpoint.
 * E ela cobre 52 lojas contra as 15 com vínculo de API. As duas fontes somam.
 *
 * O que só a comanda dá: a amarração item ↔ PEDIDO (o que se vende junto, a
 * composição do ticket), os complementos, e a promoção que a loja bancou por
 * item. A planilha é agregada por dia e nunca vai dizer isso.
 *
 * ── O CUSTO, E POR QUE ELE MANDA NO DESENHO ──────────────────────────────
 * `v1/order/order/detail` aceita 10 req/10s — 1 por segundo. Em 25/08/26
 * havia 18.007 pedidos sem comanda: ~5 horas de chamadas. Por isso isto é uma
 * FILA de fundo com teto por rodada, não um botão que alguém aperta e espera.
 */

const BASE = "https://openapi.didi-food.com"

/** 10 req/10s na doc. 1,1s dá folga sem precisar medir o 429 na marra. */
const INTERVALO_MS = 1100

export type ResultadoComandas = {
  pedidosLidos: number
  itensGravados: number
  semItem: number
  erros: string[]
  /** Quantos ainda faltam depois desta rodada. */
  restantes: number
}

type PedidoPendente = {
  app_shop_id: string
  order_id: string
  unit_id: string
  business_date: string
}

/** Centavos → reais. Null quando o campo não veio. */
function reais(v: unknown): number | null {
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) / 100 : null
}

function texto(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim()
  return s === "" ? null : s
}

/**
 * A promoção do item. Mesma régua da extração do webhook
 * (`itens-do-webhook.ts`): consolidado primeiro, soma da lista como reserva,
 * e NUNCA no complemento — o desconto do combo vem no item pai.
 */
function promocao(item: Record<string, unknown>): {
  desconto: number | null
  loja: number | null
} {
  const det = (item.promotion_detail ?? null) as Record<string, unknown> | null
  if (det && (det.promo_discount != null || det.shop_subside_price != null)) {
    return {
      desconto: reais(det.promo_discount),
      loja: reais(det.shop_subside_price),
    }
  }
  const lista = item.promo_list
  if (!Array.isArray(lista) || lista.length === 0) {
    return { desconto: null, loja: null }
  }
  let desconto = 0
  let loja = 0
  for (const raw of lista) {
    const p = (raw ?? {}) as Record<string, unknown>
    desconto += Number(p.promo_discount ?? 0) || 0
    loja += Number(p.shop_subside_price ?? 0) || 0
  }
  return { desconto: Math.round(desconto) / 100, loja: Math.round(loja) / 100 }
}

/**
 * Busca a comanda de UM pedido.
 *
 * ⚠️ O `order_id` VAI E VOLTA COMO TEXTO. Ele tem 19 dígitos e não cabe num
 * double: `JSON.parse` devolve 5764607801871631000 onde o valor é
 * ...631353. A própria doc da 99 avisa e manda usar json-bigint. Aqui a saída
 * é mais simples — o id nunca vira número: entra na URL como string e sai da
 * resposta pelo texto cru, com regex.
 */
async function buscarComanda(
  appShopId: string,
  orderId: string,
): Promise<Record<string, unknown>[] | null> {
  const token = await getNinefoodAuthToken(appShopId)
  const url = new URL(`${BASE}/v1/order/order/detail`)
  url.searchParams.set("auth_token", token)
  url.searchParams.set("order_id", orderId)

  const res = await fetch(url, { cache: "no-store" })
  const raw = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw.slice(0, 160)}`)

  const errno = Number(raw.match(/"errno"\s*:\s*(-?\d+)/)?.[1] ?? 0)
  if (errno !== 0) {
    throw new Error(`errno ${errno}: ${raw.slice(0, 160)}`)
  }

  /* O parse aqui é seguro: os ids grandes (`order_id`, `mdu_id`) não são
   * lidos deste objeto — o `order_id` a gente já tem como texto, vindo do
   * extrato, e é ele que grava. */
  const json = JSON.parse(raw) as {
    data?: { order_items?: unknown[] } | null
  }
  const itens = json.data?.order_items
  return Array.isArray(itens) ? (itens as Record<string, unknown>[]) : null
}

/**
 * Roda uma fatia da fila.
 *
 * A ordem é do MAIS RECENTE pro mais antigo de propósito: se a fila for
 * interrompida no meio (deploy, limite de tempo), o que já entrou é o período
 * que as telas mais olham. Histórico antigo pode esperar mais uma rodada.
 */
export async function backfillComandas99(
  opts: { limite?: number; deadlineMs?: number } = {},
): Promise<ResultadoComandas> {
  const admin = createAdminClient()
  const limite = opts.limite ?? 200
  const t0 = Date.now()
  const prazo = opts.deadlineMs ?? Number.POSITIVE_INFINITY

  const { data, error } = await admin.rpc("ninefood_pedidos_sem_comanda", {
    p_limite: limite,
  })
  if (error) throw new Error(`fila: ${error.message}`)
  const fila = (data ?? []) as PedidoPendente[]

  const erros: string[] = []
  let pedidosLidos = 0
  let itensGravados = 0
  let semItem = 0

  for (const p of fila) {
    if (Date.now() - t0 > prazo - INTERVALO_MS) break
    try {
      const itens = await buscarComanda(p.app_shop_id, p.order_id)
      pedidosLidos++
      if (!itens || itens.length === 0) {
        /**
         * Pedido sem item na resposta. Grava um marcador pra ele SAIR DA FILA.
         *
         * Sem isso, pedido que a 99 não devolve item (cancelado antigo, pedido
         * de teste) seria pedido de novo em toda rodada, pra sempre — o mesmo
         * loop que travou a fila do backfill do iFood duas vezes. Uma linha
         * `kind='vazio'` custa nada e responde "já perguntei, não tem".
         */
        await admin.from("ninefood_pedido_itens").upsert(
          {
            unit_id: p.unit_id,
            order_id: `api:${p.order_id}`,
            order_id_99: p.order_id,
            kind: "vazio",
            item_index: 0,
            parent_index: -1,
            nome_item: "—",
            quantidade: 0,
            data: p.business_date,
            ref_year: Number(p.business_date.slice(0, 4)),
            ref_month: Number(p.business_date.slice(5, 7)),
          },
          { onConflict: "order_id,kind,parent_index,item_index" },
        )
        semItem++
      } else {
        itensGravados += await gravar(admin, p, itens)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      erros.push(`${p.order_id}: ${msg}`)
      // Erro de uma loja não pode consumir a rodada inteira tentando as
      // outras 199 do mesmo jeito. Três seguidos e para.
      if (erros.length >= 3) break
    }
    await new Promise((r) => setTimeout(r, INTERVALO_MS))
  }

  const { data: falta } = await admin.rpc("ninefood_pedidos_sem_comanda_total")
  return {
    pedidosLidos,
    itensGravados,
    semItem,
    erros,
    restantes: Number(falta ?? 0),
  }
}

/** Transforma a comanda em linhas, na MESMA forma do webhook. */
async function gravar(
  admin: ReturnType<typeof createAdminClient>,
  p: PedidoPendente,
  itens: Record<string, unknown>[],
): Promise<number> {
  const [ano, mes] = p.business_date.split("-").map(Number)
  const linhas: Record<string, unknown>[] = []

  /**
   * A chave do webhook é `app_shop_id|order_index|create_time`; aqui é
   * `api:<order_id>`. São propositalmente DIFERENTES: o mesmo pedido pode
   * chegar pelos dois caminhos, e uma chave só faria um sobrescrever o outro
   * — com a diferença de que o webhook é a fonte mais rica (tem o horário e o
   * índice da comanda). Duas chaves deixam os dois conviverem, e o
   * `order_id_99` amarra os dois lados quando alguém precisar cruzar.
   */
  const chave = `api:${p.order_id}`

  itens.forEach((raw, i) => {
    const item = (raw ?? {}) as Record<string, unknown>
    const nome = texto(item.name)
    if (!nome) return
    const promo = promocao(item)
    linhas.push({
      unit_id: p.unit_id,
      order_id: chave,
      order_id_99: p.order_id,
      kind: "item",
      item_index: i,
      parent_index: -1,
      nome_item: nome,
      grupo: null,
      quantidade: Number(item.amount ?? 1) || 1,
      preco_unitario: reais(item.sku_price),
      valor_total: reais(item.total_price),
      valor_pago: reais(item.real_price),
      promo_desconto: promo.desconto,
      promo_loja: promo.loja,
      data: p.business_date,
      ref_year: ano,
      ref_month: mes,
      app_item_id: texto(item.app_item_id),
    })

    const subs = item.sub_item_list
    if (!Array.isArray(subs)) return
    subs.forEach((rawSub, j) => {
      const sub = (rawSub ?? {}) as Record<string, unknown>
      const nomeSub = texto(sub.name)
      if (!nomeSub) return
      linhas.push({
        unit_id: p.unit_id,
        order_id: chave,
        order_id_99: p.order_id,
        kind: "opcao",
        item_index: j,
        parent_index: i,
        nome_item: nomeSub,
        grupo: texto(sub.content_name),
        quantidade: Number(sub.amount ?? 1) || 1,
        preco_unitario: reais(sub.sku_price),
        valor_total: reais(sub.total_price),
        valor_pago: null,
        data: p.business_date,
        ref_year: ano,
        ref_month: mes,
        app_item_id: texto(sub.app_item_id),
      })
    })
  })

  if (linhas.length === 0) return 0
  const { error } = await admin
    .from("ninefood_pedido_itens")
    .upsert(linhas, { onConflict: "order_id,kind,parent_index,item_index" })
  if (error) throw new Error(error.message)
  return linhas.length
}
