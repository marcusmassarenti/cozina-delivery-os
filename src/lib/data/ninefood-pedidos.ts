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
import { formaPagamentoLabel } from "@/lib/ninefood/pagamento"
import { metodoEntregaLabel } from "@/lib/ninefood/entrega"
import {
  motivoCancelamentoLabel,
  responsavelCancelamentoLabel,
} from "@/lib/ninefood/cancelamento"

export type FormaMix = { forma: string; pedidos: number }
export type MixItem = { label: string; pedidos: number }

export type NinefoodPedidoResumo = {
  totalPedidos: number
  concluidos: number
  cancelados: number
  // Valores (R$)
  receitaVendas: number // bruto
  receitaRealLoja: number // líquido pra loja
  precoOriginal: number
  ticketMedio: number
  descontoPct: number // 1 − receita/preço de tabela
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
  // Qualidade & operação
  notaMedia: number
  avaliados: number
  tempoPreparoMedioMin: number
  duracaoEntregaMediaMin: number
  tempoAceitacaoMedioSeg: number
  tempoEsperaRetiradaMedioSeg: number
  preparacaoAtrasadaPct: number
  // Distribuições
  formaPagamento: FormaMix[]
  metodoEntrega: MixItem[]
  cancelPorResponsavel: MixItem[]
  cancelMotivos: MixItem[]
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
    descontoPct: 0,
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
    tempoAceitacaoMedioSeg: 0,
    tempoEsperaRetiradaMedioSeg: 0,
    preparacaoAtrasadaPct: 0,
    formaPagamento: [],
    metodoEntrega: [],
    cancelPorResponsavel: [],
    cancelMotivos: [],
    hasData: false,
  }
}

type Row = {
  /** Identifica a fonte: com import_id = planilha; sem = webhook da API. */
  unit_id?: string
  data?: string
  import_id?: string | null
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
  pay_channel: number | null
  horario_cancelamento: string | null
  metodo_entrega: string | null
  parte_responsavel_cancelamento: string | null
  motivos_cancelamento_comerciante: string | null
  preparacao_atrasada: boolean | null
  tempo_aceitacao_seg: number | null
  tempo_espera_retirada_seg: number | null
}

const SELECT =
  "unit_id, data, import_id, receita_vendas, receita_real_loja, preco_original_item, despesas_ofertas, despesas_comissao, taxa_canal_pagamento, custos_logisticos, custo_loja_oferta_entrega_gratis, qtd_pedidos_anteriores_cliente, nivel_avaliacao, tempo_preparo_min, duracao_entrega_seg, forma_pagamento, pay_channel, horario_cancelamento, metodo_entrega, parte_responsavel_cancelamento, motivos_cancelamento_comerciante, preparacao_atrasada, tempo_aceitacao_seg, tempo_espera_retirada_seg"

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

/**
 * PLANILHA VENCE QUANDO EXISTE.
 *
 * `ninefood_pedidos` guarda o MESMO pedido duas vezes quando a loja tem
 * planilha E webhook: uma linha com `import_id` (planilha) e outra sem (API).
 * Julho/26 da Cozina: 2.382 + 2.429 = 4.811 linhas para ~2.400 pedidos — a
 * tela de Pedidos mostrava o dobro.
 *
 * Não dá pra deduplicar por `pedido_id`: o id da fonte API chega corrompido
 * por precisão float (…950628 vira …951000). Então a régua é por DIA, que é a
 * granularidade em que a planilha cobre: se aquele (loja, dia) tem alguma
 * linha de planilha, as linhas de API daquele dia são descartadas; onde não
 * houve importação, a API preenche.
 *
 * Decisão do Marcus, e ela preserva o melhor dos dois: a planilha é o
 * relatório oficial e traz avaliação e cancelamento; o webhook chega sozinho
 * todo dia e cobre o que ninguém importou.
 */
function preferirPlanilha(rows: Row[]): Row[] {
  const diasComPlanilha = new Set<string>()
  for (const r of rows) {
    if (r.import_id) diasComPlanilha.add(`${r.unit_id}|${r.data}`)
  }
  if (diasComPlanilha.size === 0) return rows
  return rows.filter((r) => r.import_id || !diasComPlanilha.has(`${r.unit_id}|${r.data}`))
}

