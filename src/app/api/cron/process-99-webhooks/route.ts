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
    const unitId = unitByAppShop.get(appShopId)
    if (!unitId) {
      skippedNew.push({ reason: "loja não vinculada", storeId: appShopId })
      continue
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
      taxa_entrega_original: cents(price.delivery_price),
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
    })
  }

  let upsertedNew = 0
  if (newRows.length > 0) {
    // upsert em chunks de 500 (limite seguro pro Postgres)
    const CHUNK = 500
    for (let i = 0; i < newRows.length; i += CHUNK) {
      const slice = newRows.slice(i, i + CHUNK)
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

  return Response.json({
    ok: true,
    ranAt: new Date().toISOString(),
    took_ms: Date.now() - t0,
    processed: events.length,
    detalhe: {
      orderNew: news.length,
      orderNew_upserted: upsertedNew,
      orderNew_skipped: skippedNew.length,
      orderFinish: finished,
      orderCancel: canceled,
      outros: events.length - news.length - finishes.length - cancels.length,
    },
    skipped_sample: skippedNew.slice(0, 5),
  })
}
