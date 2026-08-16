/**
 * Os ícones que os blocos de "o que muda pra quem usa" podem usar.
 *
 * ── POR QUE UMA LISTA FECHADA ────────────────────────────────────────────
 * O modelo é editável na tela, e o campo do ícone precisava ser escolhível —
 * mas guardar o NOME de um ícone livre no banco quebraria a proposta em
 * silêncio no dia em que alguém digitasse errado ou a biblioteca renomeasse
 * um. Lista fechada: o que não está aqui cai no ícone neutro.
 *
 * ⚠️ NÃO é `server-only`: o documento é Client Component e desenha os ícones.
 * Só os NOMES vivem aqui; o mapa para os componentes React fica no documento,
 * porque importar 200 KB de ícones num módulo de dados carregaria tudo em
 * qualquer tela que encostasse nele.
 */
export const ICONES_PROPOSTA = [
  { id: "rede", label: "Rede / lojas" },
  { id: "loja", label: "Loja" },
  { id: "dinheiro", label: "Dinheiro" },
  { id: "planilha", label: "Planilha / DRE" },
  { id: "cardapio", label: "Cardápio" },
  { id: "email", label: "E-mail / aviso" },
  { id: "grafico", label: "Gráfico" },
  { id: "relogio", label: "Tempo" },
  { id: "estrela", label: "Avaliação" },
  { id: "alerta", label: "Alerta" },
] as const

export type IconeProposta = (typeof ICONES_PROPOSTA)[number]["id"]

export const ICONE_PADRAO: IconeProposta = "grafico"
