/**
 * A RÉGUA — definição única de cada número financeiro do sistema.
 *
 * Antes deste arquivo, a mesma pergunta tinha respostas diferentes conforme a
 * tela: três definições de "faturamento bruto", quatro de "% que fica na loja"
 * e cinco de "margem" — duas delas renderizadas lado a lado na mesma página.
 * O cliente comparava duas telas, via números diferentes e perdia a confiança
 * no sistema inteiro, mesmo quando uma das duas estava certa.
 *
 * Regra de ouro: NENHUMA tela calcula essas contas por conta própria. Se você
 * precisa de um número que não está aqui, adicione aqui — não faça a conta na
 * página.
 *
 * São funções puras de propósito: não tocam banco, não sabem de período, não
 * sabem de plataforma. Recebem números crus e devolvem a leitura. Assim dá pra
 * testar cada decisão isoladamente e ler o arquivo inteiro como documentação
 * do negócio.
 */

/** Entrada crua de uma loja (ou da rede) num período. */
export type EntradaFinanceira = {
  /** Cesta de itens dos pedidos VÁLIDOS (sem cancelados). */
  bruto: number
  /** O que a plataforma repassou (extrato). */
  liquido: number
  /**
   * Dinheiro, PIX ou maquininha que o cliente pagou na porta. É da loja e não
   * passa pelo repasse — só o iFood mede isso hoje.
   */
  recebidoDireto?: number
  /** Cesta dos pedidos cancelados. Entra no bruto EXIBIDO, não na base dos %. */
  cancelCesta?: number
  /** Custo de mercadoria (Cozina + loja) lançado no mês. */
  cmv?: number
  /** Custo de operação lançado no mês. */
  operacao?: number
  /**
   * "Recebido real" digitado à mão no fechamento. Quando > 0, ELE é a verdade
   * sobre o que entrou — já inclui repasse e venda direta, então substitui o
   * calculado em vez de somar (somar era double-count).
   */
  totalRecebidoReal?: number
}

export type LeituraFinanceira = {
  /**
   * O número que o lojista vê no portal como "Valor das vendas": cesta válida
   * + cesta dos cancelados. É o que exibimos como Faturamento Bruto.
   */
  brutoTotal: number
  /**
   * Base de TODO percentual. Exclui cancelados de propósito: pedido cancelado
   * não gerou repasse nem taxa, então inflaria o denominador e derrubaria a
   * margem sem que nada tivesse acontecido na operação.
   */
  brutoValido: number
  /** Repasse da plataforma. */
  repasse: number
  /** Venda direta — pago na loja, fora do repasse. */
  vendaDireta: number
  /** Tudo que a loja embolsou: repasse + venda direta. */
  ficaNaLoja: number
  /** O que sobrou pra plataforma. Nunca negativo. */
  taxaPlataforma: number
  /** % do bruto válido que ficou na loja. */
  pctFicaNaLoja: number
  /** % do bruto válido que ficou com a plataforma. Fecha 100% com o de cima. */
  pctTaxa: number
  /** Quanto da fatia da loja veio da porta (sobre o bruto válido). */
  pctVendaDireta: number
  /** ficaNaLoja − CMV. */
  margem: number
  pctMargem: number
  /** margem − operação. O resultado do mês. */
  resultado: number
  pctResultado: number
  /** true quando o "recebido real" manual substituiu o calculado. */
  usouRecebidoManual: boolean
}

const pct = (parte: number, base: number) => (base > 0 ? (parte / base) * 100 : 0)

