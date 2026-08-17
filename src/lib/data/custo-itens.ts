import "server-only"

/**
 * Ficha Técnica: o custo por item vendido e a margem que sai dele.
 *
 * ── O DESENHO EM UMA FRASE ───────────────────────────────────────────────
 * Uma linha por item vendido, por loja e por plataforma. O sistema traz preço,
 * volume e taxa; a pessoa digita o custo; a margem aparece. Sem cadastro de
 * produto, sem de-para (ver migration 0212 para o porquê).
 *
 * ── A TAXA NÃO É DIGITADA: É O QUE A PLATAFORMA RETEVE ───────────────────
 * `(bruto − líquido) ÷ bruto` da própria loja, naquela plataforma, naquele
 * mês. Na JK/julho a Keeta reteve 48,9%: comissão 13,6% + entrega 11,7% +
 * promoções e outras despesas 23,6%.
 *
 * ⚠️ EU TINHA POSTO SÓ A COMISSÃO E O MARCUS DECIDIU O CONTRÁRIO (16/08/26):
 * "a % de desconto deve ser a média do custo total que as plataformas retêm".
 * E ele tem razão sobre o que o dono precisa ver — de R$ 100 vendidos na
 * Keeta, chegam R$ 51 na conta, e uma margem calculada só sobre a comissão
 * diria que sobrou muito mais do que sobrou.
 *
 * O que isso implica, e a tela precisa dizer: a entrega é cobrada por PEDIDO,
 * então ela está sendo RATEADA por receita entre os itens. Não existe o dado
 * de qual entrega pertence a qual item — em plataforma nenhuma. Por isso a
 * tela mostra a alíquota aplicada e a quebra dela, em vez de esconder o rateio
 * atrás de um número redondo.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { getFinanceiroResumoByUnits } from "@/lib/data/ifood-imported"
import { getNinefoodResumoByUnits } from "@/lib/data/ninefood-imported"
import { getKeetaResumoByUnits } from "@/lib/data/keeta-imported"
import { getCardapioWebResumoByUnits } from "@/lib/data/cardapioweb-imported"

export const PLATAFORMAS_CUSTO = [
  "ifood",
  "99food",
  "keeta",
  "cardapioweb",
] as const
export type PlataformaCusto = (typeof PLATAFORMAS_CUSTO)[number]

export type TaxaPlataforma = {
  /** Só a comissão ÷ bruto. Não é o que se aplica: serve pra tela quebrar. */
  comissaoPct: number
  /**
   * Tudo que a plataforma reteve ÷ bruto — comissão + entrega + promoção + o
   * resto. É ESTA que entra na conta do item (ver o topo do arquivo).
   */
  cargaTotalPct: number
  temDado: boolean
}

export type ItemCusto = {
  platform: PlataformaCusto
  nomeItem: string
  qtd: number
  receita: number
  /** Receita ÷ quantidade: o preço que saiu de verdade, já com promoção. */
  precoMedio: number
  /**
   * Preço de TABELA, digitado pela operação. Null = não preenchido.
   *
   * ⚠️ Não vem de plataforma nenhuma no iFood: o módulo Catalog responde 403
   * pro nosso app e o relatório de Cardápio não tem coluna de preço (checado em
   * 17/08/26). Por isso é digitado — ver migration 0217.
   */
  precoVenda: number | null
  /**
   * Quanto se deu de desconto por unidade: `precoVenda − precoMedio`.
   *
   * É a coluna que o Marcus pediu depois de comparar a tela com o portal e ver
   * R$ 20,09 onde o cardápio dizia R$ 23,90. O desconto tem duas origens que a
   * tela não consegue separar — promoção e mudança de preço no meio do período —
   * mas o TAMANHO dele é o que interessa: na Ki Delícia era ele que estava
   * comendo a margem inteira.
   */
  desconto: number | null
  /** Desconto sobre o preço de tabela. Null sem preço de venda. */
  descontoPct: number | null
  /** Null = ninguém preencheu ainda. Zero é um custo válido (cortesia). */
  custo: number | null
  /** Do cliente. Ver migration 0213: não vem das plataformas (salvo o CW). */
  categoria: string | null
  /** Fração retida pela plataforma (0,489 = 48,9%). Ver o topo do arquivo. */
  taxaPct: number
  /** O que a plataforma reteve, em R$ por unidade vendida. */
  taxaValor: number
  /** Preço − taxas − custo, por unidade. Null enquanto não há custo. */
  lucro: number | null
  /** Sobre o preço praticado. Null enquanto não há custo. */
  lucroPct: number | null
  /** Lucro × quantidade: o que este item deixou no mês. */
  lucroMes: number | null
}

