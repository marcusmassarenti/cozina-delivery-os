/**
 * Motor de sincronização do financeiro do 99 Food.
 * Puxa o extrato pedido-a-pedido (getShopBillDetail) e grava em ninefood_bill
 * (upsert idempotente por unit_id + order_id + order_type).
 *
 * Valores da API vêm em CENTAVOS → convertidos pra REAIS aqui.
 * Data do pedido derivada de business_ts no fuso America/Sao_Paulo.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

import { getAllShopBillDetail, type NinefoodBillRow } from "./financeiro"

const SP_TZ = "America/Sao_Paulo"
const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: SP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** Epoch (s) → { data 'YYYY-MM-DD', year, month } no fuso de São Paulo. */
function brtDateParts(ts: number): {
  data: string
  year: number
  month: number
} {
  const d = new Date((ts || 0) * 1000)
  const s = dateFmt.format(d) // YYYY-MM-DD
  const [y, m] = s.split("-").map(Number)
  return { data: s, year: y, month: m }
}

/** Centavos (int) → reais (number, 2 casas). */
const toReais = (cents: number | undefined | null): number =>
  Math.round(Number(cents ?? 0)) / 100

const asText = (v: unknown): string | null =>
  v == null || v === "" ? null : String(v)

const isISODate = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)

function mapRow(unitId: string, appShopId: string, r: NinefoodBillRow) {
  const { data, year, month } = brtDateParts(r.businessTs)
  return {
    unit_id: unitId,
    app_shop_id: appShopId,
    order_id: String(r.orderId),
    order_index: asText(r.orderIndex),
    order_type: r.orderType,
    delivery_type: r.deliveryType ?? null,
    business_ts: r.businessTs ?? null,
    business_datetime: asText(r.businessDateTime),
    data,
    ref_year: year,
    ref_month: month,
    meal_original: toReais(r.mealOriginalAmount),
    shop_activity_outcome: toReais(r.shopActivityOutcome),
    shop_activity_subsidy: toReais(r.shopActivitySubsidy),
    shop_delivery: toReais(r.shopDeliveryAmount),
    shop_pre_tips: toReais(r.shopPreTips),
    free_delivery_outcome: toReais(r.freeDeliveryOutcome),
    free_delivery_subsidy: toReais(r.freeDeliverySubsidy),
    commission_base: toReais(r.commissionBaseAmount),
    commission_rate: Number(r.commissionRate ?? 0) / 100, // 3500 → 35.00 (%)
    commission_amount: toReais(r.commissionAmount),
    commission_subsidy: toReais(r.commissionSubsidyAmount),
    b2p_delivery: toReais(r.b2pDeliveryAmount),
    pay_commission: toReais(r.payCommissionAmount),
    min_value_diff: toReais(r.minValueDifferenceAmount),
    order_amount: toReais(r.orderAmount),
    cash_balance: toReais(r.cashBalance),
    meal_voucher: toReais(r.mealVoucherAmount),
    settlement_amount: toReais(r.settlementAmount),
    meal_loss_deduct: toReais(r.mealLossDeductAmount),
    vat_amount: toReais(r.vatAmount),
    merchant_appeal: toReais(r.merchantAppealAmount),
    payment_method: r.paymentMethod ?? null,
    payment_channel: r.paymentChannel ?? null,
    payment_method_detail: r.paymentMethodDetail ?? null,
    card_brand: asText(r.cardBrand),
    cancel_ts: r.cancelTs ?? null,
    cancel_datetime: asText(r.cancelDateTime),
    cancel_reason: r.cancelReason ?? null,
    expect_settle_date: isISODate(r.expectSettleDate)
      ? r.expectSettleDate
      : null,
    day_payment_id: asText(r.dayPaymentId),
    shop_id: asText(r.shopId),
    shop_name: asText(r.shopName),
    contractor_id: asText(r.contractorId),
    contractor_name: asText(r.contractorName),
    city_id: asText(r.cityId),
    city_name: asText(r.cityName),
    raw: r as unknown as Record<string, unknown>,
  }
}

export type SyncResult = {
  fetched: number
  upserted: number
  liquidoTotal: number // soma settlement_amount (R$), pra conferência rápida
}

/**
 * Sincroniza o extrato financeiro de UMA loja (app_shop_id) num período.
 * Datas em YYYYMMDD (período máx 31 dias na API; quebre antes se precisar).
 */
export async function syncNinefoodBill(opts: {
  unitId: string
  appShopId: string
  startDate: string
  endDate: string
}): Promise<SyncResult> {
  const rows = await getAllShopBillDetail({
    appShopId: opts.appShopId,
    startDate: opts.startDate,
    endDate: opts.endDate,
  })
  if (rows.length === 0) return { fetched: 0, upserted: 0, liquidoTotal: 0 }

  const records = rows.map((r) => mapRow(opts.unitId, opts.appShopId, r))
  const liquidoTotal = records.reduce((s, r) => s + r.settlement_amount, 0)

  const admin = createAdminClient()
  const CHUNK = 500
  let upserted = 0
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK)
    const { error } = await admin
      .from("ninefood_bill")
      .upsert(chunk, { onConflict: "unit_id,order_id,order_type" })
    if (error) {
      throw new Error(`upsert ninefood_bill falhou: ${error.message}`)
    }
    upserted += chunk.length
  }
  return { fetched: rows.length, upserted, liquidoTotal }
}

/**
 * Período maior que 31 dias → quebra em janelas de até 31 dias e soma.
 * startDate/endDate em YYYYMMDD.
 */
export async function syncNinefoodBillRange(opts: {
  unitId: string
  appShopId: string
  startDate: string
  endDate: string
}): Promise<SyncResult> {
  const toDate = (s: string) =>
    new Date(
      Number(s.slice(0, 4)),
      Number(s.slice(4, 6)) - 1,
      Number(s.slice(6, 8)),
    )
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
      d.getDate(),
    ).padStart(2, "0")}`

  const start = toDate(opts.startDate)
  const end = toDate(opts.endDate)
  const total: SyncResult = { fetched: 0, upserted: 0, liquidoTotal: 0 }

  let winStart = start
  while (winStart <= end) {
    const winEnd = new Date(winStart)
    winEnd.setDate(winEnd.getDate() + 30) // janela de 31 dias inclusiva
    const effEnd = winEnd > end ? end : winEnd
    const part = await syncNinefoodBill({
      unitId: opts.unitId,
      appShopId: opts.appShopId,
      startDate: fmt(winStart),
      endDate: fmt(effEnd),
    })
    total.fetched += part.fetched
    total.upserted += part.upserted
    total.liquidoTotal += part.liquidoTotal
    winStart = new Date(effEnd)
    winStart.setDate(winStart.getDate() + 1)
  }
  return total
}
