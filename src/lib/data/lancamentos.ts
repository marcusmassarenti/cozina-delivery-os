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

export type MonthlyEntry = {
  taxaEntregaIfood: number
  promocoes: number
  taxaComissaoIfood: number
  servicosLogisticos: number
  outrosDescontosIfood: number
  vrRecebido: number
  vrTaxaMedia8: number
  cancelamentosReembolsos: number
  custoProdutosCozina: number
  custoProdutosLoja: number
  clientesNovos: number
  notaMedia: number
  observacoes: string
}

export const emptyMonthlyEntry: MonthlyEntry = {
  taxaEntregaIfood: 0,
  promocoes: 0,
  taxaComissaoIfood: 0,
  servicosLogisticos: 0,
  outrosDescontosIfood: 0,
  vrRecebido: 0,
  vrTaxaMedia8: 0,
  cancelamentosReembolsos: 0,
  custoProdutosCozina: 0,
  custoProdutosLoja: 0,
  clientesNovos: 0,
  notaMedia: 0,
  observacoes: "",
}

function pad2(n: number) {
  return String(n).padStart(2, "0")
}

function firstDayOfMonth(year: number, month: number) {
  return `${year}-${pad2(month)}-01`
}

function lastDayOfMonth(year: number, month: number) {
  // month is 1-12. Date constructor with month 0-11.
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

export async function getMonthlyEntry(
  unitId: string,
  year: number,
  month: number,
): Promise<MonthlyEntry> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("monthly_entries")
    .select("*")
    .eq("unit_id", unitId)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return emptyMonthlyEntry
  return {
    taxaEntregaIfood: Number(data.taxa_entrega_ifood),
    promocoes: Number(data.promocoes),
    taxaComissaoIfood: Number(data.taxa_comissao_ifood),
    servicosLogisticos: Number(data.servicos_logisticos),
    outrosDescontosIfood: Number(data.outros_descontos_ifood),
    vrRecebido: Number(data.vr_recebido),
    vrTaxaMedia8: Number(data.vr_taxa_media_8),
    cancelamentosReembolsos: Number(data.cancelamentos_reembolsos),
    custoProdutosCozina: Number(data.custo_produtos_cozina),
    custoProdutosLoja: Number(data.custo_produtos_loja),
    clientesNovos: data.clientes_novos,
    notaMedia: Number(data.nota_media),
    observacoes: data.observacoes,
  }
}

//---------- Agregação --------------------------------------------

export type DailyAggregate = {
  date: string // YYYY-MM-DD
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
