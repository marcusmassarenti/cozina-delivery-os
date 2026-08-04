/**
 * Agregador de avaliações das QUATRO plataformas, por unidade.
 *
 * Usado pelo dashboard da tela /avaliacoes (visão de rede, quando nenhuma
 * unidade está selecionada). As funções por-plataforma já existem em
 * ifood/ninefood/keeta-imported.ts; aqui juntamos as fontes num breakdown
 * por unidade pra montar o ranking clicável.
 */

import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { fetchAllRows } from "@/lib/data/paginate"
import { installIdsDeProducao } from "@/lib/data/cardapioweb-imported"

type Dist = Record<1 | 2 | 3 | 4 | 5, number>

function emptyDist(): Dist {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
}

export type UnitAvaliacaoRow = {
  unitId: string
  unitCode: string
  unitName: string
  /** Total combinado das quatro plataformas */
  total: number
  /** Nota média combinada (ponderada pela contagem) */
  notaMedia: number
  /** Distribuição combinada 1-5 */
  dist: Dist
  totalIfood: number
  total99: number
  totalKeeta: number
  totalCw: number
  notaMediaIfood: number | null
  notaMedia99: number | null
  notaMediaKeeta: number | null
  notaMediaCw: number | null
}

/**
 * Retorna avaliações por unidade no mês, combinando as quatro plataformas.
 * Já vem ordenado por total DESC (loja com mais avaliações primeiro).
 *
 * O Cardápio Web entrou depois. Enquanto ficou de fora, a nota da rede era
 * calculada só sobre marketplace — e loja que só vende no canal próprio
 * sumia do ranking mesmo tendo avaliação de verdade. O comentário antigo
 * ("Cardápio Web não expõe avaliações pela API") deixou de valer quando a
 * integração de avaliações foi construída.
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

  // Só instalações de produção contam: sandbox tem avaliação fictícia.
  const cwInstalls = await installIdsDeProducao()

  const [ifoodRows, ninefoodRows, keetaRows, cwRows] = await Promise.all([
    fetchAllRows<{ unit_id: string; nota: number | string | null }>(
      (from, to) => {
        let qIfood = admin
          .from("ifood_avaliacoes")
          .select("unit_id, nota")
          .gte("data_avaliacao", startIso)
          .lte("data_avaliacao", endIncl)
          .order("id")
          .range(from, to)
        if (filterUnitIds)
          qIfood = qIfood.in("unit_id", filterUnitIds)
        return qIfood
      },
      "ifood_avaliacoes por unidade",
    ),
    fetchAllRows<{ unit_id: string; nivel_avaliacao: number | string | null }>(
      (from, to) => {
        let q99 = admin
          .from("ninefood_pedidos")
          .select("unit_id, nivel_avaliacao")
          .not("nivel_avaliacao", "is", null)
          .gte("data_avaliacao", startIso)
          .lt("data_avaliacao", endExcl)
          .order("id")
          .range(from, to)
        if (filterUnitIds)
          q99 = q99.in("unit_id", filterUnitIds)
        return q99
      },
      "ninefood_pedidos avaliacoes por unidade",
    ),
    // Keeta: avaliação em keeta_pedidos (pontuacao_avaliacao + data_avaliacao DATE)
    fetchAllRows<{
      unit_id: string
      pontuacao_avaliacao: number | string | null
    }>(
      (from, to) => {
        let qKeeta = admin
          .from("keeta_pedidos")
          .select("unit_id, pontuacao_avaliacao")
          .not("pontuacao_avaliacao", "is", null)
          .gte("data_avaliacao", startIso)
          .lte("data_avaliacao", endIncl)
          .order("id")
          .range(from, to)
        if (filterUnitIds)
          qKeeta = qKeeta.in("unit_id", filterUnitIds)
        return qKeeta
      },
      "keeta_pedidos avaliacoes por unidade",
    ),
    cwInstalls.length === 0
      ? Promise.resolve([] as { unit_id: string | null; nota: number | null }[])
      : fetchAllRows<{ unit_id: string | null; nota: number | null }>(
          (from, to) => {
            let qCw = admin
              .from("cardapioweb_avaliacoes")
              .select("unit_id, nota")
              .not("nota", "is", null)
              .not("unit_id", "is", null)
              .in("install_id", cwInstalls)
              .gte("criado_em", `${startIso}T00:00:00-03:00`)
              .lt("criado_em", `${endExcl}T00:00:00-03:00`)
              .order("id")
              .range(from, to)
            if (filterUnitIds) qCw = qCw.in("unit_id", filterUnitIds)
            return qCw
          },
          "cardapioweb_avaliacoes por unidade",
        ),
  ])

  type Agg = {
    distIfood: Dist
    dist99: Dist
    distKeeta: Dist
    distCw: Dist
    somaIfood: number
    soma99: number
    somaKeeta: number
    somaCw: number
    totalIfood: number
    total99: number
    totalKeeta: number
    totalCw: number
  }
  const byUnit = new Map<string, Agg>()
  const ensure = (id: string): Agg => {
    let a = byUnit.get(id)
    if (!a) {
      a = {
        distIfood: emptyDist(),
        dist99: emptyDist(),
        distKeeta: emptyDist(),
        distCw: emptyDist(),
        somaIfood: 0,
        soma99: 0,
        somaKeeta: 0,
        somaCw: 0,
        totalIfood: 0,
        total99: 0,
        totalKeeta: 0,
        totalCw: 0,
      }
      byUnit.set(id, a)
    }
    return a
  }

  for (const r of ifoodRows) {
    const n = Number(r.nota) as 1 | 2 | 3 | 4 | 5
    if (n < 1 || n > 5) continue
    const a = ensure(r.unit_id)
    a.distIfood[n] += 1
    a.somaIfood += n
    a.totalIfood += 1
  }
  for (const r of ninefoodRows) {
    const n = Number(r.nivel_avaliacao) as 1 | 2 | 3 | 4 | 5
    if (n < 1 || n > 5) continue
    const a = ensure(r.unit_id)
    a.dist99[n] += 1
    a.soma99 += n
    a.total99 += 1
  }
  for (const r of keetaRows) {
    const n = Number(r.pontuacao_avaliacao) as 1 | 2 | 3 | 4 | 5
    if (n < 1 || n > 5) continue
    const a = ensure(r.unit_id)
    a.distKeeta[n] += 1
    a.somaKeeta += n
    a.totalKeeta += 1
  }

  for (const r of cwRows) {
    if (!r.unit_id) continue
    const n = Number(r.nota) as 1 | 2 | 3 | 4 | 5
    if (n < 1 || n > 5) continue
    const a = ensure(r.unit_id)
    a.distCw[n] += 1
    a.somaCw += n
    a.totalCw += 1
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
      1: a.distIfood[1] + a.dist99[1] + a.distKeeta[1] + a.distCw[1],
      2: a.distIfood[2] + a.dist99[2] + a.distKeeta[2] + a.distCw[2],
      3: a.distIfood[3] + a.dist99[3] + a.distKeeta[3] + a.distCw[3],
      4: a.distIfood[4] + a.dist99[4] + a.distKeeta[4] + a.distCw[4],
      5: a.distIfood[5] + a.dist99[5] + a.distKeeta[5] + a.distCw[5],
    }
    const total = a.totalIfood + a.total99 + a.totalKeeta + a.totalCw
    const soma = a.somaIfood + a.soma99 + a.somaKeeta + a.somaCw
    return {
      unitId: id,
      unitCode: nameMap.get(id)?.code ?? "?",
      unitName: nameMap.get(id)?.name ?? "(unidade)",
      total,
      notaMedia: total > 0 ? Math.round((soma / total) * 100) / 100 : 0,
      dist,
      totalIfood: a.totalIfood,
      total99: a.total99,
      totalKeeta: a.totalKeeta,
      totalCw: a.totalCw,
      notaMediaIfood:
        a.totalIfood > 0
          ? Math.round((a.somaIfood / a.totalIfood) * 100) / 100
          : null,
      notaMedia99:
        a.total99 > 0
          ? Math.round((a.soma99 / a.total99) * 100) / 100
          : null,
      notaMediaKeeta:
        a.totalKeeta > 0
          ? Math.round((a.somaKeeta / a.totalKeeta) * 100) / 100
          : null,
      notaMediaCw:
        a.totalCw > 0 ? Math.round((a.somaCw / a.totalCw) * 100) / 100 : null,
    }
  })

  return rows.sort((a, b) => b.total - a.total)
}
