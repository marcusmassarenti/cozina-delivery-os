/**
 * O BRUTO do iFood — uma cópia só, importada por todo mundo.
 *
 * ## A regra: bruto = CESTA + frete da ENTREGA PRÓPRIA. Mais nada.
 *
 * ⚠️ ISTO JÁ FOI IMPLEMENTADO ERRADO UMA VEZ (31/08/26). Se você está aqui
 * pensando "o portal mostra a taxa de entrega, tem que somar" — não tem.
 * Leia o parágrafo abaixo antes de mexer.
 *
 * O portal usa DUAS réguas, uma por modo de entrega — provadas por print:
 *
 *   ENTREGA PARCEIRA (JK): a taxa de entrega é do iFood. Fica em "Valores
 *   complementares", marcada como informativa, FORA do total.
 *   ENTREGA PRÓPRIA (Varginha): o frete é receita da LOJA e a linha do
 *   portal se chama "Valor dos itens E ENTREGA PRÓPRIA DA LOJA" — o frete
 *   ENTRA (R$ 19.266,98 na tela vs R$ 17.021,57 de cesta pura).
 *
 * A taxa de SERVIÇO nunca entra, nos dois modos.
 *
 * O extrato não traz o frete próprio (está diluído na Entrada Financeira; a
 * derivação por resíduo foi medida e é suja — 34 negativos em 267 pedidos).
 * Ele vem da API de pedidos via `ifood_frete_proprio_by_units` (0251) e chega
 * aqui no campo `fretePropriaCliente` do resumo.
 *
 * O portal do iFood tem duas seções na tela de Faturamento:
 *
 *   Valor das vendas  = Valor dos itens − Cancelamentos + Reembolso de
 *                       pedidos cancelados
 *   Valores complementares  = taxa de serviço + taxa de entrega parceira +
 *                       taxa de conveniência por pagamento parcelado
 *
 * E a segunda seção diz, com todas as letras: **"Esses valores são apenas
 * informativos e não são considerados no cálculo"**. O total da seção repete
 * o próprio "Valor das vendas" — ou seja, ela NÃO acrescenta nada.
 *
 * Print real conferido (JK, 2026), e a aritmética fecha ao centavo:
 *   175.412,42 − 176,68 + 951,50            = 176.187,24  (Valor das vendas)
 *   176.187,24 − 41.525,71 − 28.225,20 + 158,17 = 106.594,50  (Total)
 * A taxa de entrega parceira (R$ 31.359,58) e a de serviço (R$ 2.783,88)
 * ficam de FORA das duas contas.
 *
 * ## Como eu errei, pra ninguém repetir
 *
 * A evidência original foi o pedido 5599 da JK: os "Valores complementares"
 * listavam taxa de serviço (R$ 0,99) e de entrega parceira (R$ 10,99). Li
 * "estão listados no pedido" como "entram no faturamento" — sem ter visto a
 * frase da seção. Somei os dois ao bruto, inflando 62 lojas em R$ 171,9 mil
 * num mês. A loja que originou a investigação (Varginha) é de ENTREGA
 * PRÓPRIA e não tinha frete nenhum: a mudança nunca a corrigiu, o que já era
 * o sinal de que a hipótese estava errada.
 *
 * ## Por que este módulo continua existindo
 *
 * A regra estava copiada em 10 arquivos (dashboard ×2, DRE ×2, comparativo,
 * operação consolidada, relatório de plataformas, pedidos, diagnóstico,
 * ficha técnica, e-mail semanal). Enquanto todo mundo importar daqui, mudar
 * a régua é mudar UM lugar — foi o que permitiu desfazer o erro acima em
 * três linhas em vez de caçar dez cópias de novo.
 */

/** O mínimo que a régua precisa saber — evita puxar tipo de módulo server-only. */
export type BrutoIfoodInput = {
  bruto: number
  taxaEntrega: number
  taxaServicoCliente: number
  /**
   * Frete da ENTREGA PRÓPRIA pago pelo cliente (da API de pedidos — o extrato
   * não tem essa linha). ESTE entra no bruto: o portal chama a linha de
   * "Valor dos itens e entrega própria da loja" (print da Varginha,
   * 31/08/26). Não confundir com `taxaEntrega`, que é o frete da ENTREGA
   * PARCEIRA — dinheiro do iFood, informativo, fora da conta.
   * Opcional porque nem todo chamador tem o resumo completo; ausente = 0.
   */
  fretePropriaCliente?: number
}

/**
 * True quando o iFood entregou (existe taxa de entrega no extrato).
 * Serve só pra RÓTULO/diagnóstico — NÃO entra em nenhuma soma de faturamento.
 */
export function ifoodEntregaPelaPlataforma(fin: BrutoIfoodInput): boolean {
  return Math.abs(fin.taxaEntrega) > 0
}

/**
 * O bruto do iFood como o portal mostra: a CESTA, e só.
 *
 * Existe como função (em vez de `fin.bruto` espalhado) pra que a régua tenha
 * um dono. Não acrescente taxa aqui sem reler o cabeçalho deste arquivo.
 */
export function brutoIfoodComoNoPortal(fin: BrutoIfoodInput): number {
  return fin.bruto + (fin.fretePropriaCliente ?? 0)
}