export type ResumoCusto = {
  itens: ItemCusto[]
  receitaTotal: number
  /** Receita das linhas que já têm custo — o que dá pra confiar. */
  receitaComCusto: number
  /** Fração da receita coberta. É a métrica de progresso da tela. */
  cobertura: number
  /** Quantas linhas faltam pra chegar a 90% da receita, pegando as maiores. */
  faltamPara90: number
  /** Lucro do mês somando só o que tem custo. */
  lucroMes: number
  taxaPorPlataforma: Record<PlataformaCusto, TaxaPlataforma>
  /** Categorias já usadas nesta loja, pro filtro. */
  categorias: string[]
  /**
   * O período do relatório de Cardápio do iFood que está sendo mostrado.
   *
   * ⚠️ Não é o mês: é a janela que o lojista escolheu ao exportar. Em agosto/26
   * treze lojas tinham 8 dias e a Jardins tinha 30 — e a Jardins parecia a
   * maior da rede por causa disso. Enquanto o dado do iFood vier de exportação
   * manual, o período precisa estar escrito na tela.
   */
  janelaIfood: {
    inicio: string
    fim: string
    dias: number
    /** Começa em outro mês — a receita do iFood inclui dias de fora. */
    foraDoMes: boolean
  } | null
}

/**
 * A taxa efetiva de cada plataforma naquela loja e mês.
 *
 * Cada plataforma tem o seu agregador (bruto/líquido) e todos já existiam — o
 * mesmo número que alimenta o DRE. Reaproveitar em vez de recalcular evita a
 * situação clássica de a tela de custo discordar do DRE por dois centavos e
 * ninguém saber qual está certa.
 *
 * Sem venda no mês, a taxa fica em 0 em vez de virar NaN: melhor a tela mostrar
 * margem otimista e vazia do que "—" em toda linha.
 */
async function taxasEfetivas(
  unitId: string,
  year: number,
  month: number,
): Promise<Record<PlataformaCusto, TaxaPlataforma>> {
  const ids = [unitId]
  const [fin, nine, keeta, cw, keetaComissao] = await Promise.all([
    getFinanceiroResumoByUnits(ids, year, month),
    getNinefoodResumoByUnits(ids, year, month),
    getKeetaResumoByUnits(ids, year, month),
    getCardapioWebResumoByUnits(ids, year, month),
    comissaoKeeta(unitId, year, month),
  ])

  // Trava em [0, 1]: comissão maior que o bruto ou negativa (acerto
  // retroativo) viraria margem inventada.
  const frac = (parte: number, total: number): number =>
    total > 0 ? Math.min(Math.max(parte / total, 0), 1) : 0

  const f = fin.get(unitId)
  const n = nine.get(unitId)
  const k = keeta.get(unitId)
  const c = cw.get(unitId)

  const monta = (
    bruto: number,
    comissao: number,
    liquido: number,
  ): TaxaPlataforma => ({
    comissaoPct: frac(comissao, bruto),
    cargaTotalPct: frac(bruto - liquido, bruto),
    temDado: bruto > 0,
  })

  return {
    ifood: monta(f?.bruto ?? 0, f?.comissaoIfood ?? 0, f?.liquido ?? 0),
    "99food": monta(n?.bruto ?? 0, n?.comissaoRs ?? 0, n?.liquido ?? 0),
    keeta: monta(k?.bruto ?? 0, keetaComissao, k?.liquido ?? 0),
    // Canal próprio não tem comissão de marketplace. O que separa bruto de
    // líquido aqui é cancelamento, e cancelamento não é taxa do item.
    cardapioweb: {
      comissaoPct: 0,
      cargaTotalPct: 0,
      temDado: (c?.bruto ?? 0) > 0,
    },
  }
}

