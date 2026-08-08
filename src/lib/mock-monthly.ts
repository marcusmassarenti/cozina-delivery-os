import type { PlatformId } from "@/components/platform-logo"

export type PlatformBreakdown = {
  id: PlatformId
  name: string
  bruto: number
  liquido: number
  pctLoja: number
  /**
   * Apenas iFood: valores que entram direto no caixa da loja
   * (dinheiro / PIX / VR presencial / maquininha própria) em pedidos do
   * app, com impacto_no_repasse=false no Conciliação. Permite mostrar
   * "Total faturamento iFood" = liquido + recebidoDireto, igual ao
   * Portal do Parceiro. 99 Food/Keeta deixam em 0.
   */
  recebidoDireto?: number
  /**
   * Promoção/cupom que a LOJA bancou (decisão da franquia, não taxa que a
   * plataforma cobra). Permite separar no "Para onde vai o bruto":
   *  - Taxa real da plataforma = (bruto − liquido) − promocoesLoja
   *  - Promoções da loja = promocoesLoja
   * iFood: Promoção custeada pela loja. 99 Food: campo promocoes_rs.
   * Keeta: soma de outras_despesas (cupons/multas bancadas pela loja).
   */
  promocoesLoja?: number
}

export type UnitMonthly = {
  pedidos: number
  pedidosCancelados: number
  clientesNovos: number | null
  ticketMedio: number
  faturamentoBruto: number
  faturamentoLiquido: number
  totalLiquido: number
  vrRecebido: number
  vrTaxaMedia8: number
  cancelamentosReembolsos: number
  taxaEntregaIfood: number
  promocoes: number
  taxaComissaoIfood: number
  servicosLogisticos: number
  outrosDescontosIfood: number
  custoProdutosCozina: number
  custoProdutosLoja: number | null
  /** Custo da operação (aluguel, folha, etc.) — opcional, manual */
  custoOperacao: number
  /** "Recebido real no caixa" lançado manualmente. Quando > 0, JÁ inclui o VR
   *  (é o que de fato entrou), então o VR não deve ser somado de novo. */
  totalRecebidoReal: number
  margemLiquida: number
  margemLucroPct: number
  notaMedia: number
  observacoes: string
  platforms: PlatformBreakdown[]
  /**
   * True quando o faturamento do iFood NÃO veio do extrato (Conciliação) e sim
   * do "pago pelo cliente" dos pedidos (Financial Events).
   *
   * O número é real — é a Entrada Financeira de cada pedido, o que o cliente
   * de fato pagou — mas fica ABAIXO da cesta que o extrato traz, porque as
   * promoções não entram nele. Medido em 07/ago/26 em 100 loja-mês com as duas
   * fontes: mediana 85% da cesta, e de 28% a 108% conforme o quanto a loja
   * promove. Loja sem promoção nenhuma bate ~100% (Cardeal 101,7%, Yakisushi
   * 98,5%); loja que promove pesado despenca (Nosso Brownie 40,7%).
   *
   * Por isso a tela PRECISA dizer de onde veio: senão o valor sobe sozinho no
   * dia em que o extrato chega, e quem olha lê como venda que apareceu do nada.
   */
  ifoodBrutoDePedidos?: boolean
}

export const emptyMonthly: UnitMonthly = {
  pedidos: 0,
  pedidosCancelados: 0,
  clientesNovos: null,
  ticketMedio: 0,
  faturamentoBruto: 0,
  faturamentoLiquido: 0,
  totalLiquido: 0,
  vrRecebido: 0,
  vrTaxaMedia8: 0,
  cancelamentosReembolsos: 0,
  taxaEntregaIfood: 0,
  promocoes: 0,
  taxaComissaoIfood: 0,
  servicosLogisticos: 0,
  outrosDescontosIfood: 0,
  custoProdutosCozina: 0,
  custoProdutosLoja: null,
  custoOperacao: 0,
  totalRecebidoReal: 0,
  margemLiquida: 0,
  margemLucroPct: 0,
  notaMedia: 0,
  observacoes: "",
  platforms: [
    { id: "ifood", name: "iFood", bruto: 0, liquido: 0, pctLoja: 0 },
    { id: "99food", name: "99 Food", bruto: 0, liquido: 0, pctLoja: 0 },
    { id: "keeta", name: "Keeta", bruto: 0, liquido: 0, pctLoja: 0 },
  ],
}

/**
 * Gera dados mensais mock determinísticos pra cada unidade com base no código.
 * Substituir por leitura real quando integrarmos iFood + lançamentos manuais.
 */
export function mockMonthlyFor(code: string): UnitMonthly {
  // hash simples do código → seed 0..1
  const sum = code
    .toUpperCase()
    .split("")
    .reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const seed = (sum % 100) / 100

  const pedidos = Math.round(200 + seed * 3400)
  const ticketMedio = Number((55 + seed * 30).toFixed(2))
  const faturamentoBruto = Math.round(pedidos * ticketMedio)
  // ~33% vai pra taxas
  const totalTaxas = Math.round(faturamentoBruto * 0.33)
  const faturamentoLiquido = faturamentoBruto - totalTaxas
  const vrRecebido = Math.round(faturamentoBruto * 0.06)
  const vrTaxaMedia8 = Math.round(vrRecebido * 0.08)
  const cancelamentosReembolsos = Math.round(faturamentoBruto * 0.004)
  const totalLiquido = faturamentoLiquido + vrRecebido - vrTaxaMedia8 - cancelamentosReembolsos

  const custoProdutosCozina = Math.round(faturamentoBruto * 0.26)
  const margemLiquida = totalLiquido - custoProdutosCozina
  const margemLucroPct = (margemLiquida / faturamentoBruto) * 100

  // distribuição entre plataformas
  const ifBruto = Math.round(faturamentoBruto * 0.6)
  const k9Bruto = Math.round(faturamentoBruto * 0.16)
  const ktBruto = faturamentoBruto - ifBruto - k9Bruto

  const ifLiq = Math.round(ifBruto * 0.64)
  const k9Liq = Math.round(k9Bruto * 0.74)
  const ktLiq = Math.round(ktBruto * 0.62)

  return {
    pedidos,
    pedidosCancelados: Math.round(pedidos * 0.085),
    clientesNovos: Math.round(pedidos * 0.13),
    ticketMedio,
    faturamentoBruto,
    faturamentoLiquido,
    totalLiquido,
    vrRecebido,
    vrTaxaMedia8,
    cancelamentosReembolsos,
    taxaEntregaIfood: Math.round(totalTaxas * 0.05),
    promocoes: Math.round(totalTaxas * 0.05),
    taxaComissaoIfood: Math.round(totalTaxas * 0.46),
    servicosLogisticos: Math.round(totalTaxas * 0.35),
    outrosDescontosIfood: Math.round(totalTaxas * 0.09),
    custoProdutosCozina,
    custoProdutosLoja: null,
    custoOperacao: 0,
    totalRecebidoReal: 0,
    margemLiquida,
    margemLucroPct,
    notaMedia: Number((4.4 + seed * 0.4).toFixed(1)),
    observacoes: "",
    platforms: [
      { id: "ifood", name: "iFood", bruto: ifBruto, liquido: ifLiq, pctLoja: (ifLiq / ifBruto) * 100 },
      { id: "99food", name: "99 Food", bruto: k9Bruto, liquido: k9Liq, pctLoja: (k9Liq / k9Bruto) * 100 },
      { id: "keeta", name: "Keeta", bruto: ktBruto, liquido: ktLiq, pctLoja: (ktLiq / ktBruto) * 100 },
    ],
  }
}
