/**
 * Resumo do relatório "Dados do pedido" do 99 Food (tabela ninefood_pedidos),
 * pra alimentar a tela de Pedidos quando a plataforma selecionada é 99 Food.
 *
 * O 99 não tem VR por bandeira (forma costuma ser "Pagamento online"). Em
 * troca, traz por pedido: receita real da loja (líquido), taxas granulares
 * (comissão, canal de pagamento, custos logísticos), promoção custeada pela
 * loja, cliente novo×recorrente, nota e tempos de preparo/entrega.
 */

import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export type FormaMix = { forma: string; pedidos: number }

export type NinefoodPedidoResumo = {
  totalPedidos: number
  concluidos: number
  cancelados: number
  // Valores (R$)
  receitaVendas: number // bruto
  receitaRealLoja: number // líquido pra loja
  precoOriginal: number
  ticketMedio: number
  // Taxas / custos (positivos)
  promoLoja: number
  comissao: number
  taxaCanalPagamento: number
  custosLogisticos: number
  custoFreteGratis: number
  taxasTotal: number
  // Clientes
  clientesNovos: number
  clientesRecorrentes: number
  // Qualidade
  notaMedia: number
  avaliados: number
  tempoPreparoMedioMin: number
  duracaoEntregaMediaMin: number
  // Distribuição
  formaPagamento: FormaMix[]
  hasData: boolean
}

function emptyResumo(): NinefoodPedidoResumo {
  return {
    totalPedidos: 0,
    concluidos: 0,
    cancelados: 0,
    receitaVendas: 0,
    receitaRealLoja: 0,
    precoOriginal: 0,
    ticketMedio: 0,
    promoLoja: 0,
    comissao: 0,
    taxaCanalPagamento: 0,
    custosLogisticos: 0,
    custoFreteGratis: 0,
    taxasTotal: 0,
    clientesNovos: 0,
    clientesRecorrentes: 0,
    notaMedia: 0,
    avaliados: 0,
    tempoPreparoMedioMin: 0,
    duracaoEntregaMediaMin: 0,
    formaPagamento: [],
    hasData: false,
  }
}

type Row = {
  receita_vendas: number | string | null
  receita_real_loja: number | string | null
  preco_original_item: number | string | null
  despesas_ofertas: number | string | null
  despesas_comissao: number | string | null
  taxa_canal_pagamento: number | string | null
  custos_logisticos: number | string | null
  custo_loja_oferta_entrega_gratis: number | string | null
  qtd_pedidos_anteriores_cliente: number | null
  nivel_avaliacao: number | null
  tempo_preparo_min: number | string | null
  duracao_entrega_seg: number | null
  forma_pagamento: string | null
  horario_cancelamento: string | null
}

const SELECT =
  "receita_vendas, receita_real_loja, preco_original_item, despesas_ofertas, despesas_comissao, taxa_canal_pagamento, custos_logisticos, custo_loja_oferta_entrega_gratis, qtd_pedidos_anteriores_cliente, nivel_avaliacao, tempo_preparo_min, duracao_entrega_seg, forma_pagamento, horario_cancelamento"

const num = (v: number | string | null) => Math.abs(Number(v) || 0)
const round = (n: number) => Math.round(n * 100) / 100

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
      console.error("ninefood-pedidos pageAll:", error.message)
      break
    }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

