/**
 * Queries em cima dos pedidos do iFood (migration 0017) — foco em forma de
 * pagamento e VR por bandeira. NÃO é fonte de faturamento (isso vem da
 * conciliação); aqui o objetivo é o mix de pagamento e o VR pra conciliar.
 *
 * "Valor" do VR = TOTAL PAGO PELO CLIENTE (o que foi cobrado no cartão).
 */

import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/** Bandeiras de VR conhecidas, na ordem de exibição. */
export const VR_BANDEIRAS = [
  "SODEXO",
  "ALELO",
  "VR",
  "TICKET",
  "IFOOD",
  "OUTROS",
] as const
export type VrBandeira = (typeof VR_BANDEIRAS)[number]

/** Grupos de forma de pagamento, na ordem de exibição. */
export const FORMA_GRUPOS = [
  "Vale-Refeição",
  "Crédito",
  "PIX",
  "Carteira",
  "Débito",
  "Outros",
] as const

export type VrPorBandeira = { bandeira: string; pedidos: number; valor: number }
export type MixForma = { grupo: string; pedidos: number; valor: number }

export type PagamentoResumo = {
  totalPedidos: number
  totalValor: number
  vrPedidos: number
  vrValor: number
  vrPct: number // % do valor que foi em VR
  porBandeira: VrPorBandeira[]
  mix: MixForma[]
  hasData: boolean
}

function emptyResumo(): PagamentoResumo {
  return {
    totalPedidos: 0,
    totalValor: 0,
    vrPedidos: 0,
    vrValor: 0,
    vrPct: 0,
    porBandeira: [],
    mix: [],
    hasData: false,
  }
}

async function pageAll<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
  maxRows = 300000,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (from < maxRows) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) {
      console.error("ifood-pedidos pageAll error:", error.message)
      break
    }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

type Row = {
  unit_id: string
  total_pago_cliente: number | string | null
  forma_grupo: string | null
  bandeira_vr: string | null
}

function aggregate(rows: Row[]): PagamentoResumo {
  if (rows.length === 0) return emptyResumo()
  const val = (r: Row) => Number(r.total_pago_cliente) || 0

  const byBandeira = new Map<string, { pedidos: number; valor: number }>()
  const byGrupo = new Map<string, { pedidos: number; valor: number }>()
  let totalValor = 0
  let vrPedidos = 0
  let vrValor = 0

  for (const r of rows) {
    const v = val(r)
    totalValor += v
    const grupo = r.forma_grupo || "Outros"
    const g = byGrupo.get(grupo) ?? { pedidos: 0, valor: 0 }
    g.pedidos += 1
    g.valor += v
    byGrupo.set(grupo, g)
    if (r.bandeira_vr) {
      vrPedidos += 1
      vrValor += v
      const b = byBandeira.get(r.bandeira_vr) ?? { pedidos: 0, valor: 0 }
      b.pedidos += 1
      b.valor += v
      byBandeira.set(r.bandeira_vr, b)
    }
  }

  const round = (n: number) => Math.round(n * 100) / 100
  const porBandeira: VrPorBandeira[] = VR_BANDEIRAS.map((bandeira) => {
    const b = byBandeira.get(bandeira) ?? { pedidos: 0, valor: 0 }
    return { bandeira, pedidos: b.pedidos, valor: round(b.valor) }
  }).filter((b) => b.pedidos > 0)
  // bandeiras fora do conjunto conhecido (raro)
  for (const [bandeira, b] of byBandeira) {
    if (!VR_BANDEIRAS.includes(bandeira as VrBandeira)) {
      porBandeira.push({ bandeira, pedidos: b.pedidos, valor: round(b.valor) })
    }
  }
  porBandeira.sort((a, b) => b.valor - a.valor)

  const mix: MixForma[] = FORMA_GRUPOS.map((grupo) => {
    const g = byGrupo.get(grupo) ?? { pedidos: 0, valor: 0 }
    return { grupo, pedidos: g.pedidos, valor: round(g.valor) }
  }).filter((g) => g.pedidos > 0)

  return {
    totalPedidos: rows.length,
    totalValor: round(totalValor),
    vrPedidos,
    vrValor: round(vrValor),
    vrPct: totalValor > 0 ? (vrValor / totalValor) * 100 : 0,
    porBandeira,
    mix,
    hasData: true,
  }
}

/** Resumo de pagamento/VR de UMA unidade no mês. */
export async function getPagamentoResumoForMonth(
  unitId: string,
  year: number,
  month: number,
): Promise<PagamentoResumo> {
  const admin = createAdminClient()
  const rows = await pageAll<Row>((a, b) =>
    admin
      .from("ifood_pedidos")
      .select("unit_id, total_pago_cliente, forma_grupo, bandeira_vr")
      .eq("unit_id", unitId)
      .eq("ref_year", year)
      .eq("ref_month", month)
      .range(a, b),
  )
  return aggregate(rows)
}

/** Resumo de pagamento/VR da rede no mês (com filtro opcional de unidades). */
export async function getNetworkPagamentoResumo(
  year: number,
  month: number,
  filterUnitIds?: string[],
): Promise<PagamentoResumo> {
  const admin = createAdminClient()
  const rows = await pageAll<Row>((a, b) => {
    let q = admin
      .from("ifood_pedidos")
      .select("unit_id, total_pago_cliente, forma_grupo, bandeira_vr")
      .eq("ref_year", year)
      .eq("ref_month", month)
      .range(a, b)
    if (filterUnitIds && filterUnitIds.length > 0)
      q = q.in("unit_id", filterUnitIds)
    return q
  })
  return aggregate(rows)
}

export type VrPorUnidade = {
  unitId: string
  unitCode: string
  unitName: string
  vrPedidos: number
  vrValor: number
  totalPedidos: number
  porBandeira: VrPorBandeira[]
}

/** VR por unidade no mês — pra ranking/tabela na tela Pedidos. */
export async function getVrByUnits(
  year: number,
  month: number,
  filterUnitIds?: string[],
): Promise<VrPorUnidade[]> {
  const admin = createAdminClient()
  const rows = await pageAll<Row & { bandeira_vr: string | null }>((a, b) => {
    let q = admin
      .from("ifood_pedidos")
      .select("unit_id, total_pago_cliente, forma_grupo, bandeira_vr")
      .eq("ref_year", year)
      .eq("ref_month", month)
      .range(a, b)
    if (filterUnitIds && filterUnitIds.length > 0)
      q = q.in("unit_id", filterUnitIds)
    return q
  })
  if (rows.length === 0) return []

  const byUnit = new Map<string, Row[]>()
  for (const r of rows) {
    const arr = byUnit.get(r.unit_id) ?? []
    arr.push(r)
    byUnit.set(r.unit_id, arr)
  }
  const unitIds = Array.from(byUnit.keys())
  const { data: units } = await admin
    .from("units")
    .select("id, code, name")
    .in("id", unitIds)
  const nameMap = new Map(
    (units ?? []).map((u) => [u.id, { code: u.code, name: u.name }]),
  )

  const out: VrPorUnidade[] = unitIds.map((id) => {
    const ag = aggregate(byUnit.get(id)!)
    return {
      unitId: id,
      unitCode: nameMap.get(id)?.code ?? "?",
      unitName: nameMap.get(id)?.name ?? "(unidade)",
      vrPedidos: ag.vrPedidos,
      vrValor: ag.vrValor,
      totalPedidos: ag.totalPedidos,
      porBandeira: ag.porBandeira,
    }
  })
  return out.sort((a, b) => b.vrValor - a.vrValor)
}
