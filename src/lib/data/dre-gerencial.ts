import "server-only"

import {
  getCaixaHoldingId,
  getCategoriesFlat,
  getEntries,
  type DreGroup,
  type Loja,
} from "@/lib/data/caixa"

/**
 * DRE Gerencial (regime de competência, a partir dos lançamentos do Caixa).
 * Usa a classificação de DRE das categorias (dre_group + natureza) pra montar
 * a cascata Receita → Deduções → Margem de Contribuição → Resultado, com os
 * indicadores que o dono de restaurante decide em cima (CMV%, mão de obra%,
 * margem de contribuição%, ponto de equilíbrio).
 *
 * Regras: ignora pagamento de fatura de cartão (é caixa, não custo) e
 * transferências. A COMPRA no cartão continua contando como custo.
 */

export type DreLinha = { label: string; total: number; categorias: { name: string; total: number }[] }

export type DreGerencial = {
  receitaBruta: number
  deducoes: number
  receitaLiquida: number
  cmv: number
  custosVariaveis: number
  margemContribuicao: number
  cmo: number
  fixas: number
  naoClassificado: number
  resultadoOperacional: number
  investimentos: number
  resultadoFinal: number
  // indicadores (fração 0..1; null quando não dá pra calcular)
  cmvPct: number | null
  cmoPct: number | null
  fixasPct: number | null
  mcPct: number | null
  margemPct: number | null
  pontoEquilibrio: number | null
  // detalhe por grupo (pra expandir)
  detalhe: Record<DreGroup, DreLinha>
  naoClassificadoCategorias: { name: string; total: number }[]
  temClassificacao: boolean
}

export async function getDreGerencial(
  year: number,
  month: number,
  loja?: Loja,
): Promise<DreGerencial | null> {
  const holdingId = await getCaixaHoldingId()
  if (!holdingId) return null
  const [cats, entries] = await Promise.all([
    getCategoriesFlat(holdingId),
    getEntries(holdingId, { year, month, loja }),
  ])
  const catById = new Map(cats.map((c) => [c.id, c]))
  const nomeExibicao = (catId: string | null): string => {
    if (!catId) return "Sem categoria"
    const c = catById.get(catId)
    if (!c) return "Sem categoria"
    if (c.parentId) return catById.get(c.parentId)?.name ?? c.name
    return c.name
  }
  const grupoDe = (catId: string | null): DreGroup | null => {
    if (!catId) return null
    const c = catById.get(catId)
    if (!c) return null
    if (c.dreGroup) return c.dreGroup
    if (c.parentId) return catById.get(c.parentId)?.dreGroup ?? null
    return null
  }

  const soma: Record<DreGroup, number> = {
    receita: 0, deducao: 0, cmv: 0, cmo: 0, fixa: 0, variavel: 0, investimento: 0,
  }
  const detalhe: Record<DreGroup, Map<string, number>> = {
    receita: new Map(), deducao: new Map(), cmv: new Map(), cmo: new Map(),
    fixa: new Map(), variavel: new Map(), investimento: new Map(),
  }
  const naoClassMap = new Map<string, number>()
  let naoClassificado = 0
  let classificados = 0

  for (const e of entries) {
    if (e.isCardPayment) continue // pagamento de fatura = caixa, não custo
    if (e.kind === "transferencia") continue
    const v = e.value
    let grp = grupoDe(e.categoryId)
    // receita sem classificação ainda conta como receita
    if (!grp && e.kind === "receita") grp = "receita"
    if (!grp) {
      naoClassificado += v
      naoClassMap.set(nomeExibicao(e.categoryId), (naoClassMap.get(nomeExibicao(e.categoryId)) ?? 0) + v)
      continue
    }
    classificados++
    soma[grp] += v
    const nm = nomeExibicao(e.categoryId)
    detalhe[grp].set(nm, (detalhe[grp].get(nm) ?? 0) + v)
  }

  const receitaBruta = soma.receita
  const deducoes = soma.deducao
  const receitaLiquida = receitaBruta - deducoes
  const cmv = soma.cmv
  const custosVariaveis = cmv + soma.variavel
  const margemContribuicao = receitaLiquida - custosVariaveis
  const cmo = soma.cmo
  const fixas = soma.fixa
  const custosFixos = cmo + fixas
  const resultadoOperacional = margemContribuicao - custosFixos - naoClassificado
  const investimentos = soma.investimento
  const resultadoFinal = resultadoOperacional - investimentos

  const pct = (n: number) => (receitaLiquida > 0 ? n / receitaLiquida : null)
  const mcPct = pct(margemContribuicao)
  const pontoEquilibrio = mcPct && mcPct > 0 ? custosFixos / mcPct : null

  const toLinha = (g: DreGroup, label: string): DreLinha => ({
    label,
    total: soma[g],
    categorias: [...detalhe[g].entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total),
  })

  return {
    receitaBruta,
    deducoes,
    receitaLiquida,
    cmv,
    custosVariaveis,
    margemContribuicao,
    cmo,
    fixas,
    naoClassificado,
    resultadoOperacional,
    investimentos,
    resultadoFinal,
    cmvPct: pct(cmv),
    cmoPct: pct(cmo),
    fixasPct: pct(fixas),
    mcPct,
    margemPct: pct(resultadoOperacional),
    pontoEquilibrio,
    detalhe: {
      receita: toLinha("receita", "Receita"),
      deducao: toLinha("deducao", "Deduções"),
      cmv: toLinha("cmv", "CMV / Insumos"),
      cmo: toLinha("cmo", "Mão de obra"),
      fixa: toLinha("fixa", "Despesas fixas"),
      variavel: toLinha("variavel", "Despesas variáveis"),
      investimento: toLinha("investimento", "Investimentos"),
    },
    naoClassificadoCategorias: [...naoClassMap.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total),
    temClassificacao: classificados > 0,
  }
}
