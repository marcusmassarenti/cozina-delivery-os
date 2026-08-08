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

import { getAnticipations, summarizeAnticipations } from "./anticipations"
import { logPedidosSync, syncPedidosDaLoja } from "./pedidos-sync"
import { downloadReconciliationRows } from "./reconciliation"
import { checkThrottle, recordCall } from "./throttle"

export type UnitSyncResult = {
  unitId: string
  unitCode: string
  unitName: string
  /** Cliente dono da loja — o resultado do sync mistura várias holdings. */
  holdingName?: string
  merchantId: string
  /** true = a loja não tinha NENHUM lançamento iFood antes desta sync —
   *  estreia na integração (vira o aviso "loja nova conectada"). */
  primeiraSincronizacao?: boolean
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
    /** Linhas da competência que JÁ existiam antes desta sync (0 = período novo). */
    jaExistia?: number
    /** Variação líquida de linhas vs a sync anterior (persisted − jaExistia, ≥0). */
    novas?: number
    error?: string
  }[]
  /**
   * Pedidos/pagamento via Financial Events (substitui o "Relatório de pedidos").
   * Uma entrada por competência sincronizada.
   */
  pedidos?: {
    competencia: string
    skipped?: string
    ok?: boolean
    eventos?: number
    /** Pedidos distintos encontrados na competência. */
    pedidos?: number
    /** Linhas gravadas em ifood_pedidos. */
    gravados?: number
    error?: string
  }[]
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

/**
 * Lista unidades com iFood ativo e merchant mapeado.
 *
 * `unitIds` restringe às unidades dadas — é o que escopa o SYNC MANUAL à
 * empresa de quem clicou. O cron não passa filtro (roda pra rede toda, que
 * é o correto: ele é nosso, não do tenant).
 */
async function listIfoodUnits(unitIds?: string[] | null) {
  const admin = createAdminClient()
  let q = admin
    .from("unit_platforms")
    // brands→holdings junto: sem o nome do CLIENTE, o resultado do sync vira
    // uma lista de UUIDs que não diz de quem é cada loja (Marcus, 07/ago).
    .select("unit_id, api_store_id, units!inner(id, code, name, brands!inner(holdings!inner(name)))")
    .eq("platform", "ifood")
    .eq("active", true)
    .not("api_store_id", "is", null)
  if (unitIds) q = q.in("unit_id", unitIds)
  const { data, error } = await q

  if (error) throw new Error(`Falha ao listar unidades: ${error.message}`)
  return (data ?? [])
    .map((r) => ({
      unitId: (r.units as unknown as { id: string }).id,
      unitCode: (r.units as unknown as { code: string }).code,
      unitName: (r.units as unknown as { name: string }).name,
      holdingName:
        (r.units as unknown as {
          brands?: { holdings?: { name?: string } }
        }).brands?.holdings?.name ?? "—",
      merchantId: r.api_store_id as string,
    }))
    .filter((r) => !!r.merchantId)
}

