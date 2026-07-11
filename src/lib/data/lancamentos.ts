import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import type { PlatformId } from "@/components/platform-logo"

export type DailyEntry = {
  date: string // YYYY-MM-DD
  platform: PlatformId
  pedidos: number
  cancelados: number
  faturamento: number
}

export type PlatformEntry = {
  taxaEntrega: number
  promocoes: number
  taxaComissao: number
  servicosLogisticos: number
  outrosDescontos: number
  vrRecebido: number
  cancelamentosReembolsos: number
}

export type MonthlyGeneral = {
  custoProdutosCozina: number
  custoProdutosLoja: number
  custoOperacao: number
  clientesNovos: number
  notaMedia: number
  observacoes: string
  totalRecebidoReal: number
}

export const emptyPlatformEntry: PlatformEntry = {
  taxaEntrega: 0,
  promocoes: 0,
  taxaComissao: 0,
  servicosLogisticos: 0,
  outrosDescontos: 0,
  vrRecebido: 0,
  cancelamentosReembolsos: 0,
}

export const emptyMonthlyGeneral: MonthlyGeneral = {
  custoProdutosCozina: 0,
  custoProdutosLoja: 0,
  custoOperacao: 0,
  clientesNovos: 0,
  notaMedia: 0,
  observacoes: "",
  totalRecebidoReal: 0,
}

function pad2(n: number) {
  return String(n).padStart(2, "0")
}

function firstDayOfMonth(year: number, month: number) {
  return `${year}-${pad2(month)}-01`
}

function lastDayOfMonth(year: number, month: number) {
  const d = new Date(year, month, 0)
  return `${year}-${pad2(month)}-${pad2(d.getDate())}`
}

export async function getDailyEntries(
  unitId: string,
  year: number,
  month: number,
): Promise<DailyEntry[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("daily_entries")
    .select("date, platform, pedidos, cancelados, faturamento")
    .eq("unit_id", unitId)
    .gte("date", firstDayOfMonth(year, month))
    .lte("date", lastDayOfMonth(year, month))
    .order("date")
  if (error) throw new Error(error.message)
  return (data ?? []).map((d) => ({
    date: d.date,
    platform: d.platform as PlatformId,
    pedidos: d.pedidos,
    cancelados: d.cancelados,
    faturamento: Number(d.faturamento),
  }))
}

export async function getMonthlyGeneral(
  unitId: string,
  year: number,
  month: number,
): Promise<MonthlyGeneral> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("monthly_entries")
    .select(
      "custo_produtos_cozina, custo_produtos_loja, custo_operacao, clientes_novos, nota_media, observacoes, total_recebido_real",
    )
    .eq("unit_id", unitId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return emptyMonthlyGeneral
  return {
    custoProdutosCozina: Number(data.custo_produtos_cozina),
    custoProdutosLoja: Number(data.custo_produtos_loja),
    custoOperacao: Number(data.custo_operacao ?? 0),
    clientesNovos: data.clientes_novos,
    notaMedia: Number(data.nota_media),
    observacoes: data.observacoes,
    totalRecebidoReal: Number(data.total_recebido_real ?? 0),
  }
}

export async function getPlatformEntries(
  unitId: string,
  year: number,
  month: number,
): Promise<Record<PlatformId, PlatformEntry>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("monthly_platform_entries")
    .select("*")
    .eq("unit_id", unitId)
    .eq("year", year)
    .eq("month", month)
  if (error) throw new Error(error.message)

  const result: Record<PlatformId, PlatformEntry> = {
    ifood: { ...emptyPlatformEntry },
    "99food": { ...emptyPlatformEntry },
    keeta: { ...emptyPlatformEntry },
  }
  for (const row of data ?? []) {
    const platform = row.platform as PlatformId
    result[platform] = {
      taxaEntrega: Number(row.taxa_entrega),
      promocoes: Number(row.promocoes),
      taxaComissao: Number(row.taxa_comissao),
      servicosLogisticos: Number(row.servicos_logisticos),
      outrosDescontos: Number(row.outros_descontos),
      vrRecebido: Number(row.vr_recebido),
      cancelamentosReembolsos: Number(row.cancelamentos_reembolsos),
    }
  }
  return result
}

//---------- Agregação --------------------------------------------

