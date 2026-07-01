/**
 * Tradução do método de entrega do 99 Food para rótulo amigável.
 *
 * Mesmo caso do pagamento: o webhook orderNew manda `delivery_type` como número
 * cru e a gente salvava direto em ninefood_pedidos.metodo_entrega — então o
 * relatório mostrava "1". Traduzimos aqui, na exibição. O import manual já vem
 * com texto ("Entrega da plataforma", "Retirada na loja") e passa direto.
 *
 * Códigos confirmados nos dados reais: 1 = entrega feita pela logística da 99.
 * Os demais entram quando a 99 mandar a tabela completa (aí é só ampliar o mapa).
 */

/** Códigos de delivery_type que já conhecemos. */
export const DELIVERY_TYPE_LABEL: Record<string, string> = {
  "1": "Entrega da plataforma",
}

export function metodoEntregaLabel(metodo: string | null): string {
  const text = (metodo ?? "").trim()
  if (!text) return "Outros"

  const mapped = DELIVERY_TYPE_LABEL[text]
  if (mapped) return mapped

  // Texto do import manual (tem letra) passa direto; código desconhecido → Outros.
  return /[a-zA-Z]/.test(text) ? text : "Outros"
}
