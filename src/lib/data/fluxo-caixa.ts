import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getAccessibleUnitIds } from "@/lib/auth/roles"
import {
  getAccountsWithBalance,
  getCaixaHoldingId,
  getCardAccountIds,
  type Loja,
} from "@/lib/data/caixa"

/**
 * Fluxo de Caixa PROJETADO — saldo corrido do caixa hoje somado às entradas e
 * saídas previstas ao longo do horizonte. Junta os dois mundos que viviam
 * separados: as contas a pagar/receber do Caixa (fin_entries) E os repasses
 * previstos das plataformas de delivery (Keeta + iFood) — que são a maior fonte
 * de receita e não apareciam no caixa.
 *
 * Regime de caixa: cada valor entra/sai no dia em que o dinheiro efetivamente
 * mexe (due_date pra manual, data de liquidação/repasse pro delivery). Contas
 * já vencidas e não pagas caem em "hoje" (precisam ser resolvidas).
 */

export type FluxoDia = {
  date: string // YYYY-MM-DD
  entradasManual: number
  entradasDelivery: number
  saidas: number
  saldoFim: number // saldo acumulado ao FIM do dia
  temMovimento: boolean
}

export type FluxoCaixa = {
  saldoAtual: number
  horizonteDias: number
  dias: FluxoDia[] // série diária completa (pro gráfico)
  movimentos: FluxoDia[] // só dias com movimento (pra tabela)
  totalEntradas: number
  totalEntradasManual: number
  totalEntradasDelivery: number
  totalSaidas: number
  saldoProjetadoFim: number
  saldoMinimo: number
  primeiroDiaNegativo: string | null
  atrasadoPagar: number // saídas vencidas e não pagas (jogadas em hoje)
  atrasadoReceber: number // entradas manuais vencidas e não recebidas
}

