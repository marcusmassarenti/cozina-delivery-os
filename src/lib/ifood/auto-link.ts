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
import { downloadReconciliationRows } from "./reconciliation"
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

/** Nome bem coberto — usado só pra PRIORIZAR candidatos e detectar conflito. */
const LIMIAR_AUTO = 0.8
/** Teto de merchants testados por loja (cada teste baixa uma conciliação). */
const MAX_TESTES_CNPJ = 3

/** Só dígitos — CNPJ vem mascarado num lado e cru no outro. */
function soDigitos(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "")
}

/** YYYY-MM do mês corrente e do anterior (onde procurar extrato). */
function competenciasParaSondar(): string[] {
  const d = new Date()
  const ym = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`
  return [ym(d), ym(new Date(d.getFullYear(), d.getMonth() - 1, 1))]
}

/**
 * CNPJ REAL de um merchant do iFood.
 *
 * ⚠️ A Merchant API não expõe CNPJ (nem na lista nem no detalhe) — mas a
 * **Conciliação** traz (coluna `cnpj`, ao lado de `loja_id`). Então a gente
 * descobre baixando um extrato e guarda em `ifood_merchants.cnpj`, pra as
 * próximas rodadas saírem de graça do cache.
 * Devolve null quando a loja ainda não tem extrato (sem movimento).
 */
async function cnpjDoMerchant(
  merchantId: string,
  admin: ReturnType<typeof createAdminClient>,
): Promise<string | null> {
  const { data } = await admin
    .from("ifood_merchants")
    .select("cnpj")
    .eq("id", merchantId)
    .maybeSingle()
  const cache = soDigitos((data as { cnpj?: string | null } | null)?.cnpj)
  if (cache.length === 14) return cache

  for (const comp of competenciasParaSondar()) {
    try {
      const r = await downloadReconciliationRows(merchantId, comp)
      if (!r.ok) continue
      const linha = r.rows.find(
        (x) => soDigitos(String(x.cnpj ?? "")).length === 14,
      )
      const cnpj = soDigitos(String(linha?.cnpj ?? ""))
      if (cnpj.length === 14) {
        await admin
          .from("ifood_merchants")
          .update({ cnpj })
          .eq("id", merchantId)
        return cnpj
      }
    } catch {
      /* segue pro próximo mês */
    }
  }
  return null
}

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
    /** CNPJ conferido na conciliação do merchant (o que autorizou o vínculo). */
    cnpj: string
  }[]
  /** Solicitações abertas sem CONFIRMAÇÃO de CNPJ — o admin resolve na tela. */
  ambiguas: {
    unitId: string
    unitName: string
    sugestao: { merchantId: string; name: string | null; score: number } | null
    /** Por que não vinculou (CNPJ conflitante, sem extrato, etc.). */
    motivo: string
  }[]
  merchantsVistos: number
  /** Solicitações que sobraram por falta de tempo — clicar de novo continua. */
  restantes: number
}

/**
 * Casa merchants autorizados (ao vivo) com unidades que TÊM solicitação
 * aberta, pelo nome. NÃO dispara o backfill — devolve as novas pra quem
 * chamou. `restrictUnitIds` limita ao escopo do tenant (botão manual).
 */
export async function autoLinkIfoodMerchants(
  restrictUnitIds?: string[] | null,
  opts?: {
    /**
     * Teto de tempo em ms. Ao estourar, para e devolve o que já casou com
     * `restantes` > 0 — quem chamou decide se roda de novo.
     *
     * Existe porque descobrir o CNPJ de um merchant custa o DOWNLOAD de uma
     * conciliação, e um clique com o cache frio (20 merchants sem CNPJ) passa
     * dos 300s da server action e morre sem gravar o resultado. Cada rodada
     * esquenta o cache, então a seguinte anda muito mais.
     *
     * Sem o parâmetro, roda até o fim — é o que o cron da madrugada quer.
     */
    deadlineMs?: number
  },
): Promise<AutoLinkResult> {
  const iniciou = Date.now()
  const semTempo = () =>
    opts?.deadlineMs !== undefined && Date.now() - iniciou > opts.deadlineMs
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
      restantes: 0,
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

  // CNPJ já descoberto de cada merchant, numa consulta só. Alimenta a passada
  // rápida abaixo — cada rodada anterior deixou aqui o que aprendeu baixando
  // conciliação, então a segunda passada num mesmo dia costuma casar sozinha.
  const cnpjPorMerchantCache = new Map<string, string>()
  if (candidatos.length > 0) {
    const { data: cach } = await admin
      .from("ifood_merchants")
      .select("id, cnpj")
      .in(
        "id",
        candidatos.map((m) => m.id),
      )
    for (const c of (cach ?? []) as { id: string; cnpj: string | null }[]) {
      const d = soDigitos(c.cnpj)
      if (d.length === 14) cnpjPorMerchantCache.set(c.id, d)
    }
  }

  // 2) Unidades COM solicitação aberta (pendente/solicitada) e iFood ativo
  //    sem vínculo — só essas entram no casamento (o cliente pediu).
  //    O `cnpj` do pedido é a chave de VERIFICAÇÃO (ver validação abaixo).
  let reqQ = admin
    .from("ifood_activation_requests")
    .select("unit_id, status, cnpj, units!inner(id, code, name)")
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
      restantes: 0,
    }
  }

  const abertas = ((reqs ?? []) as unknown as {
    unit_id: string
    cnpj: string | null
    units: { id: string; code: string; name: string }
  }[]).filter((row) => !jaVinculados.has(row.unit_id))

  const vinculadas: AutoLinkResult["vinculadas"] = []
  const ambiguas: AutoLinkResult["ambiguas"] = []
  const usados = new Set<string>()

  /** Vincula e marca a solicitação como ativa. Devolve false se o banco negou. */
  async function fechar(
    row: { unit_id: string; units: { code: string; name: string } },
    merchantId: string,
    score: number,
    cnpj: string,
  ): Promise<boolean> {
    const { error } = await admin.from("unit_platforms").upsert(
      {
        unit_id: row.unit_id,
        platform: "ifood",
        active: true,
        api_store_id: merchantId,
      },
      { onConflict: "unit_id,platform", ignoreDuplicates: false },
    )
    if (error) return false
    usados.add(merchantId)
    vinculadas.push({
      unitId: row.unit_id,
      unitCode: row.units.code,
      unitName: row.units.name,
      merchantId,
      score,
      cnpj,
    })
    await admin
      .from("ifood_activation_requests")
      .update({ status: "ativa", updated_at: new Date().toISOString() })
      .eq("unit_id", row.unit_id)
      .in("status", ["pendente", "solicitada"])
    return true
  }

  // PASSADA RÁPIDA (custo zero de rede): casa o que dá só com o CNPJ que já
  // está no cache de merchants. Antes, um merchant com CNPJ conhecido ainda
  // esperava a vez no loop caro e podia nem ser alcançado dentro do tempo.
  const pendentes: typeof abertas = []
  for (const row of abertas) {
    const cnpjPedido = soDigitos(row.cnpj)
    if (cnpjPedido.length !== 14) {
      pendentes.push(row)
      continue
    }
    const direto = candidatos.find(
      (m) =>
        !usados.has(m.id) &&
        soDigitos(cnpjPorMerchantCache.get(m.id)) === cnpjPedido,
    )
    if (direto) {
      const ok = await fechar(
        row,
        direto.id,
        coberturaNome(row.units.name, direto),
        cnpjPedido,
      )
      if (ok) continue
    }
    pendentes.push(row)
  }

  let processadas = 0
  for (const row of pendentes) {
    if (semTempo()) break
    processadas++
    const cnpjPedido = soDigitos(row.cnpj)
    if (cnpjPedido.length !== 14) {
      ambiguas.push({
        unitId: row.unit_id,
        unitName: row.units.name,
        sugestao: null,
        motivo: "Solicitação sem CNPJ válido — não dá pra verificar.",
      })
      continue
    }

    // Ordena candidatos por cobertura de nome: o nome NÃO decide, só define
    // quem testamos primeiro (cada teste custa uma conciliação).
    const ordenados = candidatos
      .filter((m) => !usados.has(m.id))
      .map((m) => ({ m, score: coberturaNome(row.units.name, m) }))
      .sort((a, b) => b.score - a.score)

    // Quem DECIDE é o CNPJ: pega o CNPJ real do merchant (cache → conciliação)
    // e só vincula quando bate com o CNPJ que o cliente pediu. É o que impede
    // trocar filiais de mesmo nome/raiz (ex.: 32.196.377/0001, /0002, /0003).
    let escolhido: { m: IfoodMerchant; score: number } | null = null
    let testados = 0
    let conflito: string | null = null
    for (const cand of ordenados) {
      if (testados >= MAX_TESTES_CNPJ) break
      const cnpjMerchant = await cnpjDoMerchant(cand.m.id, admin)
      if (!cnpjMerchant) continue // sem extrato pra verificar; tenta o próximo
      testados++
      if (cnpjMerchant === cnpjPedido) {
        escolhido = cand
        break
      }
      if (cand.score >= LIMIAR_AUTO) {
        // Nome batia forte mas o CNPJ é de OUTRA loja — o caso perigoso.
        conflito = `O merchant "${cand.m.name ?? cand.m.id}" tem nome parecido mas é o CNPJ ${cnpjMerchant} (o pedido é ${cnpjPedido}).`
      }
    }

    if (escolhido) {
      const ok = await fechar(
        row,
        escolhido.m.id,
        escolhido.score,
        cnpjPedido,
      )
      if (ok) continue
    }

    // Não confirmou por CNPJ → NÃO vincula (o admin resolve na tela).
    const melhor = ordenados[0]
    ambiguas.push({
      unitId: row.unit_id,
      unitName: row.units.name,
      sugestao: melhor
        ? {
            merchantId: melhor.m.id,
            name: melhor.m.name ?? null,
            score: melhor.score,
          }
        : null,
      motivo:
        conflito ??
        (testados === 0
          ? "Nenhum merchant candidato tem extrato pra confirmar o CNPJ ainda (loja sem movimento?)."
          : `Nenhum dos ${testados} merchants testados tem o CNPJ ${cnpjPedido}.`),
    })
  }

  return {
    ok: true,
    vinculadas,
    ambiguas,
    merchantsVistos: merchants.length,
    restantes: pendentes.length - processadas,
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
