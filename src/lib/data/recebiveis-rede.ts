import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import type { PlatformId } from "@/components/platform-logo"
import { estimarCicloAberto, padraoAntecipacao, type PadraoAntecipacao } from "@/lib/data/ifood-repasses"

/**
 * "Do DRE ao caixa" — quando o dinheiro das vendas do período cai na conta,
 * somado pra rede (Marcus, 25/09/26: "os recebíveis, que poderiam ser
 * somados").
 *
 * ⚠️ NÃO SOMA NO RESULTADO. É o mesmo dinheiro do "Líquido das plataformas"
 * do DRE, visto pela DATA em que cai — somar contaria duas vezes (o mesmo
 * cuidado do vale-refeição).
 *
 * As réguas são as do card "Recebíveis · quando cai" da loja:
 *  - iFood : `ifood_repasses` (API de antecipações + Settlements). O ciclo
 *            entra quando as VENDAS dele caem no período. Semana aberta de loja
 *            que antecipa: data e taxa estimadas pelo último ciclo fechado
 *            dela (ver `lib/data/ifood-repasses.ts`).
 *  - 99    : faturas da API agrupadas pela data de depósito (0274 — a mesma
 *            soma do `total` de `ninefood_repasses_por_deposito`, da loja).
 *  - Keeta : `keeta_repasses` da Fatura, por competência — só existe quando a
 *            Fatura foi importada.
 */

export type RecebivelPlataforma = {
  id: PlatformId
  /** Já caiu na conta (data ≤ hoje). */
  jaCaiu: number
  /** Ciclo fechado, com data marcada no futuro. */
  aCair: number
  /** iFood: semana em andamento — o valor ainda cresce. */
  emAberto: number
  /** iFood: parte do valor em aberto que é estimativa (loja que antecipa). */
  estimado: boolean
  /** iFood: juro pago pra receber antes, nos ciclos FECHADOS — o mesmo
   *  número da linha "Taxa de antecipação" do DRE. */
  taxaAntecipacao: number
  /** iFood: juro estimado da semana aberta (loja que antecipa). */
  taxaAntecipacaoEstimada: number
  /** Tem dado de repasse dessa plataforma no período. */
  temDado: boolean
}

export type RecebiveisRede = {
  plataformas: RecebivelPlataforma[]
  /** Próximos depósitos (a partir de amanhã), somados por data. */
  proximos: { data: string; valor: number; plataformas: PlatformId[]; estimado: boolean }[]
  totais: { jaCaiu: number; aCair: number; emAberto: number }
}

function hojeBR(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  )
}

const r2 = (n: number) => Math.round(n * 100) / 100

