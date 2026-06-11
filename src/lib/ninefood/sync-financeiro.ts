/**
 * Sync do financeiro do 99 Food via API (Financial API / Bill Data) → banco.
 *
 * Pra cada loja vinculada (ninefood_store_links, active):
 *   1. garante a unidade (usa a vinculada · casa por nome · ou AUTO-CRIA)
 *   2. puxa o extrato pedido-a-pedido (getShopBillDetail, paginado)
 *   3. grava em ninefood_api_bill (upsert por app_shop_id+order_id+order_type)
 *
 * Idempotente: rodar de novo o mesmo período só atualiza as linhas existentes.
 * Valores convertidos de CENTAVOS (API) → REAIS no banco.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getAllShopBillDetail, type NinefoodBillRow } from "./financeiro"

const cents = (v: number | null | undefined) => Math.round(Number(v ?? 0)) / 100

/** "2026-05-03 09:41:36" | "2026-05-06" → "2026-05-06" (date only). */
function dateOnly(s: string | null | undefined): string | null {
  const m = String(s ?? "").match(/^\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : null
}

type StoreLink = {
  app_shop_id: string
  unit_id: string | null
  id_loja: string | null
  name: string | null
  active: boolean
}

export type ShopSyncResult = {
  appShopId: string
  name: string | null
  unitId: string | null
  unitCreated: boolean
  count: number
  /** Σ valor dos pedidos de receita (orderType 1), em R$ */
  bruto: number
  /** Σ líquido a repassar (settlementAmount, todos os tipos), em R$ */
  liquido: number
  error?: string
}

function toRecord(appShopId: string, r: NinefoodBillRow) {
  return {
    app_shop_id: appShopId,
    order_id: String(r.orderId),
    order_index: r.orderIndex != null ? String(r.orderIndex) : null,
    order_type: Number(r.orderType),
    business_date: dateOnly(r.businessDateTime),
    business_ts: r.businessTs ?? null,
    expect_settle_date: dateOnly(r.expectSettleDate),
    day_payment_id: r.dayPaymentId ?? null,
    meal_original_amount: cents(r.mealOriginalAmount),
    pay_commission_amount: cents(r.payCommissionAmount),
    shop_delivery_amount: cents(r.shopDeliveryAmount),
    settlement_amount: cents(r.settlementAmount),
    payment_method: r.paymentMethod ?? null,
    raw: r,
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = ReturnType<typeof createAdminClient>

/** Resolve a unidade do link: usa a vinculada, casa por nome, ou auto-cria. */
async function resolveUnitForLink(
  admin: Admin,
  link: StoreLink,
  cityHint: string | null,
): Promise<{ unitId: string | null; created: boolean }> {
  if (link.unit_id) return { unitId: link.unit_id, created: false }

  const rawName = String(link.name ?? "").trim()
  const shortName = rawName.includes(" - ")
    ? rawName.split(" - ").slice(1).join(" - ").trim()
    : rawName

  // tenta casar com uma unidade existente pelo nome
  if (shortName) {
    const { data: match } = await admin
      .from("units")
      .select("id")
      .ilike("name", shortName)
      .limit(1)
      .maybeSingle()
    if ((match as any)?.id) {
      const id = (match as any).id as string
      await admin.from("ninefood_store_links").update({ unit_id: id }).eq("app_shop_id", link.app_shop_id)
      return { unitId: id, created: false }
    }
  }

  // sem match → auto-cria a unidade (Marcus revisa depois)
  const { data: ref } = await admin
    .from("units")
    .select("brand_id")
    .not("brand_id", "is", null)
    .limit(1)
    .maybeSingle()
  const { data: allCodes } = await admin.from("units").select("code")
  const maxCode = Math.max(
    0,
    ...((allCodes as any[]) ?? [])
      .map((c) => parseInt(String(c.code), 10))
      .filter((n) => !Number.isNaN(n)),
  )
  const newCode = String(maxCode + 1).padStart(2, "0")
  const { data: created, error } = await admin
    .from("units")
    .insert({
      brand_id: (ref as any)?.brand_id ?? null,
      code: newCode,
      name: shortName || rawName || link.app_shop_id,
      city: cityHint,
      active: true,
    })
    .select("id")
    .single()
  if (error || !(created as any)?.id) return { unitId: null, created: false }
  const id = (created as any).id as string
  await admin.from("ninefood_store_links").update({ unit_id: id }).eq("app_shop_id", link.app_shop_id)
  return { unitId: id, created: true }
}

/**
 * Sincroniza o financeiro do 99 das lojas vinculadas, num período.
 * Datas em YYYYMMDD (a API filtra por DATA DE REPASSE / expectSettleDate).
 */
export async function syncNinefoodFinanceiro(opts: {
  startDate: string
  endDate: string
  appShopIds?: string[]
}): Promise<{ results: ShopSyncResult[]; startDate: string; endDate: string }> {
  const admin = createAdminClient()
  let q = admin
    .from("ninefood_store_links")
    .select("app_shop_id, unit_id, id_loja, name, active")
    .eq("active", true)
  if (opts.appShopIds?.length) q = q.in("app_shop_id", opts.appShopIds)
  const { data: links } = await q

  const results: ShopSyncResult[] = []
  for (const link of ((links as any[]) ?? []) as StoreLink[]) {
    const res: ShopSyncResult = {
      appShopId: link.app_shop_id,
      name: link.name,
      unitId: link.unit_id,
      unitCreated: false,
      count: 0,
      bruto: 0,
      liquido: 0,
    }
    try {
      const rows = await getAllShopBillDetail({
        appShopId: link.app_shop_id,
        startDate: opts.startDate,
        endDate: opts.endDate,
      })
      const cityHint = rows[0]?.cityName ?? null
      const { unitId, created } = await resolveUnitForLink(admin, link, cityHint)
      res.unitId = unitId
      res.unitCreated = created

      const records = rows.map((r) => toRecord(link.app_shop_id, r))
      for (let i = 0; i < records.length; i += 500) {
        const { error } = await admin
          .from("ninefood_api_bill")
          .upsert(records.slice(i, i + 500), { onConflict: "app_shop_id,order_id,order_type" })
        if (error) throw new Error(error.message)
      }
      res.count = records.length
      res.bruto = records
        .filter((r) => r.order_type === 1)
        .reduce((s, r) => s + r.meal_original_amount, 0)
      res.liquido = records.reduce((s, r) => s + r.settlement_amount, 0)
    } catch (e) {
      res.error = e instanceof Error ? e.message : String(e)
    }
    results.push(res)
  }
  return { results, startDate: opts.startDate, endDate: opts.endDate }
}