/**
 * A única conta do sistema.
 *
 * Decisões embutidas, cada uma paga com um bug real:
 *
 * 1. VALE-REFEIÇÃO NÃO ENTRA. Ele parecia receita paga à parte pelo iFood,
 *    mas 2.201 de 2.201 pedidos pagos em vale (julho/26) têm Entrada
 *    Financeira no repasse, com valor idêntico ao pago pelo cliente. Vale é
 *    forma de pagamento de pedido já repassado — somá-lo inflava a receita da
 *    rede em ~R$ 97 mil/mês. Por isso `EntradaFinanceira` nem tem campo de VR.
 *
 * 2. VENDA DIRETA ENTRA. Dinheiro/PIX na porta é da loja, não é taxa. Sem
 *    isso a Santo Peixe aparecia com 66,9% do iFood quando o real era 75,4%, e
 *    o cliente concluía que a plataforma ficava com mais do que fica.
 *
 * 3. PERCENTUAL SOBRE O BRUTO VÁLIDO, valor exibido com cancelados. São duas
 *    perguntas diferentes: "quanto vendi" (portal, com cancelados) e "de cada
 *    real que virou dinheiro, quanto ficou comigo" (sem cancelados).
 *
 * 4. RECEBIDO MANUAL SUBSTITUI, não soma.
 */
export function lerFinanceiro(e: EntradaFinanceira): LeituraFinanceira {
  const bruto = Math.max(0, e.bruto)
  const repasse = e.liquido
  const vendaDireta = Math.max(0, e.recebidoDireto ?? 0)
  const cancel = Math.max(0, e.cancelCesta ?? 0)

  const calculado = repasse + vendaDireta
  const manual = e.totalRecebidoReal ?? 0
  const usouRecebidoManual = manual > 0
  const ficaNaLoja = usouRecebidoManual ? manual : calculado

  // A taxa sai do CALCULADO, sempre. Se o "recebido real" manual fosse usado
  // aqui, um lançamento a mais na mão viraria "taxa negativa" da plataforma.
  const taxaPlataforma = Math.max(0, bruto - repasse - vendaDireta)

  const cmv = Math.max(0, e.cmv ?? 0)
  const operacao = Math.max(0, e.operacao ?? 0)
  const margem = ficaNaLoja - cmv
  const resultado = margem - operacao

  return {
    brutoTotal: bruto + cancel,
    brutoValido: bruto,
    repasse,
    vendaDireta,
    ficaNaLoja,
    taxaPlataforma,
    pctFicaNaLoja: pct(ficaNaLoja, bruto),
    pctTaxa: pct(taxaPlataforma, bruto),
    pctVendaDireta: pct(vendaDireta, bruto),
    margem,
    pctMargem: pct(margem, bruto),
    resultado,
    pctResultado: pct(resultado, bruto),
    usouRecebidoManual,
  }
}

/**
 * Soma várias leituras numa só (rede, ou uma loja com várias plataformas).
 *
 * Refaz os percentuais sobre o total somado — média de percentual é errada:
 * uma loja de R$ 200 mil com 70% e uma de R$ 2 mil com 30% não dão 50%.
 */
export function somarFinanceiro(
  entradas: EntradaFinanceira[],
): LeituraFinanceira {
  const acc = entradas.reduce<Required<EntradaFinanceira>>(
    (a, e) => ({
      bruto: a.bruto + e.bruto,
      liquido: a.liquido + e.liquido,
      recebidoDireto: a.recebidoDireto + (e.recebidoDireto ?? 0),
      cancelCesta: a.cancelCesta + (e.cancelCesta ?? 0),
      cmv: a.cmv + (e.cmv ?? 0),
      operacao: a.operacao + (e.operacao ?? 0),
      totalRecebidoReal: a.totalRecebidoReal + (e.totalRecebidoReal ?? 0),
    }),
    {
      bruto: 0,
      liquido: 0,
      recebidoDireto: 0,
      cancelCesta: 0,
      cmv: 0,
      operacao: 0,
      totalRecebidoReal: 0,
    },
  )
  return lerFinanceiro(acc)
}

/** Rótulos oficiais. Tela nenhuma inventa nome pra esses números. */
export const ROTULOS = {
  brutoTotal: "Faturamento bruto",
  brutoValido: "Faturamento válido",
  repasse: "Repasse da plataforma",
  vendaDireta: "Venda direta (pago na loja)",
  ficaNaLoja: "Fica na loja",
  taxaPlataforma: "Fica com a plataforma",
  pctFicaNaLoja: "% que fica na loja",
  margem: "Margem",
  resultado: "Resultado",
} as const
