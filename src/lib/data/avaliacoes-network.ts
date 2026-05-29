/**
 * Agregador de avaliações combinando iFood + 99 Food, por unidade.
 *
 * Usado pelo dashboard da tela /avaliacoes (visão de rede, quando nenhuma
 * unidade está selecionada). As funções por-plataforma já existem em
 * ifood-imported.ts e ninefood-imported.ts; aqui juntamos as duas fontes
 * num breakdown por unidade pra montar o ranking clicável.
 */

import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

type Dist = Record<1 | 2 | 3 | 4 | 5, number>

function emptyDist(): Dist {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
}

export type UnitAvaliacaoRow = {
  unitId: string
  unitCode: string
  unitName: string
  /** Total combinado (iFood + 99) */
  total: number
  /** Nota média combinada (ponderada pela contagem) */
  notaMedia: number
  /** Distribuição combinada 1-5 */
  dist: Dist
  totalIfood: number
  total99: number
  notaMediaIfood: number | null
  notaMedia99: number | null
}

/**
 * Retorna avaliações por unidade no mês, combinando as 2 plataformas.
 * Já vem ordenado por total DESC (loja com mais avaliações primeiro).
 */
export async function getAvaliacoesByUnitForMonth(
  year: number,
  month: number,
  filterUnitIds?: string[],
): Promise<UnitAvaliacaoRow[]> {
  const admin = createAdminClient()

  // Range mês (iFood usa data_avaliacao DATE; 99 usa data_avaliacao TIMESTAMP)
  const monthStr = String(month).padStart(2, "0")
  const startIso = `${year}-${monthStr}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const endExcl = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`
  // iFood usa .lte com último dia do mês
  const lastDay = new Date(year, month, 0).getDate()
  const endIncl = `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`

  let qIfood = admin
    .from("ifood_avaliacoes")
    .select("unit_id, nota")
    .gte("data_avaliacao", startIso)
    .lte("data_avaliacao", endIncl)
    .limit(50000)
  if (filterUnitIds && filterUnitIds.length > 0)
    qIfood = qIfood.in("unit_id", filterUnitIds)

  let q99 = admin
    .from("ninefood_pedidos")
    .select("unit_id, nivel_avaliacao")
    .not("nivel_avaliacao", "is", null)
    .gte("data_avaliacao", startIso)
    .lt("data_avaliacao", endExcl)
    .limit(50000)
  if (filterUnitIds && filterUnitIds.length > 0)
    q99 = q99.in("unit_id", filterUnitIds)

  const [ifoodRes, ninefoodRes] = await Promise.all([qIfood, q99])

  type Agg = {
    distIfood: Dist
    dist99: Dist
    somaIfood: number
    soma99: number
    totalIfood: number
    total99: number
  }
  const byUnit = new Map<string, Agg>()
  const ensure = (id: string): Agg => {
    let a = byUnit.get(id)
    if (!a) {
      a = {
        distIfood: emptyDist(),
        dist99: emptyDist(),
        somaIfood: 0,
        soma99: 0,
        totalIfood: 0,
        total99: 0,
      }
      byUnit.set(id, a)
    }
    return a
  }

  for (const r of ifoodRes.data ?? []) {
    const n = Number(r.nota) as 1 | 2 | 3 | 4 | 5
    if (n < 1 || n > 5) continue
    const a = ensure(r.unit_id)
    a.distIfood[n] += 1
    a.somaIfood += n
    a.totalIfood += 1
  }
  for (const r of ninefoodRes.data ?? []) {
    const n = Number(r.nivel_avaliacao) as 1 | 2 | 3 | 4 | 5
    if (n < 1 || n > 5) continue
    const a = ensure(r.unit_id)
    a.dist99[n] += 1
    a.soma99 += n
    a.total99 += 1
  }

  const unitIds = Array.from(byUnit.keys())
  if (unitIds.length === 0) return []

  const { data: units } = await admin
    .from("units")
    .select("id, code, name")
    .in("id", unitIds)
  const nameMap = new Map(
    (units ?? []).map((u) => [u.id, { code: u.code, name: u.name }]),
  )

  const rows: UnitAvaliacaoRow[] = unitIds.map((id) => {
    const a = byUnit.get(id)!
    const dist: Dist = {
      1: a.distIfood[1] + a.dist99[1],
      2: a.distIfood[2] + a.dist99[2],
      3: a.distIfood[3] + a.dist99[3],
      4: a.distIfood[4] + a.dist99[4],
      5: a.distIfood[5] + a.dist99[5],
    }
    const total = a.totalIfood + a.total99
    const soma = a.somaIfood + a.soma99
    return {
      unitId: id,
      unitCode: nameMap.get(id)?.code ?? "?",
      unitName: nameMap.get(id)?.name ?? "(unidade)",
      total,
      notaMedia: total > 0 ? Math.round((soma / total) * 100) / 100 : 0,
      dist,
      totalIfood: a.totalIfood,
      total99: a.total99,
      notaMediaIfood:
        a.totalIfood > 0
          ? Math.round((a.somaIfood / a.totalIfood) * 100) / 100
          : null,
      notaMedia99:
        a.total99 > 0
          ? Math.round((a.soma99 / a.total99) * 100) / 100
          : null,
    }
  })

  return rows.sort((a, b) => b.total - a.total)
}