function todayISO(): string {
  const d = new Date()
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}
function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00-03:00`)
  d.setDate(d.getDate() + n)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

/** Como escopar as tabelas de delivery (só têm unit_id) pelo filtro de loja. */
function deliveryUnits(
  loja: Loja,
  allowed: string[] | null,
): { skip: boolean; units: string[] | null } {
  if (loja === "rede") return { skip: true, units: null } // rede = nível holding, sem repasse
  if (loja && loja !== "todas") return { skip: false, units: [loja] }
  return { skip: false, units: allowed } // todas as acessíveis (null = sem restrição)
}

export async function getFluxoCaixa(
  horizonteDias = 30,
  loja?: Loja,
): Promise<FluxoCaixa | null> {
  const holdingId = await getCaixaHoldingId()
  if (!holdingId) return null

  const admin = createAdminClient()
  const allowed = await getAccessibleUnitIds()
  const cardIds = new Set(await getCardAccountIds(holdingId))

  const today = todayISO()
  const end = addDaysISO(today, horizonteDias)

  // 1) Saldo em caixa hoje (contas não-cartão e não excluídas do total).
  const contas = await getAccountsWithBalance(holdingId, loja)
  const saldoAtual = contas
    .filter((c) => c.kind !== "cartao" && !c.excludeFromTotal)
    .reduce((s, c) => s + (c.balance ?? 0), 0)

  // Acumuladores por dia
  const bucket = new Map<
    string,
    { entManual: number; entDelivery: number; saidas: number }
  >()
  const at = (date: string) => {
    const key = date < today ? today : date // vencido → resolve hoje
    let b = bucket.get(key)
    if (!b) {
      b = { entManual: 0, entDelivery: 0, saidas: 0 }
      bucket.set(key, b)
    }
    return b
  }

  let atrasadoPagar = 0
  let atrasadoReceber = 0

  // 2) Manual: contas a pagar / a receber pendentes (fin_entries).
  let qEntries = admin
    .from("fin_entries")
    .select("kind, value, due_date, account_id, unit_id")
    .eq("holding_id", holdingId)
    .is("paid_date", null)
    .in("kind", ["despesa", "receita"])
    .lte("due_date", end)
  if (loja === "rede") qEntries = qEntries.is("unit_id", null)
  else if (loja && loja !== "todas") qEntries = qEntries.eq("unit_id", loja)
  else if (allowed !== null)
    qEntries = qEntries.in(
      "unit_id",
      allowed.length ? allowed : ["00000000-0000-0000-0000-000000000000"],
    )
  const { data: entries } = await qEntries
  for (const e of entries ?? []) {
    if (e.account_id && cardIds.has(e.account_id as string)) continue // cartão sai via fatura
    if (!e.due_date) continue
    const v = Number(e.value ?? 0)
    const vencido = (e.due_date as string) < today
    const b = at(e.due_date as string)
    if (e.kind === "receita") {
      b.entManual += v
      if (vencido) atrasadoReceber += v
    } else {
      b.saidas += v
      if (vencido) atrasadoPagar += v
    }
  }

  // 3) Delivery — repasses previstos.
  const du = deliveryUnits(loja, allowed)
  if (!du.skip) {
    // Keeta: tem status; inclui os não liquidados até o fim do horizonte
    // (inclusive atrasados, que a Keeta ainda deve).
    let qK = admin
      .from("keeta_repasses")
      .select("data_liquidacao, valor_repasse, status, unit_id")
      .not("data_liquidacao", "is", null)
      .lte("data_liquidacao", end)
      .neq("status", "liquidado")
    if (du.units) qK = qK.in("unit_id", du.units.length ? du.units : ["00000000-0000-0000-0000-000000000000"])
    const { data: keeta } = await qK
    for (const r of keeta ?? []) {
      const v = Number(r.valor_repasse ?? 0)
      if (v <= 0) continue
      at(r.data_liquidacao as string).entDelivery += v
    }

    // iFood: sem status por linha, então só o que ainda VAI cair
    // (data_repasse_esperada >= hoje). valor = líquido (impacto_no_repasse).
    //
    // SOMADO NO BANCO (migration 0150). Duas armadilhas já caíram aqui:
    //
    // 1. Sem paginar, o PostgREST devolvia as 1.000 primeiras linhas e pronto:
    //    em 01/08/26 o horizonte tinha 116.497 linhas somando R$ 754.737,88 e
    //    a tela mostrava ~R$ 4.936 (0,65%). Sem `order`, quais 1.000 voltavam
    //    era decisão do planner, então o número mudava entre dois F5.
    // 2. Paginar corrigiu o valor e criou lentidão: 126.761 linhas em 03/08/26
    //    viravam 127 requisições sequenciais -- para produzir 5 números, já que
    //    o período tem só 5 dias distintos de repasse. A tela ficava no
    //    esqueleto de carregamento tempo suficiente pra parecer quebrada.
    //
    // A tabela tem 779 mil linhas e cresce a cada importação, então trazer
    // linha crua pra somar em JS não escala. A função devolve uma por dia.
    const unitsFiltro = du.units
      ? du.units.length
        ? du.units
        : ["00000000-0000-0000-0000-000000000000"]
      : null
    const { data: porDia, error: errRepasse } = await admin.rpc(
      "fluxo_caixa_repasses_ifood",
      { p_inicio: today, p_fim: end, p_unit_ids: unitsFiltro },
    )
    // Erro aqui não pode virar "nenhum repasse previsto": o saldo projetado
    // ficaria falsamente apertado, que é pior do que a tela não abrir.
    if (errRepasse)
      throw new Error(`fluxo-caixa: repasses do iFood — ${errRepasse.message}`)
    for (const r of (porDia ?? []) as { dia: string; total: number | string }[]) {
      const v = Number(r.total ?? 0)
      if (v > 0) at(r.dia).entDelivery += v
    }
  }

  // 4) Série diária com saldo corrido.
  const dias: FluxoDia[] = []
  let saldo = saldoAtual
  let saldoMinimo = saldoAtual
  let primeiroDiaNegativo: string | null = null
  let totalEntradasManual = 0
  let totalEntradasDelivery = 0
  let totalSaidas = 0

  for (let i = 0; i <= horizonteDias; i++) {
    const date = addDaysISO(today, i)
    const b = bucket.get(date) ?? { entManual: 0, entDelivery: 0, saidas: 0 }
    saldo += b.entManual + b.entDelivery - b.saidas
    totalEntradasManual += b.entManual
    totalEntradasDelivery += b.entDelivery
    totalSaidas += b.saidas
    if (saldo < saldoMinimo) saldoMinimo = saldo
    if (saldo < 0 && !primeiroDiaNegativo) primeiroDiaNegativo = date
    const temMovimento = b.entManual > 0 || b.entDelivery > 0 || b.saidas > 0
    dias.push({
      date,
      entradasManual: b.entManual,
      entradasDelivery: b.entDelivery,
      saidas: b.saidas,
      saldoFim: Math.round(saldo * 100) / 100,
      temMovimento,
    })
  }

  return {
    saldoAtual: Math.round(saldoAtual * 100) / 100,
    horizonteDias,
    dias,
    movimentos: dias.filter((d) => d.temMovimento),
    totalEntradas: Math.round((totalEntradasManual + totalEntradasDelivery) * 100) / 100,
    totalEntradasManual: Math.round(totalEntradasManual * 100) / 100,
    totalEntradasDelivery: Math.round(totalEntradasDelivery * 100) / 100,
    totalSaidas: Math.round(totalSaidas * 100) / 100,
    saldoProjetadoFim: Math.round(saldo * 100) / 100,
    saldoMinimo: Math.round(saldoMinimo * 100) / 100,
    primeiroDiaNegativo,
    atrasadoPagar: Math.round(atrasadoPagar * 100) / 100,
    atrasadoReceber: Math.round(atrasadoReceber * 100) / 100,
  }
}
