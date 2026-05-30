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

const VR_TAXA = 0.08

/**
 * Para cada unitId, calcula o snapshot mensal completo
 * (compatível com UnitMonthly) a partir de:
 *   - daily_entries (pedidos, cancelados, faturamento por plataforma)
 *   - monthly_platform_entries (taxas, VR, cancelamentos por plataforma)
 *   - monthly_entries (custos, nota, observações, total_recebido_real)
 *
 * Usa total_recebido_real quando preenchido pra calcular margem,
 * senão usa o calculado das plataformas.
 */
export async function getRealMonthlyForUnits(
  unitIds: string[],
  year: number,
  month: number,
): Promise<Map<string, UnitMonthly>> {
  const result = new Map<string, UnitMonthly>()
  if (unitIds.length === 0) return result

  const supabase = createAdminClient()
  const firstDay = firstDayOfMonth(year, month)
  const lastDay = lastDayOfMonth(year, month)

  const [dailyRes, monthlyRes, platformRes] = await Promise.all([
    supabase
      .from("daily_entries")
      .select("unit_id, platform, pedidos, cancelados, faturamento")
      .in("unit_id", unitIds)
      .gte("date", firstDay)
      .lte("date", lastDay),
    supabase
      .from("monthly_entries")
      .select(
        "unit_id, custo_produtos_cozina, custo_produtos_loja, custo_operacao, clientes_novos, nota_media, observacoes, total_recebido_real",
      )
      .in("unit_id", unitIds)
      .eq("year", year)
      .eq("month", month),
    supabase
      .from("monthly_platform_entries")
      .select("*")
      .in("unit_id", unitIds)
      .eq("year", year)
      .eq("month", month),
  ])

  type Daily = {
    unit_id: string
    platform: string
    pedidos: number
    cancelados: number
    faturamento: number | string
  }
  type Monthly = {
    unit_id: string
    custo_produtos_cozina: number | string
    custo_produtos_loja: number | string
    custo_operacao: number | string | null
    clientes_novos: number
    nota_media: number | string
    observacoes: string
    total_recebido_real: number | string | null
  }
  type Plat = {
    unit_id: string
    platform: string
    taxa_entrega: number | string
    promocoes: number | string
    taxa_comissao: number | string
    servicos_logisticos: number | string
    outros_descontos: number | string
    vr_recebido: number | string
    cancelamentos_reembolsos: number | string
  }

  const daily = (dailyRes.data ?? []) as Daily[]
  const monthly = (monthlyRes.data ?? []) as Monthly[]
  const platformRows = (platformRes.data ?? []) as Plat[]

  for (const unitId of unitIds) {
    const myDaily = daily.filter((d) => d.unit_id === unitId)
    const myMonthly = monthly.find((m) => m.unit_id === unitId)
    const myPlats = platformRows.filter((p) => p.unit_id === unitId)

    // Faturamento bruto por plataforma (do diário)
    const platFat: Record<PlatformId, { pedidos: number; cancelados: number; faturamento: number }> = {
      ifood: { pedidos: 0, cancelados: 0, faturamento: 0 },
      "99food": { pedidos: 0, cancelados: 0, faturamento: 0 },
      keeta: { pedidos: 0, cancelados: 0, faturamento: 0 },
    }
    for (const d of myDaily) {
      const pid = d.platform as PlatformId
      if (!(pid in platFat)) continue
      platFat[pid].pedidos += d.pedidos
      platFat[pid].cancelados += d.cancelados
      platFat[pid].faturamento += Number(d.faturamento)
    }

    // Calcula taxas/VR/líquido por plataforma
    const platformsBreakdown = (
      ["ifood", "99food", "keeta"] as PlatformId[]
    ).map((pid) => {
      const pe = myPlats.find((p) => p.platform === pid)
      const taxas = pe
        ? Number(pe.taxa_entrega) +
          Number(pe.promocoes) +
          Number(pe.taxa_comissao) +
          Number(pe.servicos_logisticos) +
          Number(pe.outros_descontos)
        : 0
      const vrRecebido = pe ? Number(pe.vr_recebido) : 0
      const vrLiquido = vrRecebido * (1 - VR_TAXA)
      const cancelamentos = pe ? Number(pe.cancelamentos_reembolsos) : 0
      const bruto = platFat[pid].faturamento
      const faturamentoLiquido = bruto - taxas
      const totalRecebido = faturamentoLiquido + vrLiquido + cancelamentos
      const pctLoja = bruto > 0 ? (totalRecebido / bruto) * 100 : 0
      return {
        id: pid,
        name: pid === "ifood" ? "iFood" : pid === "99food" ? "99 Food" : "Keeta",
        bruto,
        liquido: totalRecebido,
        pctLoja,
      }
    })

    const totalPedidos = (Object.values(platFat) as { pedidos: number; cancelados: number; faturamento: number }[]).reduce(
      (acc, p) => acc + p.pedidos,
      0,
    )
    const totalCancelados = (Object.values(platFat) as { pedidos: number; cancelados: number; faturamento: number }[]).reduce(
      (acc, p) => acc + p.cancelados,
      0,
    )
    const totalFaturamento = (Object.values(platFat) as { pedidos: number; cancelados: number; faturamento: number }[]).reduce(
      (acc, p) => acc + p.faturamento,
      0,
    )

    const totalTaxas = myPlats.reduce(
      (acc, p) =>
        acc +
        Number(p.taxa_entrega) +
        Number(p.promocoes) +
        Number(p.taxa_comissao) +
        Number(p.servicos_logisticos) +
        Number(p.outros_descontos),
      0,
    )
    const totalVrRecebido = myPlats.reduce(
      (acc, p) => acc + Number(p.vr_recebido),
      0,
    )
    const totalVrTaxa = totalVrRecebido * VR_TAXA
    const totalVrLiquido = totalVrRecebido - totalVrTaxa
    const totalCancelamentos = myPlats.reduce(
      (acc, p) => acc + Number(p.cancelamentos_reembolsos),
      0,
    )

    const faturamentoLiquido = totalFaturamento - totalTaxas
    const totalLiquidoCalc =
      faturamentoLiquido + totalVrLiquido + totalCancelamentos
    const ticketMedio = totalPedidos > 0 ? totalFaturamento / totalPedidos : 0

    const custoCozina = myMonthly ? Number(myMonthly.custo_produtos_cozina) : 0
    const custoLoja = myMonthly ? Number(myMonthly.custo_produtos_loja) : 0
    const custoOperacao = myMonthly ? Number(myMonthly.custo_operacao ?? 0) : 0
    const totalRecebidoReal = myMonthly
      ? Number(myMonthly.total_recebido_real ?? 0)
      : 0
    const baseParaMargem =
      totalRecebidoReal > 0 ? totalRecebidoReal : totalLiquidoCalc
    const margemLiquida = baseParaMargem - custoCozina - custoLoja
    const margemLucroPct =
      totalFaturamento > 0 ? (margemLiquida / totalFaturamento) * 100 : 0

    result.set(unitId, {
      pedidos: totalPedidos,
      pedidosCancelados: totalCancelados,
      clientesNovos: myMonthly ? myMonthly.clientes_novos : null,
      ticketMedio,
      faturamentoBruto: totalFaturamento,
      faturamentoLiquido,
      totalLiquido: totalLiquidoCalc,
      vrRecebido: totalVrRecebido,
      vrTaxaMedia8: totalVrTaxa,
      cancelamentosReembolsos: totalCancelamentos,
      taxaEntregaIfood: myPlats.find((p) => p.platform === "ifood")
        ? Number(myPlats.find((p) => p.platform === "ifood")!.taxa_entrega)
        : 0,
      promocoes: myPlats.find((p) => p.platform === "ifood")
        ? Number(myPlats.find((p) => p.platform === "ifood")!.promocoes)
        : 0,
      taxaComissaoIfood: myPlats.find((p) => p.platform === "ifood")
        ? Number(myPlats.find((p) => p.platform === "ifood")!.taxa_comissao)
        : 0,
      servicosLogisticos: myPlats.find((p) => p.platform === "ifood")
        ? Number(
            myPlats.find((p) => p.platform === "ifood")!.servicos_logisticos,
          )
        : 0,
      outrosDescontosIfood: myPlats.find((p) => p.platform === "ifood")
        ? Number(myPlats.find((p) => p.platform === "ifood")!.outros_descontos)
        : 0,
      custoProdutosCozina: custoCozina,
      custoProdutosLoja: custoLoja > 0 ? custoLoja : null,
      custoOperacao,
      margemLiquida,
      margemLucroPct,
      notaMedia: myMonthly ? Number(myMonthly.nota_media) : 0,
      observacoes: myMonthly ? myMonthly.observacoes : "",
      platforms: platformsBreakdown,
    })
  }

  return result
}