type ReconLine = UnitSyncResult["reconciliation"][number]
type UnitLite = {
  unitId: string
  unitCode: string
  unitName: string
  /** Cliente dono da loja — o resultado do sync mistura várias holdings. */
  holdingName?: string
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
  // O MÊS CORRENTE sempre regenera (ignora o throttle de 6h): a conciliação do
  // mês em aberto muda todo dia conforme o iFood liquida, e reaproveitar a versão
  // velha deixava o dashboard travado em dias passados (ex.: junho parou em 13/06).
  // Meses fechados seguem com throttle (são estáveis).
  const forceEff = force || competencia === ym(new Date())
  if (!forceEff) {
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
    // Carga recusada por encolher demais: o mês antigo continua de pé. Vai
    // como ok:false pra aparecer no `naoResolvidas` do cron e no e-mail de
    // saúde — trava silenciosa seria só outro jeito de perder dado sem saber.
    if (saved.regressaoBloqueada) {
      const r = saved.regressaoBloqueada
      return {
        competencia,
        ok: false,
        status: recon.linkStatus,
        rowCount: recon.rows.length,
        persisted: 0,
        error:
          `carga recusada: o iFood devolveu ${r.recebido} lançamentos contra ` +
          `${r.anterior} já gravados (queda de ${r.queda}%). O mês anterior foi ` +
          `mantido — reprocessar mais tarde.`,
      }
    }

    return {
      competencia,
      ok: true,
      status: recon.linkStatus,
      rowCount: recon.rows.length,
      persisted: saved.rowsImported,
      substituido: saved.substituido,
      jaExistia: saved.jaExistia,
      novas: Math.max(0, saved.rowsImported - saved.jaExistia),
    }
  } catch (e) {
    await recordCall(u.merchantId, ep)
    return { competencia, ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Grava a TAXA DE ANTECIPAÇÃO de UMA competência em ifood_antecipacoes.
 *
 * A antecipação (juro por receber o repasse adiantado) NÃO vem na Conciliação —
 * é o endpoint Anticipation API v3. Buscamos por janela de data de cálculo do
 * mês e somamos `feeAmount`. Idempotente (upsert por unit+competência).
 *
 * Erro/empty NÃO derruba o sync: grava 0 ou pula. O DRE só mostra a linha quando
 * fee > 0, então degradar pra 0 é seguro.
 */
async function syncAntecipacaoCompetencia(
  u: UnitLite,
  competencia: string,
  force: boolean,
  admin: Admin,
): Promise<void> {
  const ep = `antecipacao:${competencia}`
  // Mês corrente sempre regenera (mesma razão do reconciliation acima).
  const forceEff = force || competencia === ym(new Date())
  if (!forceEff) {
    const gate = await checkThrottle(u.merchantId, ep, 6)
    if (!gate.ok) return
  }
  const m = competencia.match(/^(\d{4})-(\d{2})$/)
  if (!m) return
  const year = Number(m[1])
  const month = Number(m[2])
  const lastDay = new Date(year, month, 0).getDate()
  const begin = `${competencia}-01`
  const end = `${competencia}-${String(lastDay).padStart(2, "0")}`

  try {
    const res = await getAnticipations(u.merchantId, begin, end)
    await recordCall(u.merchantId, ep, res.status)
    if (!res.ok || !res.data) return
    const s = summarizeAnticipations(res.data)
    await admin.from("ifood_antecipacoes").upsert(
      {
        unit_id: u.unitId,
        competencia,
        ref_year: year,
        ref_month: month,
        merchant_id: u.merchantId,
        fee_amount: s.sumFee,
        original_amount: s.sumOriginal,
        anticipated_amount: s.sumAnticipated,
        items_count: s.countItems,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "unit_id,competencia" },
    )
  } catch {
    await recordCall(u.merchantId, ep)
    // silencioso: antecipação é complementar, não pode quebrar o sync financeiro.
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
    holdingName: u.holdingName,
    merchantId: u.merchantId,
    reconciliation: [],
  }

  // Estreia? Sem NENHUM lançamento anterior = loja recém-conectada.
  const { count: jaTinhaAlgo } = await admin
    .from("ifood_financeiro_lancamentos")
    .select("id", { count: "exact", head: true })
    .eq("unit_id", u.unitId)
  const estreando = (jaTinhaAlgo ?? 0) === 0

  // As competências rodam em paralelo (cada On Demand leva ~30–60s gerando).
  r.reconciliation = await Promise.all(
    competencias.map((c) => syncReconciliationCompetencia(u, c, force, admin)),
  )

  // Só é "estreia" de verdade se a rodada trouxe dado (senão o aviso
  // apareceria toda vez pra loja vinculada mas ainda sem movimento).
  if (estreando) {
    r.primeiraSincronizacao = r.reconciliation.some(
      (c) => (c.persisted ?? 0) > 0,
    )
  }

  // Taxa de antecipação por competência (complementar) — grava em
  // ifood_antecipacoes pro DRE; não entra no resultado retornado.
  await Promise.all(
    competencias.map((c) => syncAntecipacaoCompetencia(u, c, force, admin)),
  )

  // ---- Pedidos/pagamento via Financial Events, por competência ----
  // Antes isto puxava só D-7..D-1 e DESCARTAVA o resultado. Agora roda o mês
  // inteiro (mesmas competências da conciliação) e grava em ifood_pedidos —
  // aposentando o "Relatório de pedidos (VR)" que era subido à mão.
  r.pedidos = await Promise.all(
    competencias.map((c) => syncPedidosCompetencia(u, c, force)),
  )

  return r
}

/**
 * Pedidos/pagamento de UMA competência. Throttle de 6h por competência, com a
 * mesma regra da conciliação: o mês corrente sempre re-roda (dado ainda muda).
 */
async function syncPedidosCompetencia(
  u: UnitLite,
  competencia: string,
  force: boolean,
): Promise<NonNullable<UnitSyncResult["pedidos"]>[number]> {
  const ep = `pedidos:${competencia}`
  const mesCorrente = competencia === ym(new Date())
  const gate =
    force || mesCorrente
      ? ({ ok: true } as const)
      : await checkThrottle(u.merchantId, ep, 6)
  if (!gate.ok) return { competencia, skipped: gate.reason }

  try {
    const res = await syncPedidosDaLoja(u.unitId, u.merchantId, competencia)
    await recordCall(u.merchantId, ep, res.ok ? 200 : undefined)
    if (res.ok && res.gravados > 0) {
      await logPedidosSync(u.unitId, competencia, res.gravados)
    }
    return {
      competencia,
      ok: res.ok,
      eventos: res.eventos,
      pedidos: res.pedidos,
      gravados: res.gravados,
      error: res.erro,
    }
  } catch (e) {
    await recordCall(u.merchantId, ep)
    return {
      competencia,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
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
  opts: {
    force?: boolean
    competences?: string[]
    /** Restringe às unidades dadas (sync manual escopado por tenant).
     *  Omitido/null = todas (cron). Array vazio = nada a sincronizar. */
    unitIds?: string[] | null
  } = {},
): Promise<{
  ranAt: string
  unitsProcessed: number
  unitsSkippedNoMerchant: number
  results: UnitSyncResult[]
}> {
  const force = opts.force === true
  const units = await listIfoodUnits(opts.unitIds)
  const admin = createAdminClient()

  // Competências: por padrão mês corrente + anterior; ou as passadas em
  // `opts.competences` (ex.: backfill de um intervalo). Mesmas pra todas as lojas.
  const competencias =
    opts.competences && opts.competences.length > 0
      ? opts.competences
      : (() => {
          const now = new Date()
          return [
            ym(now),
            ym(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
          ]
        })()

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
