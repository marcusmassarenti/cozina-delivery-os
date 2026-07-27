/**
 * Tipos de estabelecimento do cliente da plataforma.
 *
 * Lista fechada e em UM lugar só: estava duplicada no diálogo de novo cliente
 * e no de edição, com o risco clássico de as duas listas divergirem e o mesmo
 * cliente ser "Franquia" numa tela e "Franqueador" na outra.
 *
 * Serve pra segmentar a base (quem é consultoria vende de um jeito, quem é
 * franqueador de outro) — por isso vale mais uma lista curta e estável do que
 * texto livre.
 */
export const TIPOS_CLIENTE = [
  "Consultoria",
  "Franqueador",
  "Restaurante",
  "Delivery próprio",
  "Outro",
] as const

export type TipoCliente = (typeof TIPOS_CLIENTE)[number]

/**
 * Valores antigos que existiam antes desta lista, mapeados pro equivalente.
 * Sem isso um cliente gravado como "Franquia" sumiria do seletor (nenhuma
 * option casaria) e voltaria pra "—" na primeira edição.
 */
const EQUIVALENTES: Record<string, TipoCliente> = {
  Franquia: "Franqueador",
  franquia: "Franqueador",
  Restaurante: "Restaurante",
  "Delivery proprio": "Delivery próprio",
}

/** Normaliza o que está no banco pro valor exibível na lista. */
export function normalizaTipoCliente(v: string | null): TipoCliente | null {
  if (!v) return null
  const exato = TIPOS_CLIENTE.find((t) => t === v)
  if (exato) return exato
  return EQUIVALENTES[v] ?? null
}
