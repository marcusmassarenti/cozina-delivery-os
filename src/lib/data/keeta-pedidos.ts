/**
 * Resumo do relatório "Pedidos recentes" do Keeta (tabela
 * keeta_pedidos_recentes), pra alimentar a tela de Pedidos quando a
 * plataforma selecionada é Keeta.
 *
 * A Keeta NÃO reporta forma de pagamento/VR (diferente do iFood). Em troca,
 * traz quem banca cada promoção (Keeta × loja), taxas granulares, mix de
 * campanhas e detalhe de cancelamento — é isso que agregamos aqui.
 */

import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export type CampanhaMix = { campanha: string; pedidos: number }
export type CancelPorQuem = { quem: string; pedidos: number }
export type TurnoResumo = { turno: string; pedidos: number; valor: number }

export type KeetaPedidoResumo = {
  totalPedidos: number
  concluidos: number
  cancelados: number
  // Valores (R$)
  valorPagoCliente: number
  precoOriginal: number
  ganhos: number // líquido pra loja
  ticketMedio: number
  descontoPct: number // 1 − pago/original (intensidade promocional)
  // Subsídio (quem banca o desconto)
  promoKeeta: number
  promoLoja: number
  descontoKeeta: number
  subsidioTotal: number
  // Taxas (custo, sempre positivo)
  comissaoBasica: number
  taxaDistancia: number
  taxaSaqueAntecipado: number
  taxaPagamentoOnline: number
  taxasTotal: number
  // Distribuições
  campanhas: CampanhaMix[]
  cancelPorQuem: CancelPorQuem[]
  porTurno: TurnoResumo[]
  hasData: boolean
}

function emptyResumo(): KeetaPedidoResumo {
  return {
    totalPedidos: 0,
    concluidos: 0,
    cancelados: 0,
    valorPagoCliente: 0,
    precoOriginal: 0,
    ganhos: 0,
    ticketMedio: 0,
    descontoPct: 0,
    promoKeeta: 0,
    promoLoja: 0,
    descontoKeeta: 0,
    subsidioTotal: 0,
    comissaoBasica: 0,
    taxaDistancia: 0,
    taxaSaqueAntecipado: 0,
    taxaPagamentoOnline: 0,
    taxasTotal: 0,
    campanhas: [],
    cancelPorQuem: [],
    porTurno: [],
    hasData: false,
  }
}

type Row = {
  status_pedido: string | null
  valor_pago_cliente: number | string | null
  preco_original: number | string | null
  ganhos: number | string | null
  promo_keeta: number | string | null
  promo_loja: number | string | null
  desconto_keeta: number | string | null
  comissao_basica: number | string | null
  taxa_distancia: number | string | null
  taxa_saque_antecipado: number | string | null
  taxa_pagamento_online: number | string | null
  tipo_campanha: string | null
  quem_cancelou: string | null
  turno: string | null
}

const SELECT =
  "status_pedido, valor_pago_cliente, preco_original, ganhos, promo_keeta, promo_loja, desconto_keeta, comissao_basica, taxa_distancia, taxa_saque_antecipado, taxa_pagamento_online, tipo_campanha, quem_cancelou, turno"

const num = (v: number | string | null) => Math.abs(Number(v) || 0)
const round = (n: number) => Math.round(n * 100) / 100

const TURNO_LABEL: Record<string, string> = {
  MADRUGADA: "Madrugada",
  MANHA: "Manhã",
  ALMOCO: "Almoço",
  TARDE: "Tarde",
  JANTAR: "Jantar",
}

async function pageAll(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>,
): Promise<Row[]> {
  const all: Row[] = []
  let from = 0
  const pageSize = 1000
  for (let i = 0; i < 300; i++) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) {
      console.error("keeta-pedidos pageAll:", error.message)
      break
    }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

