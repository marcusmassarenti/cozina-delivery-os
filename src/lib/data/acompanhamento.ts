/**
 * Acompanhamento de vendas (formato "INFOS DIÁRIA VENDA"): por loja × plataforma,
 * com a venda de um intervalo de dias (diária), o total do mês, a meta e a falta,
 * agrupado por marca (CNP / CNPão / Churras Popular) com totais por marca e grupo.
 */
import "server-only"

import type { PlatformId } from "@/components/platform-logo"
import { createAdminClient } from "@/lib/supabase/admin"
import { getUnits } from "@/lib/data/units"
import { getDailyReportMatrix } from "@/lib/data/relatorio-diario"

const PLATS: PlatformId[] = ["ifood", "99food", "keeta"]

export type AcompPlatform = {
  platform: PlatformId
  diaria: number
  total: number
}
export type AcompUnit = {
  unitId: string
  code: string
  name: string
  platforms: AcompPlatform[]
  diaria: number
  total: number
  meta: number
  falta: number
}
export type AcompBrand = {
  brandId: string
  brandName: string
  units: AcompUnit[]
  diaria: number
  total: number
  meta: number
  falta: number
}
export type Acompanhamento = {
  brands: AcompBrand[]
  grupoDiaria: number
  grupoTotal: number
  grupoMeta: number
  grupoFalta: number
  diasNoMes: number
}

export async function getAcompanhamentoVendas(
  year: number,
  month: number,
  fromDay: number,
  toDay: number,
): Promise<Acompanhamento> {
  const admin = createAdminClient()
  const diasNoMes = new Date(year, month, 0).getDate()
  const from = Math.max(1, Math.min(fromDay, diasNoMes))
  const to = Math.max(from, Math.min(toDay, diasNoMes))

  const allUnits = (await getUnits()).filter((u) => u.active)
  const unitsLite = allUnits.map((u) => ({
    id: u.id,
    code: u.code,
    name: u.name,
  }))

  // Matriz diária (faturamento por dia) por plataforma.
  const matrices = await Promise.all(
    PLATS.map((p) => getDailyReportMatrix(year, month, p, unitsLite)),
  )
  const byPlat = PLATS.map((plat, i) => ({
    plat,
    map: new Map(matrices[i].units.map((u) => [u.unitId, u])),
  }))

  // Nomes das marcas.
  const { data: brandsData } = await admin.from("brands").select("id, name")
  const brandName = new Map(
    (brandsData ?? []).map((b) => [b.id as string, b.name as string]),
  )

  // Meta por loja no mês (resiliente: se a coluna ainda não existir, fica 0).
  const metaByUnit = new Map<string, number>()
  const { data: metaRows, error: metaErr } = await admin
    .from("monthly_entries")
    .select("unit_id, meta_faturamento")
    .eq("year", year)
    .eq("month", month)
  if (!metaErr && metaRows) {
    for (const r of metaRows) {
      metaByUnit.set(
        r.unit_id as string,
        Number((r as { meta_faturamento?: number }).meta_faturamento) || 0,
      )
    }
  }

  const sumRange = (
    row: { faturamento: Record<number, number> } | undefined,
  ): number => {
    if (!row) return 0
    let s = 0
    for (let d = from; d <= to; d++) s += row.faturamento[d] ?? 0
    return s
  }

  // Constrói por loja.
  const unitsBuilt = allUnits.map((u) => {
    const platforms: AcompPlatform[] = []
    let diaria = 0
    let total = 0
    for (const { plat, map } of byPlat) {
      // só plataformas que a loja tem vinculada (evita 3 linhas zeradas em loja
      // que só opera numa).
      if (!u.platforms.includes(plat)) continue
      const row = map.get(u.id)
      const d = sumRange(row)
      const t = row ? row.totalFaturamento : 0
      platforms.push({ platform: plat, diaria: d, total: t })
      diaria += d
      total += t
    }
    const meta = metaByUnit.get(u.id) ?? 0
    return {
      brandId: u.brand_id,
      unit: {
        unitId: u.id,
        code: u.code,
        name: u.name,
        platforms,
        diaria,
        total,
        meta,
        falta: meta - total,
      } as AcompUnit,
    }
  })

  // Agrupa por marca.
  const brandMap = new Map<string, AcompUnit[]>()
  for (const { brandId, unit } of unitsBuilt) {
    const arr = brandMap.get(brandId) ?? []
    arr.push(unit)
    brandMap.set(brandId, arr)
  }

  const brands: AcompBrand[] = [...brandMap.entries()].map(([brandId, units]) => {
    units.sort((a, b) => b.total - a.total)
    const diaria = units.reduce((s, u) => s + u.diaria, 0)
    const total = units.reduce((s, u) => s + u.total, 0)
    const meta = units.reduce((s, u) => s + u.meta, 0)
    return {
      brandId,
      brandName: brandName.get(brandId) ?? "Marca",
      units,
      diaria,
      total,
      meta,
      falta: meta - total,
    }
  })
  // Ordem fixa das marcas, como na planilha (Pote → Pão → Popular); demais por total.
  const BRAND_ORDER = ["Churrasco no Pote", "Churrasco no Pão", "Churras Popular"]
  const brandRank = (name: string) => {
    const i = BRAND_ORDER.indexOf(name)
    return i === -1 ? 99 : i
  }
  brands.sort(
    (a, b) => brandRank(a.brandName) - brandRank(b.brandName) || b.total - a.total,
  )

  const grupoDiaria = brands.reduce((s, b) => s + b.diaria, 0)
  const grupoTotal = brands.reduce((s, b) => s + b.total, 0)
  const grupoMeta = brands.reduce((s, b) => s + b.meta, 0)

  return {
    brands,
    grupoDiaria,
    grupoTotal,
    grupoMeta,
    grupoFalta: grupoMeta - grupoTotal,
    diasNoMes,
  }
}