export async function getRecebiveisRede(
  unitIds: string[],
  de: string,
  ate: string,
): Promise<RecebiveisRede> {
  const vazio: RecebiveisRede = {
    plataformas: [],
    proximos: [],
    totais: { jaCaiu: 0, aCair: 0, emAberto: 0 },
  }
  if (unitIds.length === 0) return vazio
  const admin = createAdminClient()
  const hoje = hojeBR()
  const [ano, mes] = [Number(ate.slice(0, 4)), Number(ate.slice(5, 7))]

  const [ifoodRes, ninefoodRes, keetaRes] = await Promise.all([
    admin
      .from("ifood_repasses")
      .select("unit_id, ciclo_fim, valor_bruto, taxa_antecipacao, valor_liquido, data_prevista, data_pagamento, status")
      .in("unit_id", unitIds)
      .lte("ciclo_inicio", ate)
      .gte("ciclo_fim", de)
      .limit(5000),
    admin.rpc("ninefood_depositos_rede", { p_unit_ids: unitIds, p_de: de, p_ate: ate }),
    admin
      .from("keeta_repasses")
      .select("data_liquidacao, valor_repasse, status")
      .in("unit_id", unitIds)
      .eq("ref_year", ano)
      .eq("ref_month", mes)
      .limit(5000),
  ])

  const proximos = new Map<string, { valor: number; plataformas: Set<PlatformId>; estimado: boolean }>()
  const agendar = (data: string | null, valor: number, id: PlatformId, estimado = false) => {
    if (!data || data <= hoje || Math.abs(valor) < 0.005) return
    const p = proximos.get(data) ?? { valor: 0, plataformas: new Set<PlatformId>(), estimado: false }
    p.valor += valor
    p.plataformas.add(id)
    p.estimado ||= estimado
    proximos.set(data, p)
  }

  // ── iFood ────────────────────────────────────────────────────────────
  type LinhaIfood = {
    unit_id: string
    ciclo_fim: string
    valor_bruto: number | string
    taxa_antecipacao: number | string
    valor_liquido: number | string
    data_prevista: string | null
    data_pagamento: string | null
    status: string | null
  }
  const linhasIfood = (ifoodRes.data ?? []) as LinhaIfood[]
  // Padrão de quem antecipa, pelo último ciclo FECHADO de cada loja que tem
  // semana aberta (a mesma regra do card da loja). Janela de 45 dias: cabe
  // numa página só mesmo com 80 lojas; loja sem ciclo fechado nesse tempo
  // fica com a data da API.
  const comAberto = [...new Set(linhasIfood.filter((l) => l.status === "OPEN").map((l) => l.unit_id))]
  const padrao = new Map<string, PadraoAntecipacao | null>()
  if (comAberto.length > 0) {
    const desde = new Date(`${de}T12:00:00Z`)
    desde.setUTCDate(desde.getUTCDate() - 45)
    const { data: fechados } = await admin
      .from("ifood_repasses")
      .select("unit_id, ciclo_fim, data_pagamento, valor_bruto, taxa_antecipacao")
      .in("unit_id", comAberto)
      .or("status.is.null,status.neq.OPEN")
      .not("data_pagamento", "is", null)
      .gte("ciclo_fim", desde.toISOString().slice(0, 10))
      .order("ciclo_fim", { ascending: false })
    for (const f of (fechados ?? []) as LinhaIfood[]) {
      if (!padrao.has(f.unit_id)) padrao.set(f.unit_id, padraoAntecipacao(f))
    }
  }
  const ifood: RecebivelPlataforma = {
    id: "ifood",
    jaCaiu: 0,
    aCair: 0,
    emAberto: 0,
    estimado: false,
    taxaAntecipacao: 0,
    taxaAntecipacaoEstimada: 0,
    temDado: linhasIfood.length > 0,
  }
  for (const l of linhasIfood) {
    if (l.status === "OPEN") {
      const p = padrao.get(l.unit_id)
      if (p) {
        const est = estimarCicloAberto(l, p)
        ifood.emAberto += est.liquido
        ifood.taxaAntecipacaoEstimada += est.taxa
        ifood.estimado = true
        agendar(est.dataPagamento, est.liquido, "ifood", true)
      } else {
        const liq = Number(l.valor_liquido) || 0
        ifood.emAberto += liq
        agendar(l.data_pagamento ?? l.data_prevista, liq, "ifood")
      }
      continue
    }
    const liq = Number(l.valor_liquido) || 0
    ifood.taxaAntecipacao += Number(l.taxa_antecipacao) || 0
    const quando = l.data_pagamento ?? l.data_prevista
    if (quando && quando <= hoje) ifood.jaCaiu += liq
    else {
      ifood.aCair += liq
      agendar(quando, liq, "ifood")
    }
  }

  // ── 99 ───────────────────────────────────────────────────────────────
  const depositos99 = (ninefoodRes.data ?? []) as { deposito: string; total: number | string }[]
  const ninefood: RecebivelPlataforma = {
    id: "99food",
    jaCaiu: 0,
    aCair: 0,
    emAberto: 0,
    estimado: false,
    taxaAntecipacao: 0,
    taxaAntecipacaoEstimada: 0,
    temDado: depositos99.length > 0,
  }
  for (const d of depositos99) {
    const v = Number(d.total) || 0
    if (d.deposito <= hoje) ninefood.jaCaiu += v
    else {
      ninefood.aCair += v
      agendar(d.deposito, v, "99food")
    }
  }

  // ── Keeta ────────────────────────────────────────────────────────────
  const repassesKeeta = (keetaRes.data ?? []) as {
    data_liquidacao: string | null
    valor_repasse: number | string
    status: string | null
  }[]
  const keeta: RecebivelPlataforma = {
    id: "keeta",
    jaCaiu: 0,
    aCair: 0,
    emAberto: 0,
    estimado: false,
    taxaAntecipacao: 0,
    taxaAntecipacaoEstimada: 0,
    temDado: repassesKeeta.length > 0,
  }
  for (const r of repassesKeeta) {
    const v = Number(r.valor_repasse) || 0
    const liquidado = String(r.status ?? "").toLowerCase() === "liquidado"
    if (liquidado || (r.data_liquidacao && r.data_liquidacao <= hoje)) keeta.jaCaiu += v
    else {
      keeta.aCair += v
      agendar(r.data_liquidacao, v, "keeta")
    }
  }

  const plataformas = [ifood, ninefood, keeta]
    .filter((p) => p.temDado)
    .map((p) => ({
      ...p,
      jaCaiu: r2(p.jaCaiu),
      aCair: r2(p.aCair),
      emAberto: r2(p.emAberto),
      taxaAntecipacao: r2(p.taxaAntecipacao),
      taxaAntecipacaoEstimada: r2(p.taxaAntecipacaoEstimada),
    }))
  return {
    plataformas,
    proximos: [...proximos.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 8)
      .map(([data, p]) => ({
        data,
        valor: r2(p.valor),
        plataformas: [...p.plataformas],
        estimado: p.estimado,
      })),
    totais: {
      jaCaiu: r2(plataformas.reduce((s, p) => s + p.jaCaiu, 0)),
      aCair: r2(plataformas.reduce((s, p) => s + p.aCair, 0)),
      emAberto: r2(plataformas.reduce((s, p) => s + p.emAberto, 0)),
    },
  }
}
