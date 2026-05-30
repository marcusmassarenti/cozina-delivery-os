import "server-only"

import { unstable_cache } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { emptyMonthly, type UnitMonthly } from "@/lib/mock-monthly"
import { getRealMonthlyForUnits } from "@/lib/data/lancamentos"
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
  platforms: PlatformId[]
  /** Por plataforma, o ID da loja no sistema externo (ex.: iFood 260777). */
  externalStoreIds: Partial<Record<PlatformId, string | null>>
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

function attach(
  u: DbUnit,
  platforms: PlatformId[],
  externalStoreIds: Partial<Record<PlatformId, string | null>>,
  monthly: UnitMonthly,
): Unit {
  return { ...u, platforms, externalStoreIds, monthly }
}

function currentYearMonth(): { year: number; month: number } {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

/**
 * Lista de unidades + agregado mensal. É chamada em quase toda tela, então
 * cacheamos (TTL 60s + tags). Invalida na hora via revalidateTag("units")
 * (CRUD de unidade) e revalidateTag("reports") (import / custos). No pior
 * caso de cache não invalidado, o dado fica no máx. 60s velho.
 */
async function getUnitsUncached(): Promise<Unit[]> {
  const supabase = createAdminClient()
  const [unitsRes, platformsRes] = await Promise.all([
    supabase
      .from("units")
      .select("id, code, name, city, state, cnpj, active, brand_id")
      .order("code"),
    supabase
      .from("unit_platforms")
      .select("unit_id, platform, external_store_id")
      .eq("active", true),
  ])
  if (unitsRes.error)
    throw new Error(`Falha ao buscar unidades: ${unitsRes.error.message}`)
  const platformsByUnit = new Map<string, PlatformId[]>()
  const externalIdsByUnit = new Map<
    string,
    Partial<Record<PlatformId, string | null>>
  >()
  for (const row of platformsRes.data ?? []) {
    const platform = row.platform as PlatformId
    const arr = platformsByUnit.get(row.unit_id) ?? []
    arr.push(platform)
    platformsByUnit.set(row.unit_id, arr)
    const ids = externalIdsByUnit.get(row.unit_id) ?? {}
    ids[platform] = row.external_store_id ?? null
    externalIdsByUnit.set(row.unit_id, ids)
  }
  const units = unitsRes.data ?? []
  const unitIds = units.map((u) => u.id)
  const { year, month } = currentYearMonth()
  const monthlyByUnit = await getRealMonthlyForUnits(unitIds, year, month)

  return units.map((u) =>
    attach(
      u,
      platformsByUnit.get(u.id) ?? [],
      externalIdsByUnit.get(u.id) ?? {},
      monthlyByUnit.get(u.id) ?? emptyMonthly,
    ),
  )
}

export const getUnits = unstable_cache(getUnitsUncached, ["units-monthly-v2"], {
  revalidate: 60,
  tags: ["units", "reports"],
})

export async function getUnitByCode(code: string): Promise<Unit | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("units")
    .select("id, code, name, city, state, cnpj, active, brand_id")
    .eq("code", code)
    .maybeSingle()
  if (error) throw new Error(`Falha ao buscar unidade ${code}: ${error.message}`)
  if (!data) return null
  const platformsDetails = await getUnitPlatformDetails(data.id)
  const platforms = platformsDetails.map((p) => p.platform)
  const externalStoreIds: Partial<Record<PlatformId, string | null>> = {}
  for (const p of platformsDetails) {
    externalStoreIds[p.platform] = p.externalStoreId
  }
  const { year, month } = currentYearMonth()
  const monthlyByUnit = await getRealMonthlyForUnits([data.id], year, month)
  return attach(
    data,
    platforms,
    externalStoreIds,
    monthlyByUnit.get(data.id) ?? emptyMonthly,
  )
}

export async function getUnitPlatformDetails(
  unitId: string,
): Promise<Array<{ platform: PlatformId; externalStoreId: string | null }>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("unit_platforms")
    .select("platform, external_store_id")
    .eq("unit_id", unitId)
    .eq("active", true)
  if (error) {
    console.error("getUnitPlatformDetails:", error.message)
    return []
  }
  return (data ?? []).map((r) => ({
    platform: r.platform as PlatformId,
    externalStoreId: r.external_store_id ?? null,
  }))
}

export async function getUnitPlatforms(
  unitId: string,
): Promise<PlatformId[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from("unit_platforms")
    .select("platform")
    .eq("unit_id", unitId)
    .eq("active", true)
  if (error) {
    console.error("getUnitPlatforms:", error.message)
    return []
  }
  return (data ?? []).map((r) => r.platform as PlatformId)
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