/**
 * A comissão da Keeta, somada direto dos pedidos.
 *
 * Vem daqui e não do `KeetaResumo` porque o resumo nunca precisou dela: ele
 * expõe bruto, líquido e a promoção da loja, e a comissão ficava dissolvida no
 * líquido. Uma soma de uma coluna num mês de uma loja não justifica mexer no
 * agregador que a rede inteira usa.
 */
async function comissaoKeeta(
  unitId: string,
  year: number,
  month: number,
): Promise<number> {
  const { data, error } = await createAdminClient().rpc("keeta_comissao_mes", {
    p_unit_id: unitId,
    p_year: year,
    p_month: month,
  })
  if (error) {
    console.error("keeta_comissao_mes:", error)
    return 0
  }
  return Number(data ?? 0)
}

export async function getCustoItens(
  unitId: string,
  year: number,
  month: number,
): Promise<ResumoCusto> {
  const admin = createAdminClient()

  const [{ data: vendas, error }, { data: custos, error: erroCustos }, taxas] =
    await Promise.all([
    admin.rpc("itens_vendidos_mes", {
      p_unit_id: unitId,
      p_year: year,
      p_month: month,
    }),
    admin
      .from("item_custos")
      .select("platform, nome_item, custo, categoria, preco_venda")
      .eq("unit_id", unitId),
    taxasEfetivas(unitId, year, month),
  ])

  const { data: janela } = await admin.rpc("ifood_janela_usada", {
    p_unit_ids: [unitId],
    p_year: year,
    p_month: month,
  })
  const j = ((janela ?? []) as {
    period_start: string
    period_end: string
    dias: number
  }[])[0]

  if (error) console.error("itens_vendidos_mes:", error)
  // ⚠️ Este erro estava sendo descartado. Um select que falha devolve `data:
  // null`, e a tela mostrava "nenhum custo preenchido" com a mesma cara de uma
  // loja que realmente não tem custo — sem nada no log dizendo que a consulta
  // nem chegou a rodar.
  if (erroCustos) console.error("item_custos:", erroCustos)

  const mapaCusto = new Map<string, number>()
  const mapaCategoria = new Map<string, string>()
  const mapaPrecoVenda = new Map<string, number>()
  for (const c of (custos ?? []) as {
    platform: string
    nome_item: string
    custo: number | string | null
    categoria: string | null
    preco_venda: number | string | null
  }[]) {
    // ⚠️ NULL é "não preenchido" e NÃO pode virar zero. `Number(null)` é 0, e
    // foi assim que classificar a categoria de um item o fez aparecer com
    // custo zero — logo, com lucro integral. Ver migration 0215.
    if (c.custo !== null) {
      mapaCusto.set(`${c.platform} ${c.nome_item}`, Number(c.custo))
    }
    // Mesma regra do custo (0217): zero é preço válido, NULL é não-preenchido.
    if (c.preco_venda !== null) {
      mapaPrecoVenda.set(`${c.platform} ${c.nome_item}`, Number(c.preco_venda))
    }
    if (c.categoria) {
      mapaCategoria.set(`${c.platform} ${c.nome_item}`, c.categoria)
    }
  }

  const itens: ItemCusto[] = []
  for (const v of (vendas ?? []) as {
    platform: string
    nome_item: string
    qtd: number | string
    receita: number | string
    categoria_plataforma: string | null
  }[]) {
    const qtd = Number(v.qtd) || 0
    const receita = Number(v.receita) || 0
    if (qtd <= 0) continue

    const platform = v.platform as PlataformaCusto
    const precoMedio = receita / qtd
    const taxaPct = taxas[platform]?.cargaTotalPct ?? 0
    const taxaValor = precoMedio * taxaPct

    const chave = `${platform} ${v.nome_item}`
    const custo = mapaCusto.has(chave) ? (mapaCusto.get(chave) as number) : null
    const precoVenda = mapaPrecoVenda.has(chave)
      ? (mapaPrecoVenda.get(chave) as number)
      : null

    // O lucro continua saindo do PREÇO MÉDIO, não do preço de venda. O preço de
    // tabela é referência pra medir o desconto; o dinheiro que entrou foi o
    // médio. Calcular margem sobre a tabela devolveria a margem que a loja ACHA
    // que tem — que é justamente o erro que fez a Ki Delícia montar promoção no
    // prejuízo sem perceber (17/08/26).
    const lucro = custo === null ? null : precoMedio - taxaValor - custo
    const desconto = precoVenda === null ? null : precoVenda - precoMedio

    itens.push({
      platform,
      nomeItem: v.nome_item,
      // O que o cliente escreveu vence o que veio do Cardápio Web: se ele
      // renomeou a categoria aqui, é porque a da plataforma não servia.
      categoria: mapaCategoria.get(chave) ?? v.categoria_plataforma ?? null,
      qtd,
      receita,
      precoMedio,
      precoVenda,
      desconto,
      descontoPct:
        precoVenda === null || precoVenda <= 0 ? null : (desconto as number) / precoVenda,
      custo,
      taxaPct,
      taxaValor,
      lucro,
      lucroPct: lucro === null || precoMedio <= 0 ? null : lucro / precoMedio,
      lucroMes: lucro === null ? null : lucro * qtd,
    })
  }

  const receitaTotal = itens.reduce((s, i) => s + i.receita, 0)
  const receitaComCusto = itens
    .filter((i) => i.custo !== null)
    .reduce((s, i) => s + i.receita, 0)

  /**
   * "Faltam N linhas pra 90%" — o número que faz a pessoa continuar.
   *
   * Percorre as linhas SEM custo, da maior receita pra menor, contando quantas
   * bastam. É a diferença entre "faltam 87 itens" (dá vontade de fechar a aba)
   * e "faltam 3" (dá pra terminar agora).
   */
  const alvo = receitaTotal * 0.9
  let acumulado = receitaComCusto
  let faltamPara90 = 0
  if (receitaTotal > 0 && acumulado < alvo) {
    for (const i of itens.filter((x) => x.custo === null)) {
      acumulado += i.receita
      faltamPara90++
      if (acumulado >= alvo) break
    }
  }

  return {
    itens,
    receitaTotal,
    receitaComCusto,
    cobertura: receitaTotal > 0 ? receitaComCusto / receitaTotal : 0,
    faltamPara90,
    lucroMes: itens.reduce((s, i) => s + (i.lucroMes ?? 0), 0),
    taxaPorPlataforma: taxas,
    categorias: [
      ...new Set(itens.map((i) => i.categoria).filter(Boolean) as string[]),
    ].sort((a, b) => a.localeCompare(b, "pt-BR")),
    janelaIfood: j
      ? {
          inicio: j.period_start,
          fim: j.period_end,
          dias: Number(j.dias),
          foraDoMes: j.period_start.slice(0, 7) !== `${year}-${String(month).padStart(2, "0")}`,
        }
      : null,
  }
}

