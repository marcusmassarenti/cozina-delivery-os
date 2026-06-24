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
import { parseFinanceiroRows } from "@/lib/import/ifood/parse-financeiro"
import { persistFinanceiro } from "@/lib/import/ifood/persist-financeiro"

import { fetchAllFinancialEvents } from "./events"
import { downloadReconciliationRows } from "./reconciliation"
import { checkThrottle, recordCall } from "./throttle"

export type UnitSyncResult = {
  unitId: string
  unitCode: string
  unitName: string
  merchantId: string
  reconciliation: {
    competencia: string
    skipped?: string
    ok?: boolean
    status?: number
    rowCount?: number
    /** Linhas efetivamente gravadas em ifood_financeiro_lancamentos. */
    persisted?: number
    /** true se substituiu lançamentos pré-existentes da competência. */
    substituido?: boolean
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
    .select("unit_id, api_store_id, units!inner(id, code, name)")
    .eq("platform", "ifood")
    .eq("active", true)
    .not("api_store_id", "is", null)

  if (error) throw new Error(`Falha ao listar unidades: ${error.message}`)
  return (data ?? [])
    .map((r) => ({
      unitId: (r.units as unknown as { id: string }).id,
      unitCode: (r.units as unknown as { code: string }).code,
      unitName: (r.units as unknown as { name: string }).name,
      merchantId: r.api_store_id as string,
    }))
    .filter((r) => !!r.merchantId)
}

type ReconLine = UnitSyncResult["reconciliation"][number]
type UnitLite = {
  unitId: string
  unitCode: string
  unitName: string
  merchantId: string
}
type Admin = ReturnType<typeof createAdminClient>

/**
 * Sincroniza UMA competência (On Demand: POST → poll → baixa → grava).
 * Idempotente: persistFinanceiro dedupe por competência.
 */
async function syncReconciliationCompetencia(
  u: UnitLite,
  competencia: string,
  force: boolean,
  admin: Admin,
): Promise<ReconLine> {
  const ep = `reconciliation:${competencia}`
  if (!force) {
    const gate = await checkThrottle(u.merchantId, ep, 6)
    if (!gate.ok) return { competencia, skipped: gate.reason }
  }
  try {
    const recon = await downloadReconciliationRows(u.merchantId, competencia)
    await recordCall(u.merchantId, ep, recon.linkStatus)
    if (!recon.ok) {
      return {
        competencia,
        ok: false,
        status: recon.linkStatus,
        error: recon.linkError,
      }
    }
    // Mês sem operação devolve CSV vazio (só cabeçalho) — sucesso, 0 linhas.
    if (recon.rows.length === 0) {
      return { competencia, ok: true, status: recon.linkStatus, rowCount: 0, persisted: 0 }
    }
    // Mesmo parser/persistência da importação manual (dedupe por competência).
    const parsed = parseFinanceiroRows(recon.rows)
    const saved = await persistFinanceiro(
      parsed,
      { unitId: u.unitId, code: u.unitCode },
      { filename: `API Reconciliation ${competencia}`, importedBy: null, cadencia: "mensal" },
      admin,
    )
    return {
      competencia,
      ok: true,
      status: recon.linkStatus,
      rowCount: recon.rows.length,
      persisted: saved.rowsImported,
      substituido: saved.substituido,
    }
  } catch (e) {
    await recordCall(u.merchantId, ep)
    return { competencia, ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Sincroniza UMA unidade: reconciliations (competências em paralelo) + events. */
async function syncOneUnit(
  u: UnitLite,
  competencias: string[],
  force: boolean,
  admin: Admin,
): Promise<UnitSyncResult> {
  const r: UnitSyncResult = {
    unitId: u.unitId,
    unitCode: u.unitCode,
    unitName: u.unitName,
    merchantId: u.merchantId,
    reconciliation: [],
  }

  // As competências rodam em paralelo (cada On Demand leva ~30–60s gerando).
  r.reconciliation = await Promise.all(
    competencias.map((c) => syncReconciliationCompetencia(u, c, force, admin)),
  )

  // ---- Financial Events: últimos 7 dias (D-7 a D-1) ----
  const end = new Date()
  end.setDate(end.getDate() - 1)
  const begin = new Date(end)
  begin.setDate(begin.getDate() - 6)
  const epEv = "financial-events:weekly"
  const gateEv = force
    ? ({ ok: true } as const)
    : await checkThrottle(u.merchantId, epEv, 6)
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
      r.events = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }
  return r
}

/**
 * Executa um sync end-to-end pra TODAS as unidades.
 *
 * `force` ignora o throttle de 6h — usado pelo botão manual "Sincronizar agora"
 * (o cron diário chama sem force, respeitando o gate pra não martelar a API).
 *
 * As unidades rodam EM PARALELO: como o On Demand é assíncrono (gera o arquivo
 * sob demanda, ~30–60s cada), fazer sequencial estouraria o timeout. No 2º run
 * dentro de 6h o iFood devolve 409 e o arquivo já está pronto → fica rápido.
 */
export async function syncIfoodAll(
  opts: { force?: boolean } = {},
): Promise<{
  ranAt: string
  unitsProcessed: number
  unitsSkippedNoMerchant: number
  results: UnitSyncResult[]
}> {
  const force = opts.force === true
  const units = await listIfoodUnits()
  const admin = createAdminClient()

  // Reconciliation: mês corrente + mês anterior (mesmas competências pra todos).
  const now = new Date()
  const competencias = [
    ym(now),
    ym(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
  ]

  const results = await Promise.all(
    units.map((u) => syncOneUnit(u, competencias, force, admin)),
  )

  return {
    ranAt: new Date().toISOString(),
    unitsProcessed: results.length,
    unitsSkippedNoMerchant: 0, // já filtrados no listIfoodUnits()
    results,
  }
}
