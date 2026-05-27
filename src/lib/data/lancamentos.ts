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
      "custo_produtos_cozina, custo_produtos_loja, clientes_novos, nota_media, observacoes, total_recebido_real",
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
