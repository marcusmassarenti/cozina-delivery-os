"use server"

import { revalidatePath } from "next/cache"

import {
  getAnticipations,
  summarizeAnticipations,
  type AnticipationsMetrics,
  type IfoodAnticipationItem,
} from "@/lib/ifood/anticipations"
import {
  fetchAllFinancialEvents,
  type IfoodFinancialEvent,
} from "@/lib/ifood/events"
import {
  listIfoodMerchants,
  type IfoodMerchant,
} from "@/lib/ifood/merchants"
import { fetchAndParseReconciliation } from "@/lib/ifood/reconciliation"
import { getIfoodOrder } from "@/lib/ifood/sales"
import {
  getSettlements,
  summarizeSettlements,
  type IfoodSettlementItem,
  type SettlementsMetrics,
} from "@/lib/ifood/settlements"
import { createAdminClient } from "@/lib/supabase/admin"

export type TestSalesState = {
  ok: boolean
  status?: number
  retries?: number
  durationMs?: number
  data?: unknown
  raw?: string
  error?: string
}

/**
 * Server action que dispara o endpoint Sales (GET order/{id}) e devolve
 * resposta crua pra exibição na página de homologação.
 */
export async function testSales(
  _prev: TestSalesState,
  formData: FormData,
): Promise<TestSalesState> {
  const orderId = String(formData.get("orderId") ?? "").trim()
  if (!orderId) {
    return { ok: false, error: "Informe um order id." }
  }
  const r = await getIfoodOrder(orderId)
  // Força refetch dos logs no Server Component da página de homolog
  revalidatePath("/integracao/ifood-homolog")
  return {
    ok: r.ok,
    status: r.status,
    retries: r.retries,
    durationMs: r.durationMs,
    data: r.data,
    raw: r.raw.slice(0, 50_000),
    error: r.error,
  }
}

// ---- Reconciliation ---------------------------------------------------------

export type TestReconciliationState = {
  ok: boolean
  linkStatus?: number
  downloadUrl?: string
  sizeBytes?: number
  rowCount?: number
  headers?: string[]
  sample?: Record<string, string>[]
  metrics?: { countSim: number; sumSim: number; countNao: number }
  retries?: number
  durationMs?: number
  decompressedDurationMs?: number
  linkRaw?: string
  error?: string
}

/**
 * Dispara o fluxo completo de Reconciliation:
 *   1) GET /v3/reconciliation pra pegar o downloadUrl
 *   2) baixa o .gz
 *   3) descompacta + parseia
 *   4) calcula métricas (impacto_no_repasse SIM/NÃO + soma)
 *
 * Devolve métricas + amostra de 50 linhas pra UI mostrar pro auditor.
 */
