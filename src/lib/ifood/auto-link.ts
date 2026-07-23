/**
 * Auto-vínculo de lojas iFood.
 *
 * Quando um cliente pede a conexão (botão "Pedir autorização" no cadastro) e
 * aprova no Portal do Parceiro, o merchant dele passa a aparecer no
 * GET /merchants do nosso app centralizado. Esta rotina fecha o último passo
 * SOZINHA: acha o merchant recém-autorizado e casa com a unidade que está
 * esperando conexão, grava o api_store_id, marca a solicitação como ativa e
 * devolve as lojas recém-vinculadas pra quem chamou disparar o backfill.
 *
 * ⚠️ A Merchant API NÃO expõe o CNPJ (nem na lista nem no detalhe) — só nome
 * e razão social. Então o casamento é por NOME, e só entre unidades que têm
 * uma SOLICITAÇÃO ABERTA (pendente/solicitada). Restringir às lojas que o
 * cliente pediu de propósito elimina o risco de vincular na loja errada:
 * uma unidade sem pedido nunca é tocada. Match ambíguo não vincula — vira
 * sugestão pro admin confirmar na tela.
 *
 * Roda no cron diário e no botão "Sincronizar iFood".
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

import { listIfoodMerchants, type IfoodMerchant } from "./merchants"
import { syncIfoodAll } from "./sync"

/** Normaliza nome pra comparar: minúsculo, sem acento, sem pontuação, sem
 *  ruído societário/genérico. Vira conjunto de tokens. */
