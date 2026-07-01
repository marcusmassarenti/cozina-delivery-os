/**
 * Tradução da forma de pagamento do 99 Food para rótulo amigável.
 *
 * Contexto: a 99 descontinuou o campo legado `pay_type`. O tipo de pagamento
 * agora é dado por `pay_method` (1=online / 2=dinheiro) + `pay_channel` (o
 * detalhe: cartão, PIX, VR…). O webhook orderNew manda `pay_method` como número
 * cru ("1"/"2"), então sem tradução o relatório mostrava "1" e "2".
 *
 * Guardamos o `pay_channel` em ninefood_pedidos e traduzimos aqui, na exibição
 * — assim, quando a 99 mandar a tabela completa de códigos, é só ampliar o mapa
 * (sem re-sync). Os pedidos de import manual não têm canal e caem no texto
 * original ("Pagamento online" / "Pagamento em dinheiro").
 */

/**
 * Tabela oficial de pay_channel da doc da 99Food (Order API → Get Order Details).
 * https://developer-food.99app.com → Order API. Rótulos em pt-BR, compactos pro
 * relatório; os vales-refeição ficam com prefixo "VR" pra agruparem visualmente.
 */
export const PAY_CHANNEL_LABEL: Record<number, string> = {
  110: "Cupom",
  120: "Carteira 99Food",
  150: "Cartão",
  153: "Dinheiro",
  154: "POS",
  167: "Cartão (pré-autorização)",
  182: "PayPay",
  184: "PayPay",
  190: "99Pay",
  212: "PIX",
  219: "99Food Cuenta",
  229: "NuPay",
  234: "Apple Pay",
  235: "Apple Pay",
  257: "VR Pluxee",
  258: "VR Ticket",
  259: "VR",
  260: "VR Alelo",
  261: "NEQUI",
  262: "Crédito (POS)",
  263: "Débito (POS)",
  264: "VR (POS)",
  272: "Google Pay",
  273: "Google Pay",
  280: "PIX",
  310: "Yape",
  311: "Plin",
  901: "Benefício",
  2008: "Marketing",
}

/**
 * Rótulo final da forma de pagamento. Prioriza o canal (dado mais rico); cai
 * pro texto do import manual; por fim usa o pay_method cru ("1"=online,
 * "2"=dinheiro). Canal online desconhecido vira "Online" (bucket que a gente
 * refina quando a 99 mandar a lista de códigos).
 */
export function formaPagamentoLabel(input: {
  payChannel?: number | null
  formaPagamentoText?: string | null
}): string {
  const { payChannel } = input
  if (payChannel != null && PAY_CHANNEL_LABEL[payChannel]) {
    return PAY_CHANNEL_LABEL[payChannel]
  }

  const text = (input.formaPagamentoText ?? "").trim()
  const low = text.toLowerCase()
  if (low.includes("dinheiro")) return "Dinheiro"
  if (low.includes("online")) return "Online"

  // Webhook cru: pay_method "1"=online, "2"=dinheiro.
  if (text === "2") return "Dinheiro"
  if (text === "1") return "Online"

  // Canal presente mas ainda não mapeado → é online (pay_method=1 nesses casos).
  if (payChannel != null) return "Online"

  return text || "Outros"
}
