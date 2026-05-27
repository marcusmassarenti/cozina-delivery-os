import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { mockMonthlyFor, type UnitMonthly } from "@/lib/mock-monthly"
import type { PlatformId } from "@/components/platform-logo"

export type Unit = {
  id: string
  code: string
  name: string
  city: string | null
  state: string | null
  cnpj: string | null
  active: boolean
  brand_id: string
  monthly: UnitMonthly
}

type DbUnit = {
  id: string
  code: string
  name: string
  city: string | null
  state: string | null
  cnpj: string | null
  active: boolean
  brand_id: string
}

function attachMock(u: DbUnit): Unit {
  return { ...u, monthly: mockMonthlyFor(u.code) }
}

export async function getUnits(): Promise<Unit[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("units")
    .select("id, code, name, city, state, cnpj, active, brand_id")
    .order("code")
  if (error) throw new Error(`Falha ao buscar unidades: ${error.message}`)
  return (data ?? []).map(attachMock)
}

export async function getUnitByCode(code: string): Promise<Unit | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("units")
    .select("id, code, name, city, state, cnpj, active, brand_id")
    .eq("code", code)
    .maybeSingle()
  if (error) throw new Error(`Falha ao buscar unidade ${code}: ${error.message}`)
  if (!data) return null
  return attachMock(data)
}

export async function getDefaultBrand(): Promise<{ id: string; name: string }> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("brands")
    .select("id, name")
    .eq("slug", "churrasco-no-pote")
    .maybeSingle()
  if (error || !data)
    throw new Error("Marca Churrasco no Pote não encontrada — rodou a migration?")
  return data
}

//-------- Agregados ---------------------------------------------

export function networkTotalsFromUnits(units: Unit[]) {
  const active = units.filter((u) => u.active)
  const sum = (sel: (u: Unit) => number) =>
    active.reduce((acc, u) => acc + sel(u), 0)

  const pedidos = sum((u) => u.monthly.pedidos)
  const faturamentoBruto = sum((u) => u.monthly.faturamentoBruto)
  const faturamentoLiquido = sum((u) => u.monthly.faturamentoLiquido)
  const totalLiquido = sum((u) => u.monthly.totalLiquido)
  const mediaTicket = pedidos > 0 ? faturamentoBruto / pedidos : 0
  const mediaDia = Math.round(pedidos / 30)
  const taxaRepasse =
    faturamentoBruto > 0 ? (faturamentoLiquido / faturamentoBruto) * 100 : 0

  return {
    pedidos,
    mediaDia,
    faturamentoBruto,
    faturamentoLiquido,
    totalLiquido,
    mediaTicket,
    taxaRepasse,
  }
}

export function platformTotalsFromUnits(units: Unit[]) {
  const ids: PlatformId[] = ["ifood", "99food", "keeta"]
  return ids.map((id) => {
    const name = id === "ifood" ? "iFood" : id === "99food" ? "99 Food" : "Keeta"
    const bruto = units
      .filter((u) => u.active)
      .reduce((acc, u) => {
        const p = u.monthly.platforms.find((p) => p.id === id)
        return acc + (p?.bruto ?? 0)
      }, 0)
    const liquido = units
      .filter((u) => u.active)
      .reduce((acc, u) => {
        const p = u.monthly.platforms.find((p) => p.id === id)
        return acc + (p?.liquido ?? 0)
      }, 0)
    const pctLoja = bruto > 0 ? (liquido / bruto) * 100 : 0
    return { id, name, bruto, liquido, pctLoja }
  })
}
