import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Faturamento e pedidos por dia da semana.
 *
 * O sistema só tinha série mensal — dentro do mês, o dia da semana some. E é
 * ele que decide escala de equipe e onde colocar promoção: em julho/26 a rede
 * fez R$ 298 mil numa sexta contra R$ 197 mil numa terça, 34% de diferença.
 *
 * ⚠️ Cobre iFood e Cardápio Web. `ninefood_pedidos` e `keeta_pedidos` guardam
 * a data mas NÃO o valor do pedido — somar faturamento delas exigiria
 * inventar. Quem chama recebe `plataformas` pra dizer isso na tela.
 */

export type DiaSemana = {
  /** 0 = domingo (padrão do Postgres). */
  dow: number
  rotulo: string
  rotuloCurto: string
  pedidos: number
  valor: number
}

export type VendasPorDiaSemana = {
  dias: DiaSemana[]
  melhor: DiaSemana | null
  pior: DiaSemana | null
  total: number
  plataformas: string[]
}

const NOMES = [
  ["Domingo", "Dom"],
  ["Segunda-feira", "Seg"],
  ["Terça-feira", "Ter"],
  ["Quarta-feira", "Qua"],
  ["Quinta-feira", "Qui"],
  ["Sexta-feira", "Sex"],
  ["Sábado", "Sáb"],
] as const

export type DiaSemanaLoja = {
  unitId: string
  dias: DiaSemana[]
  melhor: DiaSemana | null
  pior: DiaSemana | null
  total: number
  /**
   * Diferença entre o melhor e o pior dia, em % do pior. Alta demais indica
   * dia problemático; baixa indica semana equilibrada.
   */
  amplitudePct: number
  /** Total de pedidos das QUATRO plataformas. */
  totalPedidos: number
  /** Dias em que a loja praticamente não opera — ver o corte de 15%. */
  naoOpera: DiaSemana[]
  /**
   * true quando a loja vende proporcionalmente MENOS num dia do que a rede
   * vende nele. É o sinal que o relatório existe pra dar: quando todo mundo
   * cai é mercado; quando só ela cai, é operação dela.
   */
  foraDoPadrao: boolean
  /** O dia em que ela mais fica atrás da rede. */
  diaFraco: DiaSemana | null
  /** Quantos pontos percentuais abaixo da rede, nesse dia. */
  desvioPp: number
}

/** Ordena a semana começando na segunda — ver `getVendasPorDiaSemana`. */
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0]

function montarDias(
  porDow: Map<number, { pedidos: number; valor: number }>,
): DiaSemana[] {
  return ORDEM_SEMANA.map((dow) => ({
    dow,
    rotulo: NOMES[dow]![0],
    rotuloCurto: NOMES[dow]![1],
    pedidos: porDow.get(dow)?.pedidos ?? 0,
    valor: porDow.get(dow)?.valor ?? 0,
  }))
}

