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

/** Códigos de pay_channel que já conhecemos (dados reais + doc da 99). */
export const PAY_CHANNEL_LABEL: Record<number, string> = {
  150: "Cartão",
  212: "PIX",
  280: "PIX",
  259: "VR",
  153: "Dinheiro",
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