export type DailyAggregate = {
  date: string
  ifood: { pedidos: number; cancelados: number; faturamento: number }
  "99food": { pedidos: number; cancelados: number; faturamento: number }
  keeta: { pedidos: number; cancelados: number; faturamento: number }
  totalPedidos: number
  totalCancelados: number
  totalFaturamento: number
}

export function aggregateByDay(entries: DailyEntry[]): DailyAggregate[] {
  const byDate = new Map<string, DailyAggregate>()
  for (const e of entries) {
    let agg = byDate.get(e.date)
    if (!agg) {
      agg = {
        date: e.date,
        ifood: { pedidos: 0, cancelados: 0, faturamento: 0 },
        "99food": { pedidos: 0, cancelados: 0, faturamento: 0 },
        keeta: { pedidos: 0, cancelados: 0, faturamento: 0 },
        totalPedidos: 0,
        totalCancelados: 0,
        totalFaturamento: 0,
      }
      byDate.set(e.date, agg)
    }
    agg[e.platform].pedidos += e.pedidos
    agg[e.platform].cancelados += e.cancelados
    agg[e.platform].faturamento += e.faturamento
    agg.totalPedidos += e.pedidos
    agg.totalCancelados += e.cancelados
    agg.totalFaturamento += e.faturamento
  }
  return Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  )
}

export type PlatformSummary = {
  pedidos: number
  cancelados: number
  faturamento: number
  ticketMedio: number
  pctCancelamento: number
}

export function summarizeByPlatform(
  entries: DailyEntry[],
): Record<PlatformId, PlatformSummary> {
  const platforms: PlatformId[] = ["ifood", "99food", "keeta"]
  const result = Object.fromEntries(
    platforms.map((p) => [
      p,
      { pedidos: 0, cancelados: 0, faturamento: 0, ticketMedio: 0, pctCancelamento: 0 },
    ]),
  ) as Record<PlatformId, PlatformSummary>

  for (const e of entries) {
    const s = result[e.platform]
    s.pedidos += e.pedidos
    s.cancelados += e.cancelados
    s.faturamento += e.faturamento
  }
  for (const p of platforms) {
    const s = result[p]
    s.ticketMedio = s.pedidos > 0 ? s.faturamento / s.pedidos : 0
    s.pctCancelamento = s.pedidos > 0 ? (s.cancelados / s.pedidos) * 100 : 0
  }
  return result
}

export function sumMonth(entries: DailyEntry[]) {
  return entries.reduce(
    (acc, e) => {
      acc.pedidos += e.pedidos
      acc.cancelados += e.cancelados
      acc.faturamento += e.faturamento
      return acc
    },
    { pedidos: 0, cancelados: 0, faturamento: 0 },
  )
}

//---------- Agregado por unidade (pro dashboard) -----------------

import type { UnitMonthly } from "@/lib/mock-monthly"
import { getFinanceiroResumoByUnits } from "@/lib/data/ifood-imported"
import { getNinefoodResumoByUnits } from "@/lib/data/ninefood-imported"
import { getKeetaResumoByUnits } from "@/lib/data/keeta-imported"
import { getVrByUnits } from "@/lib/data/ifood-pedidos"
import { getKeetaPedidoPorLoja } from "@/lib/data/keeta-pedidos"

const VR_TAXA = 0.08

function platformBreakdown(
  id: PlatformId,
  name: string,
  bruto: number,
  liquido: number,
  recebidoDireto = 0,
  promocoesLoja = 0,
) {
  return {
    id,
    name,
    bruto,
    liquido,
    pctLoja: bruto > 0 ? (liquido / bruto) * 100 : 0,
    recebidoDireto,
    promocoesLoja,
  }
}

/**
 * Snapshot mensal por unidade (UnitMonthly) montado DOS DADOS IMPORTADOS —
 * é a fonte única que alimenta getUnits() e, por consequência, Dashboard,
 * Unidades, DRE e Avaliações. Loja nova aparece sozinha assim que importa.
 *
 * Faturamento/pedidos por plataforma:
 *   - iFood : Conciliação (ifood_financeiro). Sem ela → VALOR DOS ITENS do
 *             relatório de Pedidos (fallback).
 *   - 99    : Loja diária (ninefood_daily_loja).
 *   - Keeta : Loja diária (keeta_daily_loja). Sem venda → preço de tabela do
 *             Pedidos recentes (fallback).
 * Custos (Cozina/operação) e nota continuam do monthly_entries (manual).
 *
 * Perf: os fallbacks de pedidos só são buscados pras lojas que não têm o
 * relatório principal — na rede 100% onboardada, não custam nada.
 */