function aggregate(rows: Row[]): NinefoodPedidoResumo {
  if (rows.length === 0) return emptyResumo()
  const r = emptyResumo()
  r.totalPedidos = rows.length

  const formas = new Map<string, number>()
  let somaNotas = 0
  let somaPreparo = 0
  let nPreparo = 0
  let somaEntrega = 0
  let nEntrega = 0

  for (const row of rows) {
    if (row.horario_cancelamento) r.cancelados++

    r.receitaVendas += Number(row.receita_vendas) || 0
    r.receitaRealLoja += Number(row.receita_real_loja) || 0
    r.precoOriginal += num(row.preco_original_item)
    r.promoLoja += num(row.despesas_ofertas)
    r.comissao += num(row.despesas_comissao)
    r.taxaCanalPagamento += num(row.taxa_canal_pagamento)
    r.custosLogisticos += num(row.custos_logisticos)
    r.custoFreteGratis += num(row.custo_loja_oferta_entrega_gratis)

    if (row.qtd_pedidos_anteriores_cliente != null) {
      if (row.qtd_pedidos_anteriores_cliente === 0) r.clientesNovos++
      else r.clientesRecorrentes++
    }
    if (row.nivel_avaliacao != null) {
      r.avaliados++
      somaNotas += row.nivel_avaliacao
    }
    const prep = Number(row.tempo_preparo_min)
    if (!isNaN(prep) && prep > 0) {
      somaPreparo += prep
      nPreparo++
    }
    if (row.duracao_entrega_seg != null && row.duracao_entrega_seg > 0) {
      somaEntrega += row.duracao_entrega_seg
      nEntrega++
    }
    const forma = (row.forma_pagamento ?? "Outros").trim() || "Outros"
    formas.set(forma, (formas.get(forma) ?? 0) + 1)
  }

  r.concluidos = r.totalPedidos - r.cancelados
  r.taxasTotal =
    r.comissao + r.taxaCanalPagamento + r.custosLogisticos + r.custoFreteGratis
  r.ticketMedio = r.totalPedidos > 0 ? r.receitaVendas / r.totalPedidos : 0
  r.notaMedia = r.avaliados > 0 ? somaNotas / r.avaliados : 0
  r.tempoPreparoMedioMin = nPreparo > 0 ? somaPreparo / nPreparo : 0
  r.duracaoEntregaMediaMin = nEntrega > 0 ? somaEntrega / nEntrega / 60 : 0

  for (const k of [
    "receitaVendas",
    "receitaRealLoja",
    "precoOriginal",
    "ticketMedio",
    "promoLoja",
    "comissao",
    "taxaCanalPagamento",
    "custosLogisticos",
    "custoFreteGratis",
    "taxasTotal",
  ] as const) {
    r[k] = round(r[k])
  }
  r.notaMedia = Math.round(r.notaMedia * 100) / 100
  r.tempoPreparoMedioMin = Math.round(r.tempoPreparoMedioMin * 10) / 10
  r.duracaoEntregaMediaMin = Math.round(r.duracaoEntregaMediaMin * 10) / 10

  r.formaPagamento = Array.from(formas.entries())
    .map(([forma, pedidos]) => ({ forma, pedidos }))
    .sort((a, b) => b.pedidos - a.pedidos)

  r.hasData = true
  return r
}

export async function getNinefoodPedidoResumoForMonth(
  unitId: string,
  year: number,
  month: number,
): Promise<NinefoodPedidoResumo> {
  const admin = createAdminClient()
  const rows = await pageAll((from, to) =>
    admin
      .from("ninefood_pedidos")
      .select(SELECT)
      .eq("unit_id", unitId)
      .eq("ref_year", year)
      .eq("ref_month", month)
      .order("id")
      .range(from, to),
  )
  return aggregate(rows)
}

export async function getNetworkNinefoodPedidoResumo(
  unitIds: string[],
  year: number,
  month: number,
): Promise<NinefoodPedidoResumo> {
  if (unitIds.length === 0) return emptyResumo()
  const admin = createAdminClient()
  const rows = await pageAll((from, to) =>
    admin
      .from("ninefood_pedidos")
      .select(SELECT)
      .in("unit_id", unitIds)
      .eq("ref_year", year)
      .eq("ref_month", month)
      .order("id")
      .range(from, to),
  )
  return aggregate(rows)
}