/**
 * ⚠️ CONTAGEM DUPLA CONHECIDA — `ninefood_pedidos` guarda o MESMO pedido duas
 * vezes quando a loja tem planilha E webhook: uma linha com `import_id`
 * (planilha) e outra sem (API). Não dá pra deduplicar por `pedido_id` porque o
 * id da fonte API chega corrompido por precisão float (…950628 vira …951000).
 *
 * Julho/26, Cozina Foods: 2.382 linhas de planilha + 2.429 de API = 4.811,
 * para ~2.400 pedidos reais. Logo `totalPedidos` aqui está DOBRADO nas lojas
 * com as duas fontes, e qualquer média derivada dele está pela metade.
 *
 * Não corrigido aqui de propósito: as duas fontes trazem campos diferentes
 * (planilha tem avaliação e cancelamento; API tem forma de pagamento e frete),
 * então escolher uma vencedora é decisão de produto, não de código. O reparo
 * definitivo passa por recuperar o id íntegro em `ninefood_api_bill.raw->>'orderId'`.
 */
function aggregate(rows: Row[]): NinefoodPedidoResumo {
  if (rows.length === 0) return emptyResumo()
  const r = emptyResumo()
  r.totalPedidos = rows.length

  const formas = new Map<string, number>()
  const metodos = new Map<string, number>()
  const cancResp = new Map<string, number>()
  const cancMot = new Map<string, number>()
  let somaNotas = 0
  let somaPreparo = 0
  let nPreparo = 0
  let somaEntrega = 0
  let nEntrega = 0
  let somaAceitacao = 0
  let nAceitacao = 0
  let somaEspera = 0
  let nEspera = 0
  let atrasados = 0

  for (const row of rows) {
    if (row.horario_cancelamento) {
      r.cancelados++
      const resp = responsavelCancelamentoLabel(
        row.parte_responsavel_cancelamento,
      )
      cancResp.set(resp, (cancResp.get(resp) ?? 0) + 1)
      const mot = motivoCancelamentoLabel(row.motivos_cancelamento_comerciante)
      if (mot) cancMot.set(mot, (cancMot.get(mot) ?? 0) + 1)
    }
    if (row.preparacao_atrasada === true) atrasados++
    if (row.tempo_aceitacao_seg != null && row.tempo_aceitacao_seg >= 0) {
      somaAceitacao += row.tempo_aceitacao_seg
      nAceitacao++
    }
    if (
      row.tempo_espera_retirada_seg != null &&
      row.tempo_espera_retirada_seg >= 0
    ) {
      somaEspera += row.tempo_espera_retirada_seg
      nEspera++
    }
    const metodo = metodoEntregaLabel(row.metodo_entrega)
    metodos.set(metodo, (metodos.get(metodo) ?? 0) + 1)

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
    const forma = formaPagamentoLabel({
      payChannel: row.pay_channel,
      formaPagamentoText: row.forma_pagamento,
    })
    formas.set(forma, (formas.get(forma) ?? 0) + 1)
  }

  r.concluidos = r.totalPedidos - r.cancelados
  r.taxasTotal =
    r.comissao + r.taxaCanalPagamento + r.custosLogisticos + r.custoFreteGratis
  r.ticketMedio = r.totalPedidos > 0 ? r.receitaVendas / r.totalPedidos : 0
  r.descontoPct =
    r.precoOriginal > 0 ? (1 - r.receitaVendas / r.precoOriginal) * 100 : 0
  r.notaMedia = r.avaliados > 0 ? somaNotas / r.avaliados : 0
  r.tempoPreparoMedioMin = nPreparo > 0 ? somaPreparo / nPreparo : 0
  r.duracaoEntregaMediaMin = nEntrega > 0 ? somaEntrega / nEntrega / 60 : 0
  r.tempoAceitacaoMedioSeg = nAceitacao > 0 ? somaAceitacao / nAceitacao : 0
  r.tempoEsperaRetiradaMedioSeg = nEspera > 0 ? somaEspera / nEspera : 0
  r.preparacaoAtrasadaPct =
    r.totalPedidos > 0 ? (atrasados / r.totalPedidos) * 100 : 0

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
  r.tempoAceitacaoMedioSeg = Math.round(r.tempoAceitacaoMedioSeg)
  r.tempoEsperaRetiradaMedioSeg = Math.round(r.tempoEsperaRetiradaMedioSeg)
  r.descontoPct = Math.round(r.descontoPct * 10) / 10
  r.preparacaoAtrasadaPct = Math.round(r.preparacaoAtrasadaPct * 10) / 10

  const toMix = (m: Map<string, number>) =>
    Array.from(m.entries())
      .map(([label, pedidos]) => ({ label, pedidos }))
      .sort((a, b) => b.pedidos - a.pedidos)

  r.formaPagamento = Array.from(formas.entries())
    .map(([forma, pedidos]) => ({ forma, pedidos }))
    .sort((a, b) => b.pedidos - a.pedidos)
  r.metodoEntrega = toMix(metodos)
  r.cancelPorResponsavel = toMix(cancResp)
  r.cancelMotivos = toMix(cancMot)

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
  return aggregate(preferirPlanilha(rows))
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
  return aggregate(preferirPlanilha(rows))
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