export async function getRealMonthlyForUnits(
  unitIds: string[],
  year: number,
  month: number,
  dateRange?: { start: string; end: string },
): Promise<Map<string, UnitMonthly>> {
  const result = new Map<string, UnitMonthly>()
  if (unitIds.length === 0) return result

  const supabase = createAdminClient()

  const [finMap, nineMap, keetaMap, monthlyRes] = await Promise.all([
    getFinanceiroResumoByUnits(unitIds, year, month, dateRange),
    getNinefoodResumoByUnits(unitIds, year, month, dateRange),
    getKeetaResumoByUnits(unitIds, year, month, dateRange),
    supabase
      .from("monthly_entries")
      .select(
        "unit_id, custo_produtos_cozina, custo_produtos_loja, custo_operacao, clientes_novos, nota_media, observacoes, total_recebido_real",
      )
      .in("unit_id", unitIds)
      .eq("year", year)
      .eq("month", month),
  ])

  type MonthlyRow = {
    unit_id: string
    custo_produtos_cozina: number | string
    custo_produtos_loja: number | string
    custo_operacao: number | string | null
    clientes_novos: number
    nota_media: number | string
    observacoes: string
    total_recebido_real: number | string | null
  }
  const monthlyByUnit = new Map<string, MonthlyRow>(
    ((monthlyRes.data ?? []) as MonthlyRow[]).map((m) => [m.unit_id, m]),
  )

  // Keeta cai no preço de tabela do Pedidos recentes quando não há Loja diária.
  const keetaFbIds = unitIds.filter((id) => !(keetaMap.get(id)?.hasData ?? false))

  const [vrRows, keetaPorLoja] = await Promise.all([
    // VR é pago À PARTE pelo iFood (fora do líquido da Conciliação). Puxamos
    // por TODAS as lojas: serve de fallback de bruto/líquido/pedidos pras lojas
    // sem Conciliação E alimenta o VR líquido do DRE em todas elas.
    unitIds.length > 0
      ? getVrByUnits(year, month, unitIds)
      : Promise.resolve([]),
    keetaFbIds.length > 0
      ? getKeetaPedidoPorLoja(keetaFbIds, year, month)
      : Promise.resolve([]),
  ])
  const ifoodFb = new Map(
    vrRows.map((v) => [
      v.unitId,
      {
        valorItens: v.valorItens,
        valorLiquido: v.valorLiquido,
        pedidos: v.totalPedidos,
        vrValor: v.vrValor,
      },
    ]),
  )
  const keetaFb = new Map(
    keetaPorLoja.map((k) => [
      k.unitId,
      { preco: k.precoOriginal, pedidos: k.pedidos, cancelados: k.cancelados },
    ]),
  )

  for (const unitId of unitIds) {
    const fin = finMap.get(unitId)
    const nine = nineMap.get(unitId)
    const keeta = keetaMap.get(unitId)
    const m = monthlyByUnit.get(unitId)

    // iFood: Conciliação, fallback no VALOR DOS ITENS do Pedidos
    const ifoodHas = fin?.hasData ?? false
    const ifFb = ifoodFb.get(unitId)
    const ifoodBruto = ifoodHas ? fin!.bruto : ifFb?.valorItens ?? 0
    // Fallback de líquido = VALOR LIQUIDO do relatório de pedidos (≤ bruto).
    const ifoodLiquido = ifoodHas
      ? fin!.liquido
      : Math.min(ifFb?.valorLiquido ?? 0, ifFb?.valorItens ?? 0)
    const ifoodPedidos = ifoodHas ? fin!.pedidosUnicos : ifFb?.pedidos ?? 0
    const ifoodCancel = ifoodHas
      ? fin!.cancelamentoTotalQtd + fin!.cancelamentoParcialQtd
      : 0

    // 99 Food: Loja diária
    const nineBruto = nine?.bruto ?? 0
    const nineLiquido = nine?.liquido ?? 0
    const ninePedidos = nine?.pedidos ?? 0
    const nineCancel = nine?.cancelamentosQtd ?? 0

    // Keeta: Loja diária, fallback no preço de tabela do Pedidos recentes
    const keetaHas = keeta?.hasData ?? false
    const keFb = keetaFb.get(unitId)
    const keetaBruto = keetaHas ? keeta!.bruto : keFb?.preco ?? 0
    const keetaLiquido = keetaHas ? keeta!.liquido : keFb?.preco ?? 0
    const keetaPedidos = keetaHas ? keeta!.pedidos : keFb?.pedidos ?? 0
    const keetaCancel = keetaHas ? keeta!.cancelamentosQtd : keFb?.cancelados ?? 0

    const ifoodRecebidoDireto = ifoodHas ? fin!.recebidoDireto : 0
    // Promoção que a LOJA bancou em cada plataforma. Pro "Para onde vai o
    // bruto" separar do que é taxa real da plataforma (comissão+entrega).
    const ifoodPromoLoja = ifoodHas ? Math.abs(fin!.promocaoLoja) : 0
    const ninePromoLoja = Math.abs(nine?.promocoesRs ?? 0)
    const keetaPromoLoja = keeta?.promocoesLoja ?? 0
    const platforms = [
      platformBreakdown(
        "ifood",
        "iFood",
        ifoodBruto,
        ifoodLiquido,
        ifoodRecebidoDireto,
        ifoodPromoLoja,
      ),
      platformBreakdown("99food", "99 Food", nineBruto, nineLiquido, 0, ninePromoLoja),
      platformBreakdown("keeta", "Keeta", keetaBruto, keetaLiquido, 0, keetaPromoLoja),
    ]

    const totalBruto = ifoodBruto + nineBruto + keetaBruto
    const totalLiquido = ifoodLiquido + nineLiquido + keetaLiquido
    const totalPedidos = ifoodPedidos + ninePedidos + keetaPedidos
    const totalCancelados = ifoodCancel + nineCancel + keetaCancel
    const ticketMedio = totalPedidos > 0 ? totalBruto / totalPedidos : 0

    // VR é pago à parte pelo iFood (fora do líquido da Conciliação), então
    // entra como receita extra no DRE — resultado.ts soma o VR líquido
    // (vrRecebido − vrTaxa, ou seja vr*0,92) por cima do líquido. O valor vem
    // do relatório de Pedidos (forma de pagamento/VR). Taxa média de 8%.
    const vrRecebido = ifFb?.vrValor ?? 0
    const vrTaxa = vrRecebido * 0.08

    // Custos (manuais)
    const custoCozina = m ? Number(m.custo_produtos_cozina) : 0
    const custoLoja = m ? Number(m.custo_produtos_loja) : 0
    const custoOperacao = m ? Number(m.custo_operacao ?? 0) : 0
    const totalRecebidoReal = m ? Number(m.total_recebido_real ?? 0) : 0
    const baseMargem = totalRecebidoReal > 0 ? totalRecebidoReal : totalLiquido
    const margemLiquida = baseMargem - custoCozina - custoLoja
    const margemLucroPct = totalBruto > 0 ? (margemLiquida / totalBruto) * 100 : 0

    result.set(unitId, {
      pedidos: totalPedidos,
      pedidosCancelados: totalCancelados,
      clientesNovos: m ? m.clientes_novos : null,
      ticketMedio,
      faturamentoBruto: totalBruto,
      faturamentoLiquido: totalLiquido,
      totalLiquido,
      vrRecebido,
      vrTaxaMedia8: vrTaxa,
      cancelamentosReembolsos: 0,
      taxaEntregaIfood: ifoodHas ? Math.abs(fin!.taxaEntrega) : 0,
      promocoes: ifoodHas ? Math.abs(fin!.promocaoLoja) : 0,
      taxaComissaoIfood: ifoodHas ? Math.abs(fin!.comissaoIfood) : 0,
      servicosLogisticos: 0,
      outrosDescontosIfood: 0,
      custoProdutosCozina: custoCozina,
      custoProdutosLoja: custoLoja > 0 ? custoLoja : null,
      custoOperacao,
      totalRecebidoReal,
      margemLiquida,
      margemLucroPct,
      notaMedia: m ? Number(m.nota_media) : 0,
      observacoes: m ? m.observacoes : "",
      platforms,
    })
  }

  return result
}