export type NinefoodPedidoUnitRow = {
  unitId: string
  unitCode: string
  unitName: string
  pedidos: number
  cancelados: number
  /** Faturamento (Loja diária) — preenchido fora; fallback = receita_vendas. */
  faturamento: number
  receitaVendas: number
  receitaRealLoja: number
  promoLoja: number
}

/** Resumo por loja (pra lista "Valor vendido por loja" no consolidado). */
export async function getNinefoodPedidoPorLoja(
  unitIds: string[],
  year: number,
  month: number,
): Promise<NinefoodPedidoUnitRow[]> {
  if (unitIds.length === 0) return []
  const admin = createAdminClient()
  type PorLojaRow = {
    unit_id: string
    receita_vendas: number | string | null
    receita_real_loja: number | string | null
    despesas_ofertas: number | string | null
    horario_cancelamento: string | null
  }
  const rows: PorLojaRow[] = []
  let from = 0
  const pageSize = 1000
  for (let i = 0; i < 300; i++) {
    const { data, error } = await admin
      .from("ninefood_pedidos")
      .select(
        "unit_id, receita_vendas, receita_real_loja, despesas_ofertas, horario_cancelamento",
      )
      .in("unit_id", unitIds)
      .eq("ref_year", year)
      .eq("ref_month", month)
      .order("id")
      .range(from, from + pageSize - 1)
    if (error) {
      console.error("getNinefoodPedidoPorLoja:", error.message)
      break
    }
    if (!data || data.length === 0) break
    rows.push(...(data as PorLojaRow[]))
    if (data.length < pageSize) break
    from += pageSize
  }
  if (rows.length === 0) return []

  const byUnit = new Map<string, NinefoodPedidoUnitRow>()
  for (const r of rows) {
    let u = byUnit.get(r.unit_id)
    if (!u) {
      u = {
        unitId: r.unit_id,
        unitCode: "?",
        unitName: "(unidade)",
        pedidos: 0,
        cancelados: 0,
        faturamento: 0,
        receitaVendas: 0,
        receitaRealLoja: 0,
        promoLoja: 0,
      }
      byUnit.set(r.unit_id, u)
    }
    u.pedidos++
    if (r.horario_cancelamento) u.cancelados++
    u.receitaVendas += Number(r.receita_vendas) || 0
    u.receitaRealLoja += Number(r.receita_real_loja) || 0
    u.promoLoja += num(r.despesas_ofertas)
  }

  const ids = Array.from(byUnit.keys())
  const { data: units } = await admin
    .from("units")
    .select("id, code, name")
    .in("id", ids)
  const nameMap = new Map(
    (units ?? []).map((u) => [u.id, { code: u.code, name: u.name }]),
  )
  return Array.from(byUnit.values())
    .map((u) => ({
      ...u,
      unitCode: nameMap.get(u.unitId)?.code ?? "?",
      unitName: nameMap.get(u.unitId)?.name ?? "(unidade)",
      receitaVendas: round(u.receitaVendas),
      receitaRealLoja: round(u.receitaRealLoja),
      promoLoja: round(u.promoLoja),
    }))
    .sort((a, b) => b.receitaVendas - a.receitaVendas)
}

/** Unidades com dados de pedidos 99 no mês (pra cobertura). */
export async function getNinefoodPedidoUnitsWithData(
  year: number,
  month: number,
): Promise<Set<string>> {
  const admin = createAdminClient()
  const set = new Set<string>()
  let from = 0
  const pageSize = 1000
  for (let i = 0; i < 300; i++) {
    const { data, error } = await admin
      .from("ninefood_pedidos")
      .select("unit_id")
      .eq("ref_year", year)
      .eq("ref_month", month)
      .order("id")
      .range(from, from + pageSize - 1)
    if (error) {
      console.error("getNinefoodPedidoUnitsWithData:", error.message)
      break
    }
    if (!data || data.length === 0) break
    for (const r of data) if (r.unit_id) set.add(r.unit_id)
    if (data.length < pageSize) break
    from += pageSize
  }
  return set
}