const STOPWORDS = new Set([
  "ltda", "me", "epp", "eireli", "sa", "cia", "e", "de", "do", "da", "dos",
  "das", "restaurante", "lanchonete", "comercio", "alimentos", "food",
  "foods", "delivery", "parque", "shopping", "loja", "matriz", "filial",
])
function tokens(nome: string | null | undefined): Set<string> {
  return new Set(
    (nome ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  )
}
/** Fração dos tokens da unidade cobertos pelo nome do merchant (0–1). */
function coberturaNome(unitNome: string, merchant: IfoodMerchant): number {
  const u = tokens(unitNome)
  if (u.size === 0) return 0
  const m = new Set([
    ...tokens(merchant.name),
    ...tokens(merchant.corporateName),
  ])
  let hit = 0
  for (const t of u) if (m.has(t)) hit++
  return hit / u.size
}

/** Confiança mínima pra vincular sozinho (nome da loja bem coberto). */
const LIMIAR_AUTO = 0.8

export type AutoLinkResult = {
  ok: boolean
  error?: string
  /** Lojas que ACABARAM de ser vinculadas nesta rodada (disparar backfill). */
  vinculadas: {
    unitId: string
    unitCode: string
    unitName: string
    merchantId: string
    score: number
  }[]
  /** Solicitações abertas sem match confiável — o admin confirma na tela. */
  ambiguas: {
    unitId: string
    unitName: string
    sugestao: { merchantId: string; name: string | null; score: number } | null
  }[]
  merchantsVistos: number
}

/**
 * Casa merchants autorizados (ao vivo) com unidades que TÊM solicitação
 * aberta, pelo nome. NÃO dispara o backfill — devolve as novas pra quem
 * chamou. `restrictUnitIds` limita ao escopo do tenant (botão manual).
 */
export async function autoLinkIfoodMerchants(
  restrictUnitIds?: string[] | null,
): Promise<AutoLinkResult> {
  const admin = createAdminClient()

  // 1) Merchants autorizados no app, ao vivo.
  const r = await listIfoodMerchants()
  if (!r.ok || !r.data) {
    return {
      ok: false,
      error: r.error ?? `HTTP ${r.status}`,
      vinculadas: [],
      ambiguas: [],
      merchantsVistos: 0,
    }
  }
  const merchants = r.data as IfoodMerchant[]

  // Atualiza a cache local `ifood_merchants` de passagem (igual ao refresh).
  const cacheRows = merchants.map((m) => ({
    id: m.id,
    name: m.name ?? null,
    corporate_name: m.corporateName ?? null,
    city: m.address?.city ?? null,
    state: m.address?.state ?? null,
    merchant_state: m.merchantState ?? null,
    raw: m as unknown as object,
    last_seen_at: new Date().toISOString(),
  }))
  if (cacheRows.length > 0) {
    await admin
      .from("ifood_merchants")
      .upsert(cacheRows, { onConflict: "id", ignoreDuplicates: false })
  }

  // Merchants ainda NÃO vinculados a nenhuma unidade (candidatos).
  const { data: linkedRows } = await admin
    .from("unit_platforms")
    .select("api_store_id")
    .eq("platform", "ifood")
    .not("api_store_id", "is", null)
  const jaVinculados = new Set(
    (linkedRows ?? []).map((x) => x.api_store_id as string),
  )
  const candidatos = merchants.filter((m) => !jaVinculados.has(m.id))

  // 2) Unidades COM solicitação aberta (pendente/solicitada) e iFood ativo
  //    sem vínculo — só essas entram no casamento (o cliente pediu).
  let reqQ = admin
    .from("ifood_activation_requests")
    .select("unit_id, status, units!inner(id, code, name)")
    .in("status", ["pendente", "solicitada"])
  if (restrictUnitIds) reqQ = reqQ.in("unit_id", restrictUnitIds)
  const { data: reqs, error: e1 } = await reqQ
  if (e1) {
    return {
      ok: false,
      error: e1.message,
      vinculadas: [],
      ambiguas: [],
      merchantsVistos: merchants.length,
    }
  }

  const abertas = ((reqs ?? []) as unknown as {
    unit_id: string
    units: { id: string; code: string; name: string }
  }[]).filter((row) => !jaVinculados.has(row.unit_id))

  const vinculadas: AutoLinkResult["vinculadas"] = []
  const ambiguas: AutoLinkResult["ambiguas"] = []
  const usados = new Set<string>()

  for (const row of abertas) {
    // Melhor candidato por cobertura de nome (só os ainda não usados).
    let best: { m: IfoodMerchant; score: number } | null = null
    let segundo = 0
    for (const m of candidatos) {
      if (usados.has(m.id)) continue
      const score = coberturaNome(row.units.name, m)
      if (!best || score > best.score) {
        if (best) segundo = best.score
        best = { m, score }
      } else if (score > segundo) {
        segundo = score
      }
    }

    // Vincula só com alta confiança E sem empate (margem sobre o 2º lugar).
    const confiavel =
      best && best.score >= LIMIAR_AUTO && best.score - segundo >= 0.3
    if (best && confiavel) {
      const { error: eUp } = await admin.from("unit_platforms").upsert(
        {
          unit_id: row.unit_id,
          platform: "ifood",
          active: true,
          api_store_id: best.m.id,
        },
        { onConflict: "unit_id,platform", ignoreDuplicates: false },
      )
      if (!eUp) {
        usados.add(best.m.id)
        vinculadas.push({
          unitId: row.unit_id,
          unitCode: row.units.code,
          unitName: row.units.name,
          merchantId: best.m.id,
          score: best.score,
        })
        await admin
          .from("ifood_activation_requests")
          .update({ status: "ativa", updated_at: new Date().toISOString() })
          .eq("unit_id", row.unit_id)
          .in("status", ["pendente", "solicitada"])
        continue
      }
    }
    // Sem match confiável → sugestão pro admin confirmar na tela.
    ambiguas.push({
      unitId: row.unit_id,
      unitName: row.units.name,
      sugestao: best
        ? { merchantId: best.m.id, name: best.m.name ?? null, score: best.score }
        : null,
    })
  }

  return {
    ok: true,
    vinculadas,
    ambiguas,
    merchantsVistos: merchants.length,
  }
}

/** Competências de 2026-01 até o mês corrente (backfill de loja nova). */
export function competenciasDoAno(now = new Date()): string[] {
  const ano = now.getFullYear()
  const mesAtual = now.getMonth() + 1
  const out: string[] = []
  for (let m = 1; m <= mesAtual; m++)
    out.push(`${ano}-${String(m).padStart(2, "0")}`)
  return out
}

/** Teto de lojas a puxar o histórico completo por rodada — evita estourar o
 *  timeout (300s), já que o cron ainda roda o sync da rede toda depois. Loja
 *  vinculada e não backfillada agora entra na próxima rodada (já está
 *  vinculada, e o sync do dia traz mês corrente + anterior no meio tempo).
 *  Como lojas novas chegam aos poucos, 2/rodada dá conta com folga. */
const MAX_BACKFILL_POR_RODADA = 2

export type AutoLinkBackfillResult = AutoLinkResult & {
  backfill: {
    unitCode: string
    unitName: string
    linhas: number
    meses: number
  }[]
  backfillAdiado: { unitCode: string; unitName: string }[]
}

/**
 * Auto-vínculo + backfill do histórico das lojas novas, numa tacada. Backfill
 * SEQUENCIAL por loja (dentro da loja o syncIfoodAll já paraleliza as
 * competências) — nunca N lojas × N meses em paralelo, que já apagou mês.
 */
export async function autoLinkAndBackfill(
  restrictUnitIds?: string[] | null,
): Promise<AutoLinkBackfillResult> {
  const link = await autoLinkIfoodMerchants(restrictUnitIds)
  const backfill: AutoLinkBackfillResult["backfill"] = []
  const backfillAdiado: AutoLinkBackfillResult["backfillAdiado"] = []
  if (!link.ok) return { ...link, backfill, backfillAdiado }

  const comps = competenciasDoAno()
  const aBackfillar = link.vinculadas.slice(0, MAX_BACKFILL_POR_RODADA)
  for (const v of link.vinculadas.slice(MAX_BACKFILL_POR_RODADA))
    backfillAdiado.push({ unitCode: v.unitCode, unitName: v.unitName })

  for (const v of aBackfillar) {
    try {
      const res = await syncIfoodAll({
        unitIds: [v.unitId],
        competences: comps,
        force: true,
      })
      const u = res.results[0]
      const linhas = (u?.reconciliation ?? []).reduce(
        (s, x) => s + (x.persisted ?? 0),
        0,
      )
      const meses = (u?.reconciliation ?? []).filter(
        (x) => (x.persisted ?? 0) > 0,
      ).length
      backfill.push({ unitCode: v.unitCode, unitName: v.unitName, linhas, meses })
    } catch {
      backfillAdiado.push({ unitCode: v.unitCode, unitName: v.unitName })
    }
  }

  return { ...link, backfill, backfillAdiado }
}
