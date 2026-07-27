/**
 * Investimento em promoção no 99 Food, por unidade.
 *
 * O dado já estava no banco: o sync grava o extrato inteiro em
 * `ninefood_api_bill.raw` (46 campos) desde o começo, mas só três deles eram
 * lidos. Aqui não há chamada nova à API — é leitura do que já foi coletado.
 *
 * ⚠️ DUAS BOLSAS DE DINHEIRO DIFERENTES, e misturar dá contagem dupla:
 *
 *   - `descontoItem` (shopActivityOutcome) — desconto no PRODUTO bancado pela
 *     loja. Não aparece em nenhum outro lugar do sistema. É o número novo.
 *   - `freteGratis` (freeDeliveryOutcome) — campanha de frete grátis. JÁ é
 *     contabilizado como custo de entrega em `taxa-entrega.ts`, junto com o
 *     b2pDeliveryAmount. Vem separado aqui para dar a leitura de marketing,
 *     mas somar os dois num "custo total" contaria o frete duas vezes.
 *
 * Sinal: no extrato da 99 despesa vem NEGATIVA e subsídio POSITIVO. A doc não
 * documenta essa convenção (nem diz que os valores são em centavos — isso vem
 * da doc de pedidos), então normalizamos com Math.abs e conferimos contra
 * produção antes de usar.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export type PromoInvest = {
  /** Desconto em item bancado pela loja, em reais. Número novo. */
  descontoItem: number
  /** Frete grátis bancado pela loja, em reais. JÁ contado no custo de entrega. */
  freteGratis: number
  /** O que a 99 bancou (item + frete), em reais. */
  subsidio99: number
  /** Linhas do extrato com alguma promoção. */
  pedidosComPromo: number
}

export function emptyPromo(): PromoInvest {
  return {
    descontoItem: 0,
    freteGratis: 0,
    subsidio99: 0,
    pedidosComPromo: 0,
  }
}

/** Soma só o que a loja bancou — o total que faz sentido como "investimento". */
export function totalInvestido(p: PromoInvest): number {
  return p.descontoItem + p.freteGratis
}

async function pageAll<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
  maxRows = 300000,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (from < maxRows) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) {
      console.error("promocao-99 pageAll error:", error.message)
      break
    }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

const num = (raw: Record<string, unknown> | null, k: string) =>
  Number((raw?.[k] as string | number | undefined) ?? 0) || 0

/**
 * Investimento em promoção por unidade no período.
 *
 * `dateRange` (YYYY-MM-DD) tem precedência sobre year/month, pro caso do
 * filtro de período do dashboard não bater com o mês cheio.
 */
export async function getPromo99ByUnits(
  unitIds: string[],
  year: number,
  month: number,
  dateRange?: { start: string; end: string },
): Promise<Map<string, PromoInvest>> {
  const out = new Map<string, PromoInvest>()
  if (unitIds.length === 0) return out

  const admin = createAdminClient()
  const { data: links } = await admin
    .from("ninefood_store_links")
    .select("app_shop_id, unit_id")
    .in("unit_id", unitIds)

  const shopToUnit = new Map<string, string>()
  for (const l of links ?? [])
    shopToUnit.set(l.app_shop_id as string, l.unit_id as string)
  const shopIds = [...shopToUnit.keys()]
  if (shopIds.length === 0) return out

  const bills = await pageAll<{
    app_shop_id: string
    raw: Record<string, unknown> | null
  }>((a, b) => {
    let q = admin
      .from("ninefood_api_bill")
      .select("app_shop_id, raw")
      .in("app_shop_id", shopIds)
    if (dateRange) {
      q = q
        .gte("business_date", dateRange.start)
        .lte("business_date", dateRange.end)
    } else {
      const last = new Date(year, month, 0).getDate()
      const mm = String(month).padStart(2, "0")
      q = q
        .gte("business_date", `${year}-${mm}-01`)
        .lte("business_date", `${year}-${mm}-${String(last).padStart(2, "0")}`)
    }
    return q.order("id").range(a, b)
  })

  for (const r of bills) {
    const unitId = shopToUnit.get(r.app_shop_id)
    if (!unitId) continue

    const item = Math.abs(num(r.raw, "shopActivityOutcome"))
    const frete = Math.abs(num(r.raw, "freeDeliveryOutcome"))
    const subs =
      Math.abs(num(r.raw, "shopActivitySubsidy")) +
      Math.abs(num(r.raw, "freeDeliverySubsidy"))
    if (item === 0 && frete === 0 && subs === 0) continue

    const acc = out.get(unitId) ?? emptyPromo()
    acc.descontoItem += item / 100
    acc.freteGratis += frete / 100
    acc.subsidio99 += subs / 100
    acc.pedidosComPromo += 1
    out.set(unitId, acc)
  }

  return out
}

/** Consolidado da rede no período. */
export async function getNetworkPromo99(
  unitIds: string[],
  year: number,
  month: number,
  dateRange?: { start: string; end: string },
): Promise<PromoInvest> {
  const porUnidade = await getPromo99ByUnits(unitIds, year, month, dateRange)
  const total = emptyPromo()
  for (const p of porUnidade.values()) {
    total.descontoItem += p.descontoItem
    total.freteGratis += p.freteGratis
    total.subsidio99 += p.subsidio99
    total.pedidosComPromo += p.pedidosComPromo
  }
  return total
}