function aggregate(rows: Row[]): KeetaPedidoResumo {
  if (rows.length === 0) return emptyResumo()
  const r = emptyResumo()
  r.totalPedidos = rows.length

  const campanhas = new Map<string, number>()
  const cancel = new Map<string, number>()
  const turnos = new Map<string, { pedidos: number; valor: number }>()

  for (const row of rows) {
    if (row.status_pedido === "Concluído") r.concluidos++
    else if (row.status_pedido === "Cancelado") r.cancelados++

    const pago = num(row.valor_pago_cliente)
    r.valorPagoCliente += pago
    r.precoOriginal += num(row.preco_original)
    r.ganhos += Number(row.ganhos) || 0 // ganhos podem ser negativos em cancelado

    r.promoKeeta += num(row.promo_keeta)
    r.promoLoja += num(row.promo_loja)
    r.descontoKeeta += num(row.desconto_keeta)

    r.comissaoBasica += num(row.comissao_basica)
    r.taxaDistancia += num(row.taxa_distancia)
    r.taxaSaqueAntecipado += num(row.taxa_saque_antecipado)
    r.taxaPagamentoOnline += num(row.taxa_pagamento_online)

    // Campanhas: a célula é uma lista "A;B;C;" — conta cada tag individual.
    if (row.tipo_campanha) {
      for (const tag of row.tipo_campanha.split(";")) {
        const t = tag.trim()
        if (t) campanhas.set(t, (campanhas.get(t) ?? 0) + 1)
      }
    }
    if (row.quem_cancelou) {
      const q = row.quem_cancelou.trim()
      if (q) cancel.set(q, (cancel.get(q) ?? 0) + 1)
    }
    const turno = row.turno ?? "OUTROS"
    const tb = turnos.get(turno) ?? { pedidos: 0, valor: 0 }
    tb.pedidos++
    tb.valor += pago
    turnos.set(turno, tb)
  }

  r.subsidioTotal = r.promoKeeta + r.promoLoja
  r.taxasTotal =
    r.comissaoBasica +
    r.taxaDistancia +
    r.taxaSaqueAntecipado +
    r.taxaPagamentoOnline
  r.ticketMedio = r.totalPedidos > 0 ? r.valorPagoCliente / r.totalPedidos : 0
  r.descontoPct =
    r.precoOriginal > 0 ? (1 - r.valorPagoCliente / r.precoOriginal) * 100 : 0

  // Arredonda os valores monetários
  for (const k of [
    "valorPagoCliente",
    "precoOriginal",
    "ganhos",
    "ticketMedio",
    "promoKeeta",
    "promoLoja",
    "descontoKeeta",
    "subsidioTotal",
    "comissaoBasica",
    "taxaDistancia",
    "taxaSaqueAntecipado",
    "taxaPagamentoOnline",
    "taxasTotal",
  ] as const) {
    r[k] = round(r[k])
  }
  r.descontoPct = Math.round(r.descontoPct * 10) / 10

  r.campanhas = Array.from(campanhas.entries())
    .map(([campanha, pedidos]) => ({ campanha, pedidos }))
    .sort((a, b) => b.pedidos - a.pedidos)
  r.cancelPorQuem = Array.from(cancel.entries())
    .map(([quem, pedidos]) => ({ quem, pedidos }))
    .sort((a, b) => b.pedidos - a.pedidos)
  r.porTurno = Array.from(turnos.entries())
    .map(([turno, b]) => ({
      turno: TURNO_LABEL[turno] ?? turno,
      pedidos: b.pedidos,
      valor: round(b.valor),
    }))
    .sort((a, b) => b.valor - a.valor)

  r.hasData = true
  return r
}

/** Resumo de 1 unidade no mês. */
export async function getKeetaPedidoResumoForMonth(
  unitId: string,
  year: number,
  month: number,
): Promise<KeetaPedidoResumo> {
  const admin = createAdminClient()
  const rows = await pageAll((from, to) =>
    admin
      .from("keeta_pedidos_recentes")
      .select(SELECT)
      .eq("unit_id", unitId)
      .eq("ref_year", year)
      .eq("ref_month", month)
      .order("id")
      .range(from, to),
  )
  return aggregate(rows)
}

/** Resumo consolidado da rede (várias unidades) no mês. */
export async function getNetworkKeetaPedidoResumo(
  unitIds: string[],
  year: number,
  month: number,
): Promise<KeetaPedidoResumo> {
  if (unitIds.length === 0) return emptyResumo()
  const admin = createAdminClient()
  const rows = await pageAll((from, to) =>
    admin
      .from("keeta_pedidos_recentes")
      .select(SELECT)
      .in("unit_id", unitIds)
      .eq("ref_year", year)
      .eq("ref_month", month)
      .order("id")
      .range(from, to),
  )
  return aggregate(rows)
}

/** Unidades que têm dados de Pedidos recentes Keeta no mês (pra cobertura). */
export async function getKeetaPedidoUnitsWithData(
  year: number,
  month: number,
): Promise<Set<string>> {
  const admin = createAdminClient()
  const set = new Set<string>()
  let from = 0
  const pageSize = 1000
  for (let i = 0; i < 300; i++) {
    const { data, error } = await admin
      .from("keeta_pedidos_recentes")
      .select("unit_id")
      .eq("ref_year", year)
      .eq("ref_month", month)
      .order("id")
      .range(from, from + pageSize - 1)
    if (error) {
      console.error("getKeetaPedidoUnitsWithData:", error.message)
      break
    }
    if (!data || data.length === 0) break
    for (const r of data) if (r.unit_id) set.add(r.unit_id)
    if (data.length < pageSize) break
    from += pageSize
  }
  return set
}