/** Uma linha por loja na tela-índice. */
export type LojaCusto = {
  unitId: string
  codigo: string
  nome: string
  cidade: string | null
  logoUrl: string | null
  plataformas: PlataformaCusto[]
  /**
   * Vendeu no mês mas NÃO tem relatório de itens.
   *
   * ⚠️ Existe porque a tela mentia. Em agosto/26 o iFood sumiu da lista inteira
   * e o Marcus perguntou se tinha quebrado: não tinha — o relatório de ITENS do
   * iFood vem de planilha e a última importação foi 27/07, enquanto a JK vendeu
   * 1.199 pedidos por lá no mês. Sem este campo, a ausência de uma plataforma
   * inteira fica indistinguível de "não vendeu".
   */
  semItens: PlataformaCusto[]
  /**
   * A janela do relatório de Cardápio do iFood desta loja, em dias.
   *
   * ⚠️ É o que torna a coluna "Itens" e a "Receita" comparáveis — ou não. Em
   * agosto/26, treze lojas tinham 8 dias e a Jardins tinha 30: ela aparecia como
   * a maior da rede porque mostrava quase quatro vezes mais dias.
   */
  janelaIfoodDias: number | null
  /** Início e fim do relatório, pra tela mostrar a data e não só a duração. */
  janelaIfood: { inicio: string; fim: string } | null
  /**
   * O relatório começa em outro mês.
   *
   * ⚠️ É o caso que enganou de verdade: a Jardins mostrava R$ 180 mil em
   * "Agosto/2026" com um relatório de 12/07 a 10/08 — vinte dos trinta dias
   * eram julho. Não dá pra recortar (o relatório traz o total do período, sem
   * abertura por dia), então a tela precisa dizer.
   */
  janelaForaDoMes: boolean
  itens: number
  itensComCusto: number
  qtdVendida: number
  /**
   * Faturamento REAL do mês, da mesma fonte do DRE (bruto das 4 plataformas).
   *
   * ⚠️ É diferente de `receitaItens` e isso é o ponto. A soma dos itens vem do
   * relatório de Cardápio, cuja janela pode ser 12/07→10/08 — a Jardins
   * aparecia com R$ 180 mil embaixo de um rótulo "Agosto". Marcus: "essa
   * receita não poderia puxar a receita atual de agosto?". Poderia, e é o
   * número que ele reconhece: a coluna passa a mostrar este.
   */
  receitaMes: number
  /**
   * Receita SOMANDO OS ITENS do relatório. Continua existindo porque é a base
   * que o custo consegue cobrir — a barra de progresso mede sobre ela, não
   * sobre o faturamento do mês. Misturar as duas faria a cobertura despencar
   * por um motivo que não é falta de cadastro.
   */
  receitaItens: number
  receitaComCusto: number
  cobertura: number
  /** Lucro bruto do que tem custo. Null quando nada foi preenchido. */
  lucroMes: number | null
  /** Lucro ÷ receita coberta. É o número comparável entre lojas. */
  lucroPct: number | null
  /**
   * O custo da mercadoria vendida, em R$, das linhas que TÊM custo digitado.
   *
   * Soma o `custo × quantidade` do que foi preenchido — nada é estimado para o
   * que falta. Por isso ele anda de mãos dadas com `cobertura`: CMV de uma loja
   * com 20% preenchido é o CMV de 20% do cardápio, e o relatório precisa dizer
   * isso em vez de mostrar um percentual redondo.
   */
  custoMes: number
  /**
   * O que as plataformas retiveram sobre a MESMA base coberta.
   *
   * Existe pra o relatório de CMV fechar a conta na tela: receita coberta −
   * taxas − CMV = lucro bruto. Sem esta linha o dono vê um CMV de 30% e uma
   * margem de 20% e não enxerga para onde foram os outros 50%.
   */
  taxaMes: number
  /**
   * CMV sobre a receita coberta. Null quando nada foi preenchido.
   *
   * ⚠️ O divisor é `receitaComCusto`, NÃO `receitaMes`. Dividir pelo
   * faturamento do mês faria o CMV parecer minúsculo só porque falta cadastro —
   * o número desceria conforme a pessoa preenchesse MENOS, que é exatamente o
   * incentivo errado.
   */
  cmvPct: number | null
}

