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

/**
 * ⚠️ Os dois escopos são diferentes DE PROPÓSITO.
 *
 * 99 Food e Keeta guardam a data do pedido mas não o valor — entram na
 * contagem e ficam de fora do faturamento. Dizer "soma as 4" no valor seria
 * mentira; deixá-las de fora da contagem seria jogar dado no lixo.
 */
export type PlatformId = "ifood" | "cardapioweb" | "99food" | "keeta"

const ROTULO: Record<PlatformId, string> = {
  ifood: "iFood",
  cardapioweb: "Cardápio Web",
  "99food": "99 Food",
  keeta: "Keeta",
}
/** Só estas guardam o preço do pedido. */
const TEM_VALOR: PlatformId[] = ["ifood", "cardapioweb"]

function rotulos(
  plataformas: PlatformId[] | null | undefined,
  apenasComValor: boolean,
): string[] {
  const base = plataformas?.length
    ? plataformas
    : (Object.keys(ROTULO) as PlatformId[])
  return base
    .filter((p) => !apenasComValor || TEM_VALOR.includes(p))
    .map((p) => ROTULO[p])
}

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
  totalPedidos: number
  /**
   * Em que métrica melhor/pior foram calculados. Vira `pedidos` quando o
   * filtro deixa só plataforma sem preço — sem isso a tela ficava vazia com
   * dado na mão.
   */
  base: "valor" | "pedidos"
  /** Plataformas que entram no VALOR — só as que guardam preço por pedido. */
  plataformasValor: string[]
  /** Plataformas que entram na contagem de PEDIDOS — todas. */
  plataformasPedidos: string[]
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
  /**
   * Em que métrica melhor/pior foram calculados. `pedidos` quando a loja só
   * tem plataforma que não guarda valor — sem isso ela sumiria do relatório.
   */
  base: "valor" | "pedidos"
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
  /** null = todas. */
  plataformas?: PlatformId[] | null,
): Promise<Map<string, DiaSemanaLoja>> {
  const out = new Map<string, DiaSemanaLoja>()
  if (!unitIds.length) return out

  const { data, error } = await createAdminClient().rpc(
    "vendas_dia_semana_por_loja",
    {
      p_unit_ids: unitIds,
      p_start: inicio,
      p_end: fim,
      p_plataformas: plataformas?.length ? plataformas : null,
    },
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

    // Loja que só vende no 99 ou na Keeta tem valor ZERO — ranquear por valor
    // faria ela sumir do relatório inteiro. Nesses casos a régua é pedido, que
    // é o que existe. `base` diz qual foi, pra tela não misturar.
    const totalValorLoja = dias.reduce((s, d) => s + d.valor, 0)
    const base: "valor" | "pedidos" = totalValorLoja > 0 ? "valor" : "pedidos"
    const ordenado = [...opera].sort((a, b) =>
      base === "valor" ? b.valor - a.valor : b.pedidos - a.pedidos,
    )
    const melhor = ordenado[0]!
    const pior = ordenado[ordenado.length - 1]!

    // "Fora do padrão" pela PARTICIPAÇÃO do dia, não por qual é o pior.
    //
    // Antes era `pior.dow !== piorDaRede`, e isso marcava quase todo mundo —
    // 11 de 12 lojas na primeira rodada. Óbvio em retrospecto: cada loja tem
    // seu pior dia, e coincidir com o da rede é exceção, não regra.
    //
    // O que importa é a loja vender proporcionalmente MENOS naquele dia do que
    // a rede vende. Aí sim é buraco dela, não do mercado.
    const totalValor = totalValorLoja
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
      base,
      amplitudePct:
        base === "valor"
          ? pior.valor > 0
            ? ((melhor.valor - pior.valor) / pior.valor) * 100
            : 0
          : pior.pedidos > 0
            ? ((melhor.pedidos - pior.pedidos) / pior.pedidos) * 100
            : 0,
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
  /** null = todas. */
  plataformas?: PlatformId[] | null,
): Promise<VendasPorDiaSemana> {
  const vazio: VendasPorDiaSemana = {
    dias: [],
    melhor: null,
    pior: null,
    total: 0,
    totalPedidos: 0,
    base: "valor",
    plataformasValor: rotulos(plataformas, true),
    plataformasPedidos: rotulos(plataformas, false),
  }
  if (!unitIds.length) return vazio

  const { data, error } = await createAdminClient().rpc(
    "vendas_por_dia_semana",
    {
      p_unit_ids: unitIds,
      p_start: inicio,
      p_end: fim,
      p_plataformas: plataformas?.length ? plataformas : null,
    },
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

  // Filtrando só 99 Food ou Keeta, TODO valor é zero — elas não guardam preço.
  // Ranquear por valor deixaria a tela vazia com 15 mil pedidos na mão.
  const totalValor = dias.reduce((s, d) => s + d.valor, 0)
  const base: "valor" | "pedidos" = totalValor > 0 ? "valor" : "pedidos"
  const metrica = (d: DiaSemana) => (base === "valor" ? d.valor : d.pedidos)

  // Dia sem venda nenhuma fica FORA do melhor/pior: numa loja que não abre
  // segunda, "o pior dia é segunda com R$ 0" é obvio e inútil.
  const comVenda = dias.filter((d) => metrica(d) > 0)
  const porValor = [...comVenda].sort((a, b) => metrica(b) - metrica(a))

  return {
    dias,
    melhor: porValor[0] ?? null,
    pior: porValor[porValor.length - 1] ?? null,
    total: totalValor,
    totalPedidos: dias.reduce((s, d) => s + d.pedidos, 0),
    base,
    plataformasValor: rotulos(plataformas, true),
    plataformasPedidos: rotulos(plataformas, false),
  }
}