export async function testReconciliation(
  _prev: TestReconciliationState,
  formData: FormData,
): Promise<TestReconciliationState> {
  const merchantId = String(formData.get("merchantId") ?? "").trim()
  const competencia = String(formData.get("competencia") ?? "").trim()
  if (!merchantId) return { ok: false, error: "Informe o merchantId." }
  if (!/^\d{4}-\d{2}$/.test(competencia)) {
    return { ok: false, error: "Competencia deve estar no formato YYYY-MM." }
  }
  try {
    const r = await fetchAndParseReconciliation(merchantId, competencia)
    revalidatePath("/integracao/ifood-homolog")
    if (!r.ok) {
      return {
        ok: false,
        linkStatus: r.linkStatus,
        retries: r.retries,
        durationMs: r.durationMs,
        linkRaw: r.linkRaw?.slice(0, 5_000),
        error: r.linkError ?? "Falha ao obter/baixar reconciliation",
      }
    }
    return {
      ok: true,
      linkStatus: r.linkStatus,
      downloadUrl: r.downloadUrl,
      sizeBytes: r.sizeBytes,
      rowCount: r.rowCount,
      headers: r.headers,
      sample: r.sample,
      metrics: r.metrics,
      retries: r.retries,
      durationMs: r.durationMs,
      decompressedDurationMs: r.decompressedDurationMs,
    }
  } catch (e) {
    revalidatePath("/integracao/ifood-homolog")
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

// ---- Financial Events -------------------------------------------------------

export type TestEventsState = {
  ok: boolean
  firstStatus?: number
  lastStatus?: number
  pagesFetched?: number
  totalEvents?: number
  netTransfer?: number
  countImpact?: { true: number; false: number }
  sample?: IfoodFinancialEvent[]
  retries?: number
  durationMs?: number
  rawSample?: string
  error?: string
}

/**
 * Itera Financial Events do período (máx 33 dias).
 * Devolve métricas agregadas + amostra de 10 eventos.
 */
export async function testFinancialEvents(
  _prev: TestEventsState,
  formData: FormData,
): Promise<TestEventsState> {
  const merchantId = String(formData.get("merchantId") ?? "").trim()
  const beginDate = String(formData.get("beginDate") ?? "").trim()
  const endDate = String(formData.get("endDate") ?? "").trim()
  if (!merchantId) return { ok: false, error: "Informe o merchantId." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(beginDate)) {
    return { ok: false, error: "beginDate deve estar no formato YYYY-MM-DD." }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return { ok: false, error: "endDate deve estar no formato YYYY-MM-DD." }
  }
  try {
    const r = await fetchAllFinancialEvents(merchantId, beginDate, endDate)
    revalidatePath("/integracao/ifood-homolog")
    return {
      ok: r.ok,
      firstStatus: r.firstStatus,
      lastStatus: r.lastStatus,
      pagesFetched: r.pagesFetched,
      totalEvents: r.totalEvents,
      netTransfer: r.netTransfer,
      countImpact: r.countImpact,
      sample: r.events.slice(0, 10),
      retries: r.retries,
      durationMs: r.totalDurationMs,
      rawSample: r.rawSample,
      error: r.error,
    }
  } catch (e) {
    revalidatePath("/integracao/ifood-homolog")
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

// ---- Merchant listing -------------------------------------------------------

export type TestMerchantsState = {
  ok: boolean
  status?: number
  count?: number
  durationMs?: number
  retries?: number
  merchants?: IfoodMerchant[]
  rawSample?: string
  error?: string
}

/**
 * Lista os merchants liberados pra esse app + faz UPSERT na cache local
 * (ifood_merchants). Devolve preview pra UI.
 */
export async function testListMerchants(
  _prev: TestMerchantsState,
  _formData: FormData,
): Promise<TestMerchantsState> {
  try {
    const r = await listIfoodMerchants()
    if (!r.ok || !r.data) {
      revalidatePath("/integracao/ifood-homolog")
      return {
        ok: false,
        status: r.status,
        durationMs: r.durationMs,
        retries: r.retries,
        rawSample: r.raw.slice(0, 5_000),
        error: r.error ?? `HTTP ${r.status}`,
      }
    }

    // UPSERT na cache local
    const admin = createAdminClient()
    const rows = r.data.map((m) => ({
      id: m.id,
      name: m.name ?? null,
      corporate_name: m.corporateName ?? null,
      cnpj: m.documents?.CNPJ?.value ?? null,
      city: m.address?.city ?? null,
      state: m.address?.state ?? null,
      merchant_state: m.merchantState ?? null,
      raw: m as unknown as object,
      last_seen_at: new Date().toISOString(),
    }))
    if (rows.length > 0) {
      await admin
        .from("ifood_merchants")
        .upsert(rows, { onConflict: "id", ignoreDuplicates: false })
    }

    revalidatePath("/integracao/ifood-homolog")
    return {
      ok: true,
      status: r.status,
      count: r.data.length,
      durationMs: r.durationMs,
      retries: r.retries,
      merchants: r.data.slice(0, 50),
      rawSample: r.raw.slice(0, 5_000),
    }
  } catch (e) {
    revalidatePath("/integracao/ifood-homolog")
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

// ---- Settlements ------------------------------------------------------------

export type TestSettlementsState = {
  ok: boolean
  status?: number
  balance?: number
  metrics?: SettlementsMetrics
  items?: IfoodSettlementItem[]
  durationMs?: number
  retries?: number
  rawSample?: string
  error?: string
}

export async function testSettlements(
  _prev: TestSettlementsState,
  formData: FormData,
): Promise<TestSettlementsState> {
  const merchantId = String(formData.get("merchantId") ?? "").trim()
  const beginDate = String(formData.get("beginDate") ?? "").trim()
  const endDate = String(formData.get("endDate") ?? "").trim()
  if (!merchantId) return { ok: false, error: "Informe o merchantId." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(beginDate)) {
    return { ok: false, error: "beginDate deve ser YYYY-MM-DD." }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return { ok: false, error: "endDate deve ser YYYY-MM-DD." }
  }
  try {
    const r = await getSettlements(merchantId, beginDate, endDate)
    revalidatePath("/integracao/ifood-homolog")
    if (!r.ok || !r.data) {
      return {
        ok: false,
        status: r.status,
        durationMs: r.durationMs,
        retries: r.retries,
        rawSample: r.raw.slice(0, 5_000),
        error: r.error ?? `HTTP ${r.status}`,
      }
    }
    const items = (r.data.settlements ?? []).flatMap(
      (p) => p.closingItems ?? [],
    )
    return {
      ok: true,
      status: r.status,
      balance: r.data.balance,
      metrics: summarizeSettlements(r.data),
      items: items.slice(0, 20),
      durationMs: r.durationMs,
      retries: r.retries,
      rawSample: r.raw.slice(0, 5_000),
    }
  } catch (e) {
    revalidatePath("/integracao/ifood-homolog")
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

// ---- Anticipations ----------------------------------------------------------

export type TestAnticipationsState = {
  ok: boolean
  status?: number
  balance?: number
  metrics?: AnticipationsMetrics
  items?: IfoodAnticipationItem[]
  durationMs?: number
  retries?: number
  rawSample?: string
  error?: string
}

export async function testAnticipations(
  _prev: TestAnticipationsState,
  formData: FormData,
): Promise<TestAnticipationsState> {
  const merchantId = String(formData.get("merchantId") ?? "").trim()
  const beginDate = String(formData.get("beginDate") ?? "").trim()
  const endDate = String(formData.get("endDate") ?? "").trim()
  if (!merchantId) return { ok: false, error: "Informe o merchantId." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(beginDate)) {
    return { ok: false, error: "beginDate deve ser YYYY-MM-DD." }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return { ok: false, error: "endDate deve ser YYYY-MM-DD." }
  }
  try {
    const r = await getAnticipations(merchantId, beginDate, endDate)
    revalidatePath("/integracao/ifood-homolog")
    if (!r.ok || !r.data) {
      return {
        ok: false,
        status: r.status,
        durationMs: r.durationMs,
        retries: r.retries,
        rawSample: r.raw.slice(0, 5_000),
        error: r.error ?? `HTTP ${r.status}`,
      }
    }
    const items = (r.data.settlements ?? []).flatMap(
      (p) => p.closingItems ?? [],
    )
    return {
      ok: true,
      status: r.status,
      balance: r.data.balance,
      metrics: summarizeAnticipations(r.data),
      items: items.slice(0, 20),
      durationMs: r.durationMs,
      retries: r.retries,
      rawSample: r.raw.slice(0, 5_000),
    }
  } catch (e) {
    revalidatePath("/integracao/ifood-homolog")
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}