/**
 * O resumo de TODAS as lojas do escopo, para a tela-índice.
 *
 * ⚠️ DUAS CONSULTAS PRA N LOJAS, não N×2. A RPC recebe a lista inteira e os
 * agregadores de plataforma também. Com 500 lojas, uma consulta por loja
 * significaria 2.000 idas ao banco pra desenhar uma tabela.
 *
 * A conta do lucro precisa acontecer aqui e não no SQL porque a comissão vem
 * dos agregadores (que são a fonte do DRE): `lucro = receita_com_custo −
 * comissão sobre ela − custo total`, feita por PLATAFORMA e só então somada,
 * já que cada plataforma cobra a sua alíquota.
 */
export async function getLojasCusto(
  units: {
    id: string
    code: string
    name: string
    city?: string | null
    logoUrl?: string | null
  }[],
  year: number,
  month: number,
): Promise<LojaCusto[]> {
  if (units.length === 0) return []
  const ids = units.map((u) => u.id)
  const admin = createAdminClient()

  const [{ data: linhas, error }, { data: janelas }, fin, nine, keeta, cw] =
    await Promise.all([
    admin.rpc("custo_resumo_lojas", {
      p_unit_ids: ids,
      p_year: year,
      p_month: month,
    }),
    admin.rpc("ifood_janela_usada", {
      p_unit_ids: ids,
      p_year: year,
      p_month: month,
    }),
    getFinanceiroResumoByUnits(ids, year, month),
    getNinefoodResumoByUnits(ids, year, month),
    getKeetaResumoByUnits(ids, year, month),
    getCardapioWebResumoByUnits(ids, year, month),
  ])
  if (error) console.error("custo_resumo_lojas:", error)

  const frac = (parte: number, total: number) =>
    total > 0 ? Math.min(Math.max(parte / total, 0), 1) : 0

  // A comissão da Keeta vem de uma RPC por loja. Só pede pras lojas que
  // realmente têm venda na Keeta — sem isso seriam 500 chamadas pra nada.
  const comKeeta = new Set(
    ((linhas ?? []) as { unit_id: string; platform: string }[])
      .filter((l) => l.platform === "keeta")
      .map((l) => l.unit_id),
  )
  const comissaoKeetaPorLoja = new Map<string, number>()
  await Promise.all(
    [...comKeeta].map(async (id) => {
      comissaoKeetaPorLoja.set(id, await comissaoKeeta(id, year, month))
    }),
  )

  const acc = new Map<string, LojaCusto>()
  for (const u of units) {
    acc.set(u.id, {
      unitId: u.id,
      codigo: u.code,
      nome: u.name,
      cidade: u.city ?? null,
      logoUrl: u.logoUrl ?? null,
      plataformas: [],
      semItens: [],
      janelaIfoodDias: null,
      janelaIfood: null,
      janelaForaDoMes: false,
      itens: 0,
      itensComCusto: 0,
      qtdVendida: 0,
      receitaMes: 0,
      receitaItens: 0,
      receitaComCusto: 0,
      cobertura: 0,
      lucroMes: null,
      lucroPct: null,
      custoMes: 0,
      taxaMes: 0,
      cmvPct: null,
    })
  }

  for (const l of (linhas ?? []) as {
    unit_id: string
    platform: string
    itens: number | string
    itens_com_custo: number | string
    receita: number | string
    receita_com_custo: number | string
    custo_total: number | string
  }[]) {
    const cur = acc.get(l.unit_id)
    if (!cur) continue
    const plataforma = l.platform as PlataformaCusto
    const receita = Number(l.receita) || 0
    const receitaComCusto = Number(l.receita_com_custo) || 0
    const custoTotal = Number(l.custo_total) || 0

    // A alíquota é a da PLATAFORMA daquela loja — por isso o lucro é somado
    // plataforma a plataforma, e não sobre o total da loja.
    // A MESMA régua da tela da loja: o que a plataforma reteve, não só a
    // comissão. Duas telas com definições diferentes de "taxa" seria a receita
    // pronta pra alguém perguntar qual das duas está certa.
    let taxaPct = 0
    if (plataforma === "ifood") {
      const r = fin.get(l.unit_id)
      taxaPct = frac((r?.bruto ?? 0) - (r?.liquido ?? 0), r?.bruto ?? 0)
    } else if (plataforma === "99food") {
      const r = nine.get(l.unit_id)
      taxaPct = frac((r?.bruto ?? 0) - (r?.liquido ?? 0), r?.bruto ?? 0)
    } else if (plataforma === "keeta") {
      const r = keeta.get(l.unit_id)
      taxaPct = frac((r?.bruto ?? 0) - (r?.liquido ?? 0), r?.bruto ?? 0)
    }

    if (!cur.plataformas.includes(plataforma)) cur.plataformas.push(plataforma)
    cur.itens += Number(l.itens) || 0
    cur.itensComCusto += Number(l.itens_com_custo) || 0
    cur.receitaItens += receita
    cur.receitaComCusto += receitaComCusto

    if (receitaComCusto > 0) {
      const taxa = receitaComCusto * taxaPct
      cur.lucroMes = (cur.lucroMes ?? 0) + (receitaComCusto - taxa - custoTotal)
      // Guardadas separadas pro relatório de CMV conseguir mostrar a cascata
      // (receita coberta − taxas − CMV = lucro) em vez de só o resultado.
      cur.custoMes += custoTotal
      cur.taxaMes += taxa
    }
  }

  for (const j of (janelas ?? []) as {
    unit_id: string
    dias: number
    period_start: string
    period_end: string
  }[]) {
    const cur = acc.get(j.unit_id)
    if (!cur) continue
    cur.janelaIfoodDias = Number(j.dias)
    cur.janelaIfood = { inicio: j.period_start, fim: j.period_end }
    const [ay, am] = j.period_start.slice(0, 7).split("-").map(Number)
    cur.janelaForaDoMes = ay !== year || am !== month
  }

  // Quem faturou na plataforma mas não trouxe item nenhum.
  for (const u of units) {
    const cur = acc.get(u.id)
    if (!cur) continue
    const faturou: [PlataformaCusto, number][] = [
      ["ifood", fin.get(u.id)?.bruto ?? 0],
      ["99food", nine.get(u.id)?.bruto ?? 0],
      ["keeta", keeta.get(u.id)?.bruto ?? 0],
      ["cardapioweb", cw.get(u.id)?.bruto ?? 0],
    ]
    cur.semItens = faturou
      .filter(([p, bruto]) => bruto > 0 && !cur.plataformas.includes(p))
      .map(([p]) => p)
  }

  // Faturamento do mês, das mesmas funções que alimentam o DRE.
  for (const u of units) {
    const cur = acc.get(u.id)
    if (!cur) continue
    cur.receitaMes =
      (fin.get(u.id)?.bruto ?? 0) +
      (nine.get(u.id)?.bruto ?? 0) +
      (keeta.get(u.id)?.bruto ?? 0) +
      (cw.get(u.id)?.bruto ?? 0)
  }

  for (const l of acc.values()) {
    l.cobertura = l.receitaItens > 0 ? l.receitaComCusto / l.receitaItens : 0
    l.lucroPct =
      l.lucroMes !== null && l.receitaComCusto > 0
        ? l.lucroMes / l.receitaComCusto
        : null
    // Null quando ninguém preencheu nada: zero aqui viraria "CMV de 0%", que a
    // tela mostraria como a melhor loja da rede.
    l.cmvPct =
      l.lucroMes !== null && l.receitaComCusto > 0
        ? l.custoMes / l.receitaComCusto
        : null
  }

  // Ordena pelo faturamento REAL: é ele que diz qual loja vale preencher
  // primeiro. Ordenar pela soma dos itens colocaria na frente quem exportou um
  // período maior.
  return [...acc.values()].sort((a, b) => b.receitaMes - a.receitaMes)
}

