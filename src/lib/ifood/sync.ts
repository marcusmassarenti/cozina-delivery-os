/**
 * Sync diário do iFood — chamado pelo cron `/api/cron/ifood-sync`.
 *
 * Pra cada unidade da rede com platform=ifood ATIVO e merchant_id (api_store_id)
 * mapeado, dispara em sequência:
 *
 *   1. Reconciliation On Demand (D-1) — mês corrente E mês anterior
 *      Garante captura antes da janela do iFood fechar e idempotência.
 *   2. Financial Events — janela de 7 dias (D-7 → D-1)
 *      Quase real-time, granularidade fina por pedido.
 *
 * Throttle: 6h por (merchant, endpoint). Se já chamou nas últimas 6h, pula.
 * Idempotência: a tabela ifood_api_throttle guarda last_called_at — o gate
 * evita reprocessar quando a vercel acordar o cron 2× no mesmo dia.
 *
 * NOTA: o UPSERT em ifood_financeiro_lancamentos virá depois — esse sync
 * primeiro garante que tudo está disparando + logado. A camada de
 * persistência entra na Onda 4 (quando o auditor confirmar o formato real).
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

import { fetchAllFinancialEvents } from "./events"
import { fetchAndParseReconciliation } from "./reconciliation"
import { checkThrottle, recordCall } from "./throttle"

export type UnitSyncResult = {
  unitId: string
  unitCode: string
  merchantId: string
  reconciliation: {
    competencia: string
    skipped?: string
    ok?: boolean
    status?: number
    rowCount?: number
    error?: string
  }[]
  events?: {
    skipped?: string
    ok?: boolean
    status?: number
    totalEvents?: number
    pagesFetched?: number
    netTransfer?: number
    error?: string
  }
}

/** YYYY-MM-DD em horário local. */
function ymd(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

/** YYYY-MM a partir de uma Date. */
function ym(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  return `${yyyy}-${mm}`
}

/** Lista unidades com iFood ativo e merchant mapeado. */
async function listIfoodUnits() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("unit_platforms")
    .select("unit_id, api_store_id, units!inner(id, code)")
    .eq("platform", "ifood")
    .eq("active", true)
    .not("api_store_id", "is", null)

  if (error) throw new Error(`Falha ao listar unidades: ${error.message}`)
  return (data ?? [])
    .map((r) => ({
      unitId: (r.units as unknown as { id: string }).id,
      unitCode: (r.units as unknown as { code: string }).code,
      merchantId: r.api_store_id as string,
    }))
    .filter((r) => !!r.merchantId)
}

/** Executa um sync end-to-end pra TODAS as unidades. */
export async function syncIfoodAll(): Promise<{
  ranAt: string
  unitsProcessed: number
  unitsSkippedNoMerchant: number
  results: UnitSyncResult[]
}> {
  const units = await listIfoodUnits()
  const results: UnitSyncResult[] = []

  for (const u of units) {
    const r: UnitSyncResult = {
      unitId: u.unitId,
      unitCode: u.unitCode,
      merchantId: u.merchantId,
      reconciliation: [],
    }

    // ---- Reconciliation: mês corrente + mês anterior ------------------------
    const now = new Date()
    const competencias = [
      ym(now),
      ym(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    ]

    for (const competencia of competencias) {
      const ep = `reconciliation:${competencia}`
      const gate = await checkThrottle(u.merchantId, ep, 6)
      if (!gate.ok) {
        r.reconciliation.push({ competencia, skipped: gate.reason })
        continue
      }
      try {
        const recon = await fetchAndParseReconciliation(
          u.merchantId,
          competencia,
        )
        await recordCall(u.merchantId, ep, recon.linkStatus)
        if (recon.ok) {
          r.reconciliation.push({
            competencia,
            ok: true,
            status: recon.linkStatus,
            rowCount: recon.rowCount,
          })
        } else {
          r.reconciliation.push({
            competencia,
            ok: false,
            status: recon.linkStatus,
            error: recon.linkError,
          })
        }
      } catch (e) {
        await recordCall(u.merchantId, ep)
        r.reconciliation.push({
          competencia,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }

    // ---- Financial Events: últimos 7 dias (D-7 a D-1) -----------------------
    const end = new Date()
    end.setDate(end.getDate() - 1)
    const begin = new Date(end)
    begin.setDate(begin.getDate() - 6)

    const epEv = "financial-events:weekly"
    const gateEv = await checkThrottle(u.merchantId, epEv, 6)
    if (!gateEv.ok) {
      r.events = { skipped: gateEv.reason }
    } else {
      try {
        const ev = await fetchAllFinancialEvents(u.merchantId, ymd(begin), ymd(end))
        await recordCall(u.merchantId, epEv, ev.firstStatus)
        r.events = {
          ok: ev.ok,
          status: ev.firstStatus,
          totalEvents: ev.totalEvents,
          pagesFetched: ev.pagesFetched,
          netTransfer: ev.netTransfer,
          error: ev.error,
        }
      } catch (e) {
        await recordCall(u.merchantId, epEv)
        r.events = {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        }
      }
    }

    results.push(r)
  }

  return {
    ranAt: new Date().toISOString(),
    unitsProcessed: results.length,
    unitsSkippedNoMerchant: 0, // já filtrados no listIfoodUnits()
    results,
  }
}
