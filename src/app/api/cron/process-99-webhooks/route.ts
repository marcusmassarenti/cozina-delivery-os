/**
 * Processa eventos de webhook do 99 Food acumulados em
 * `ninefood_webhook_events` e popula `ninefood_pedidos`.
 *
 * Recebe via Vercel Cron. Idempotente: pedido_id é único por unidade,
 * UPSERT atualiza se já existir.
 *
 * Eventos tratados (todos os outros são apenas marcados como processados):
 *  - orderNew    → cria/atualiza linha em ninefood_pedidos
 *  - orderFinish → atualiza horario_conclusao
 *  - orderCancel → atualiza horario_cancelamento
 *
 * Auth: Bearer CRON_SECRET (mesmo padrão do ninefood-sync).
 */
import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { registrarCron } from "@/lib/cron/registrar"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const BATCH = 2000 // processa até 2k eventos por execução

type Event = {
  id: string
  event_type: string | null
  event_id: string | null
  store_id: string | null
  order_id: string | null
  payload: Record<string, unknown>
  received_at: string
}

function tsToDate(unixSec: unknown): Date | null {
  const n = Number(unixSec)
  if (!n || !isFinite(n) || n <= 0) return null
  return new Date(n * 1000)
}

function cents(v: unknown): number {
  const n = Number(v)
  return isFinite(n) ? n / 100 : 0
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  // Envelope de registro: deixa rastro em cron_runs pra o relatório
  // diário saber a diferença entre "rodou e não achou nada" e "não rodou".
  return registrarCron("process-99-webhooks", async () => {

  const admin = createAdminClient()
  const t0 = Date.now()

  // 1) Mapa app_shop_id → unit_id (lojas vinculadas e ativas)
  const { data: links } = await admin
    .from("ninefood_store_links")
    .select("app_shop_id, unit_id")
    .eq("active", true)
    .not("unit_id", "is", null)
  const unitByAppShop = new Map<string, string>()
  for (const l of (links ?? []) as Array<{
    app_shop_id: string
    unit_id: string
  }>) {
    unitByAppShop.set(l.app_shop_id, l.unit_id)
  }

  // 2) Pega eventos pendentes (ordem cronológica)
  const { data: rawEvents, error: evErr } = await admin
    .from("ninefood_webhook_events")
    .select(
      "id, event_type, event_id, store_id, order_id, payload, received_at",
    )
    .eq("processed", false)
    .order("received_at", { ascending: true })
    .limit(BATCH)
  if (evErr) {
    return Response.json(
      { ok: false, error: evErr.message },
      { status: 500 },
    )
  }
  const events = (rawEvents ?? []) as Event[]
  if (events.length === 0) {
    return Response.json({
      ok: true,
      ranAt: new Date().toISOString(),
      processed: 0,
      took_ms: Date.now() - t0,
    })
  }

  // 3) Agrupa por tipo (só os 3 que importam)
  const news = events.filter((e) => e.event_type === "orderNew")
  const finishes = events.filter((e) => e.event_type === "orderFinish")
  const cancels = events.filter((e) => e.event_type === "orderCancel")

  /** Soma um campo da lista de promoções (centavos → reais). Lista ausente
   *  ou quebrada vira null, não 0: "não veio" e "não teve promoção" são
   *  coisas diferentes na hora de calcular média. */
  const somaPromo = (lista: unknown, campo: string): number | null => {
    if (!Array.isArray(lista)) return null
    const t = lista.reduce((acc: number, p) => {
      const v = (p as Record<string, unknown>)?.[campo]
      const n = Number(v)
      return acc + (Number.isFinite(n) ? n : 0)
    }, 0)
    return Math.round(t) / 100
  }

  /* Solicitações de conexão em aberto: base do fechamento automático abaixo.
   * Uma consulta só, fora do laço — dentro dele seria uma por webhook. */
  const { data: pend } = await admin
    .from("ninefood_activation_requests")
    .select("id, unit_id, loja_99")
    .in("status", ["pendente", "solicitada"])
  const pendentes99 = (pend ?? []) as {
    id: string
    unit_id: string | null
    loja_99: string | null
  }[]
  const autoVinculadas: { appShopId: string; unitId: string }[] = []

  // 4) Upsert orderNew → ninefood_pedidos
  const newRows: Record<string, unknown>[] = []
  const skippedNew: { reason: string; storeId: string | null }[] = []
  for (const e of news) {
    const data = (e.payload?.data ?? {}) as Record<string, unknown>
    const info = (data.order_info ?? {}) as Record<string, unknown>
    const shop = (info.shop ?? {}) as Record<string, unknown>
    const price = (info.price ?? {}) as Record<string, unknown>
    const others = (price.others_fees ?? {}) as Record<string, unknown>
    const recv = (info.receive_address ?? {}) as Record<string, unknown>

    const appShopId = String(shop.app_shop_id ?? e.payload?.app_shop_id ?? "")
    let unitId = unitByAppShop.get(appShopId)
    if (!unitId) {
      /* FECHAMENTO AUTOMÁTICO DA CONEXÃO 99.
       *
       * A API do 99 não tem "liste minhas lojas": o `app_shop_id` só aparece
       * quando o primeiro pedido da loja chega aqui. Então é ESTE o momento em
       * que dá pra vincular — antes dele, ninguém do nosso lado conhece a
       * chave, nem o Marcus.
       *
       * Casa pelo NOME que o 99 mandou (`shop_name`) contra as solicitações em
       * aberto. Nome, e não CNPJ, porque o payload do pedido não traz CNPJ.
       *
       * Só fecha quando o nome bate com UMA solicitação. Empate não vincula:
       * ligar a loja errada mistura o faturamento de dois lojistas, e isso é
       * bem pior que esperar alguém fazer à mão. */
      const nome99 = String(shop.shop_name ?? "").trim().toLowerCase()
      const candidatas = nome99
        ? pendentes99.filter(
            (p) =>
              p.loja_99 && String(p.loja_99).trim().toLowerCase() === nome99,
          )
        : []
      const alvo = candidatas.length === 1 ? candidatas[0] : null
      if (alvo?.unit_id) {
        const alvoUnitId = alvo.unit_id
        await admin.from("ninefood_store_links").upsert(
          { unit_id: alvoUnitId, app_shop_id: appShopId, active: true },
          { onConflict: "app_shop_id" },
        )
        await admin
          .from("ninefood_activation_requests")
          .update({
            status: "ativa",
            nota: `Vinculada automaticamente pelo 1º webhook (app_shop_id ${appShopId}).`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", alvo.id)
        unitByAppShop.set(appShopId, alvoUnitId)
        unitId = alvoUnitId
        autoVinculadas.push({ appShopId, unitId: alvoUnitId })
      } else {
        skippedNew.push({ reason: "loja não vinculada", storeId: appShopId })
        continue
      }
    }
    const orderId = String(data.order_id ?? info.order_id ?? "")
    if (!orderId) {
      skippedNew.push({ reason: "sem order_id", storeId: appShopId })
      continue
    }
    const createDate = tsToDate(info.create_time)
    const horarioPedido = createDate ?? tsToDate(info.pay_time) ?? new Date(e.received_at)
    const dataDia = horarioPedido.toISOString().slice(0, 10)

    newRows.push({
      unit_id: unitId,
      pedido_id: orderId,
      data: dataDia,
      ref_year: horarioPedido.getUTCFullYear(),
      ref_month: horarioPedido.getUTCMonth() + 1,
      horario_pedido: horarioPedido.toISOString(),
      receita_vendas: cents(price.order_price),
      preco_original_item: cents(price.order_price),
      despesas_ofertas: cents(price.items_discount),
      // Frete: os TRÊS números, não só o líquido. A 99 manda o cheio e o
      // desconto em 100% dos payloads e nós jogávamos fora — sem eles, "quanto
      // o cliente pagou" só tinha piso e "quanto a loja bancou" era estimativa.
      // Identidade verificada em 2.441 de 2.441 eventos de julho:
      //   delivery_price = store_charged_delivery_price − delivery_discount
      taxa_entrega_original: cents(price.delivery_price),
      taxa_entrega_cheia: cents(price.store_charged_delivery_price),
      desconto_entrega: cents(price.delivery_discount),
      taxa_canal_pagamento: cents(others.service_price),
      recompensas_plataforma: cents(price.shop_paid_money),
      contagem_item: Array.isArray(info.order_items)
        ? (info.order_items as unknown[]).length
        : 0,
      cliente_id: recv.uid != null ? String(recv.uid) : null,
      forma_pagamento: info.pay_method != null ? String(info.pay_method) : null,
      pay_channel:
        info.pay_channel != null && !Number.isNaN(Number(info.pay_channel))
          ? Number(info.pay_channel)
          : null,
      metodo_entrega:
        info.delivery_type != null ? String(info.delivery_type) : null,
      // Custo da PLATAFORMA cobrado do lojista quando quem entrega é a 99.
      // Anunciado pela 99 em 05/ago/26 como novidade, mas já chegava desde
      // 11/jun — vinha e era descartado. Não confundir com taxa_entrega_*:
      // aquelas são o frete do lado do CLIENTE, este é o custo do lado da LOJA.
      custo_logistica: cents(info.logistics_cost),
      // Área de entrega. O bairro vem em 100% dos payloads e é o único recorte
      // confiável: a coordenada (poi_lat/poi_lng) chega arredondada pra grau
      // inteiro por privacidade — 1 latitude distinta em 4.914 pedidos —, então
      // não é guardada. O CEP tem 1.889 valores distintos e serve melhor.
      bairro: recv.district != null ? String(recv.district) : null,
      cep: recv.postal_code != null ? String(recv.postal_code) : null,
      // Promoção POR PEDIDO: quanto a loja bancou e o desconto total dado ao
      // cliente. Mais granular que a planilha de Promoções, que é por período
      // rolante e não deixa cruzar promoção com bairro, item ou horário.
      promo_custeada_loja: somaPromo(info.promotions, "shop_subside_price"),
      promo_desconto_total: somaPromo(info.promotions, "promo_discount"),
    })
  }

  // ⚠️ Dedupe ANTES do upsert. A 99 manda mais de um `orderNew` pro mesmo
  // pedido (reenvio, retentativa), e o Postgres recusa um INSERT ... ON
  // CONFLICT cujo lote traga a mesma chave duas vezes: "ON CONFLICT DO UPDATE
  // command cannot affect row a second time". O lote inteiro morre, o cron
  // devolve 500 e — pior — os eventos não chegam a ser marcados como
  // processados, então a fila só cresce e a próxima rodada quebra igual.
  //
  // Foi assim que 22 mil eventos ficaram parados por 22 dias sem ninguém ver.
  //
  // Fica o ÚLTIMO de cada chave: eventos vêm em ordem de chegada, e o mais
  // recente descreve melhor o estado atual do pedido.
  const porChave = new Map<string, Record<string, unknown>>()
  for (const r of newRows) porChave.set(`${r.unit_id}|${r.pedido_id}`, r)
  const newRowsUnicos = [...porChave.values()]
  const duplicadosDescartados = newRows.length - newRowsUnicos.length

  let upsertedNew = 0
  if (newRowsUnicos.length > 0) {
    // upsert em chunks de 500 (limite seguro pro Postgres)
    const CHUNK = 500
    for (let i = 0; i < newRowsUnicos.length; i += CHUNK) {
      const slice = newRowsUnicos.slice(i, i + CHUNK)
      const { error } = await admin
        .from("ninefood_pedidos")
        .upsert(slice, { onConflict: "unit_id,pedido_id" })
      if (error) {
        console.error("process-99-webhooks: upsert orderNew falhou:", error.message)
        return Response.json(
          { ok: false, error: error.message, atChunk: i / CHUNK },
          { status: 500 },
        )
      }
      upsertedNew += slice.length
    }
  }

  // 4b) Os ITENS da comanda — o dado que o webhook sempre trouxe e este cron
  // descartava, guardando só `contagem_item`. Roda DEPOIS do upsert do pedido
  // e nunca derruba a rodada: item é enriquecimento, pedido é o essencial.
  const { gravarItensDoWebhook } = await import(
    "@/lib/ninefood/itens-do-webhook"
  )
  let itensGravados = 0
  try {
    const r = await gravarItensDoWebhook(admin, news, unitByAppShop)
    itensGravados = r.linhas
  } catch (e) {
    console.error("process-99-webhooks: itens", e)
  }

  // 5) orderFinish → set horario_conclusao
  let finished = 0
  for (const e of finishes) {
    const data = (e.payload?.data ?? {}) as Record<string, unknown>
    const appShopId = String(e.payload?.app_shop_id ?? "")
    const unitId = unitByAppShop.get(appShopId)
    if (!unitId || data.order_id == null) continue
    const horario = tsToDate(e.payload?.timestamp)
    const { error } = await admin
      .from("ninefood_pedidos")
      .update({
        horario_conclusao: horario ? horario.toISOString() : null,
      })
      .eq("unit_id", unitId)
      .eq("pedido_id", String(data.order_id))
    if (!error) finished++
  }

  // 6) orderCancel → set horario_cancelamento
  let canceled = 0
  for (const e of cancels) {
    const data = (e.payload?.data ?? {}) as Record<string, unknown>
    const appShopId = String(e.payload?.app_shop_id ?? "")
    const unitId = unitByAppShop.get(appShopId)
    if (!unitId || data.order_id == null) continue
    const horario = tsToDate(e.payload?.timestamp)
    const { error } = await admin
      .from("ninefood_pedidos")
      .update({
        horario_cancelamento: horario ? horario.toISOString() : null,
      })
      .eq("unit_id", unitId)
      .eq("pedido_id", String(data.order_id))
    if (!error) canceled++
  }

  // 7) Marca TODOS como processados (mesmo os "ignorados" pra não ficar
  //    re-tentando deliveryStatus/orderConfirm/etc.)
  const idsChunkSize = 500
  const ids = events.map((e) => e.id)
  for (let i = 0; i < ids.length; i += idsChunkSize) {
    const slice = ids.slice(i, i + idsChunkSize)
    await admin
      .from("ninefood_webhook_events")
      .update({ processed: true })
      .in("id", slice)
  }

  // Entrou pedido novo → o agregado mensal em cache ficou velho.
  const { limparCacheAgregados } = await import("@/lib/cache-tags")
  await limparCacheAgregados()

  return Response.json({
    ok: true,
    ranAt: new Date().toISOString(),
    took_ms: Date.now() - t0,
    processed: events.length,
    detalhe: {
      orderNew: news.length,
      auto_vinculadas: autoVinculadas,
      orderNew_upserted: upsertedNew,
      orderNew_duplicados: duplicadosDescartados,
      orderNew_skipped: skippedNew.length,
      itens_gravados: itensGravados,
      orderFinish: finished,
      orderCancel: canceled,
      outros: events.length - news.length - finishes.length - cancels.length,
    },
    skipped_sample: skippedNew.slice(0, 5),
  })
  })
}