/**
 * Quantos dias de relatório de Cardápio cada loja tem no mês, e quantas
 * venderam sem relatório nenhum.
 *
 * ⚠️ Serve pra QUALQUER tela que some item de iFood entre lojas — o Top
 * produtos da tela inicial, por exemplo. O relatório é exportado à mão, uma
 * loja por arquivo, com período escolhido na hora: somar lojas com janelas
 * diferentes é somar coisas diferentes, e quem tem mais dias pesa mais no
 * ranking sem vender mais.
 */
export async function getJanelasIfood(
  unitIds: string[],
  year: number,
  month: number,
): Promise<{ dias: number; lojasSemRelatorio: number }[]> {
  if (unitIds.length === 0) return []
  const admin = createAdminClient()

  const [{ data: janelas }, fin] = await Promise.all([
    admin.rpc("ifood_janela_usada", {
      p_unit_ids: unitIds,
      p_year: year,
      p_month: month,
    }),
    getFinanceiroResumoByUnits(unitIds, year, month),
  ])

  const linhas = (janelas ?? []) as { unit_id: string; dias: number }[]
  const comRelatorio = new Set(linhas.map((l) => l.unit_id))

  // Faturou no iFood e não tem relatório: some do ranking sem deixar rastro.
  const lojasSemRelatorio = unitIds.filter(
    (id) => (fin.get(id)?.bruto ?? 0) > 0 && !comRelatorio.has(id),
  ).length

  return linhas.map((l) => ({ dias: Number(l.dias), lojasSemRelatorio }))
}