/** Loja a loja, pro relatório da rede. */
export async function getVendasPorDiaSemanaPorLoja(
  unitIds: string[],
  inicio: string,
  fim: string,
  /** Participação de cada dia no faturamento da REDE (dow → %). */
  shareRede: Map<number, number> | null,
): Promise<Map<string, DiaSemanaLoja>> {
  const out = new Map<string, DiaSemanaLoja>()
  if (!unitIds.length) return out

  const { data, error } = await createAdminClient().rpc(
    "vendas_dia_semana_por_loja",
    { p_unit_ids: unitIds, p_start: inicio, p_end: fim },
  )
  if (error) {
    console.error("getVendasPorDiaSemanaPorLoja:", error.message)
    return out
  }

  const porLoja = new Map<string, Map<number, { pedidos: number; valor: number }>>()
  for (const r of (data ?? []) as Array<{
    unit_id: string
    dia_semana: number
    pedidos: number | string
    valor: number | string
  }>) {
    if (!porLoja.has(r.unit_id)) porLoja.set(r.unit_id, new Map())
    porLoja.get(r.unit_id)!.set(r.dia_semana, {
      pedidos: Number(r.pedidos),
      valor: Number(r.valor),
    })
  }

  for (const [unitId, mapa] of porLoja) {
    const dias = montarDias(mapa)
    const total = dias.reduce((s, d) => s + d.pedidos, 0)
    if (total === 0) continue

    // ⚠️ DIA QUE A LOJA NÃO ABRE não é "dia fraco".
    //
    // Sem isto a Hortolândia aparecia com "pior dia: segunda, R$ 66,90" e
    // 5077% de diferença — medido: 1 pedido em ~13 segundas dos 90 dias. Ela
    // não abre segunda. O número estava certo e a leitura, errada: dividir por
    // quase zero produz um destaque gigante pra algo que não é problema.
    //
    // O corte é 15% da média diária da própria loja. Relativo, porque loja de
    // 50 e de 5.000 pedidos precisam do mesmo julgamento.
    const mediaDia = total / 7
    const opera = dias.filter((d) => d.pedidos >= mediaDia * 0.15)
    const naoOpera = dias.filter((d) => d.pedidos < mediaDia * 0.15)

    // Menos de 3 dias de operação real não dá pra falar em padrão de semana.
    if (opera.length < 3) continue

    const porValor = [...opera].sort((a, b) => b.valor - a.valor)
    const melhor = porValor[0]!
    const pior = porValor[porValor.length - 1]!

    // "Fora do padrão" pela PARTICIPAÇÃO do dia, não por qual é o pior.
    //
    // Antes era `pior.dow !== piorDaRede`, e isso marcava quase todo mundo —
    // 11 de 12 lojas na primeira rodada. Óbvio em retrospecto: cada loja tem
    // seu pior dia, e coincidir com o da rede é exceção, não regra.
    //
    // O que importa é a loja vender proporcionalmente MENOS naquele dia do que
    // a rede vende. Aí sim é buraco dela, não do mercado.
    const totalValor = dias.reduce((s, d) => s + d.valor, 0)
    let maiorDesvio = 0
    let diaDesvio: DiaSemana | null = null
    if (totalValor > 0 && shareRede) {
      for (const d of opera) {
        const shareLoja = (d.valor / totalValor) * 100
        const desvio = (shareRede.get(d.dow) ?? 0) - shareLoja
        if (desvio > maiorDesvio) {
          maiorDesvio = desvio
          diaDesvio = d
        }
      }
    }

    out.set(unitId, {
      unitId,
      dias,
      melhor,
      pior,
      naoOpera,
      total: totalValor,
      totalPedidos: total,
      amplitudePct:
        pior.valor > 0 ? ((melhor.valor - pior.valor) / pior.valor) * 100 : 0,
      // 10 pontos percentuais. Um dia vale ~14% da semana, então 10pp é
      // perder QUASE O DIA INTEIRO em relação à rede.
      //
      // Comecei em 6pp e medi: marcava 21 de 66 lojas — um terço da base não é
      // exceção, é lista. A 10pp sobram 3, que é o tamanho de coisa que
      // alguém consegue investigar na segunda-feira.
      foraDoPadrao: maiorDesvio >= 10,
      diaFraco: diaDesvio,
      desvioPp: maiorDesvio,
    })
  }
  return out
}

export async function getVendasPorDiaSemana(
  unitIds: string[],
  inicio: string,
  fim: string,
): Promise<VendasPorDiaSemana> {
  const vazio: VendasPorDiaSemana = {
    dias: [],
    melhor: null,
    pior: null,
    total: 0,
    plataformas: ["iFood", "Cardápio Web"],
  }
  if (!unitIds.length) return vazio

  const { data, error } = await createAdminClient().rpc(
    "vendas_por_dia_semana",
    { p_unit_ids: unitIds, p_start: inicio, p_end: fim },
  )
  if (error) {
    console.error("getVendasPorDiaSemana:", error.message)
    return vazio
  }

  const porDow = new Map<number, { pedidos: number; valor: number }>()
  for (const r of (data ?? []) as Array<{
    dia_semana: number
    pedidos: number | string
    valor: number | string
  }>) {
    porDow.set(r.dia_semana, {
      pedidos: Number(r.pedidos),
      valor: Number(r.valor),
    })
  }

  // Semana começando na SEGUNDA: é como a operação lê a escala. O Postgres
  // devolve 0=domingo, e mostrar domingo primeiro faz o fim de semana parecer
  // duas pontas soltas do gráfico.
  const ordem = [1, 2, 3, 4, 5, 6, 0]
  const dias: DiaSemana[] = ordem.map((dow) => ({
    dow,
    rotulo: NOMES[dow]![0],
    rotuloCurto: NOMES[dow]![1],
    pedidos: porDow.get(dow)?.pedidos ?? 0,
    valor: porDow.get(dow)?.valor ?? 0,
  }))

  // Dia sem venda nenhuma fica FORA do melhor/pior: numa loja que não abre
  // segunda, "o pior dia é segunda com R$ 0" é obvio e inútil.
  const comVenda = dias.filter((d) => d.valor > 0)
  const porValor = [...comVenda].sort((a, b) => b.valor - a.valor)

  return {
    dias,
    melhor: porValor[0] ?? null,
    pior: porValor[porValor.length - 1] ?? null,
    total: dias.reduce((s, d) => s + d.valor, 0),
    plataformas: ["iFood", "Cardápio Web"],
  }
}
