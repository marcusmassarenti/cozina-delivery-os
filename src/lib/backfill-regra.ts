import "server-only"

/**
 * A REGRA DO BACKFILL AO VINCULAR — vale para as quatro plataformas.
 *
 * ── DEFINIDA PELO MARCUS EM 18/08/26 ─────────────────────────────────────
 * "loja vinculada tem que rodar backfill imediato de jan até a data corrente.
 *  isso de todas as plataformas. se 99 nao puder, do limite mais antigo ate a
 *  data da conexão."
 *
 * Três exigências, e cada uma nasceu de um jeito diferente de falhar:
 *
 *  1. IMEDIATO. Loja que acabou de conectar não espera janela de cron. O
 *     cliente está olhando a tela agora, e a tela está vazia agora. A CR Poços
 *     ficou parada esperando um intervalo de 6h sem nunca ter tentado de
 *     verdade — espaçar RETENTATIVA é proteção, espaçar a ESTREIA é atraso.
 *
 *  2. DE JANEIRO ATÉ HOJE, sem buraco no meio. A mesma CR Poços saiu da fila
 *     com fevereiro e julho apenas, e foi carimbada como concluída: o
 *     histórico ficou pela metade e ninguém soube, porque falta de dado não
 *     avisa que existe.
 *
 *  3. TODAS AS PLATAFORMAS. Cada uma conecta de um jeito e por isso cada uma
 *     tinha a sua própria lacuna. A regra é a mesma; o que muda é o teto.
 *
 * ── O TETO DE CADA PLATAFORMA ────────────────────────────────────────────
 * Nem toda API guarda desde janeiro, e prometer o que a fonte não tem geraria
 * "buraco" permanente na tela:
 *
 *  • iFood — desde janeiro. Extrato ASSÍNCRONO: a chamada só PEDE, o coletor
 *    busca depois. Por isso "0 linhas" na primeira passada é normal, e por
 *    isso a conclusão só pode ser carimbada quando todos os meses chegarem.
 *  • 99 Food — o histórico da API não alcança janeiro. Medido em 18/08/26:
 *    jan a mai devolveram erro nas 9 lojas, junho em diante veio. Então vale
 *    "do limite mais antigo até a data da conexão", que na prática é junho.
 *  • Cardápio Web — desde a instalação; não existe dado anterior a ela.
 *  • Keeta — sem API. Só planilha, e portanto fora desta regra.
 */

/** Primeiro mês que a regra tenta, quando a plataforma alcança. */
export const BACKFILL_DESDE = { year: 2026, month: 1 } as const

export type PlataformaBackfill = "ifood" | "99food" | "cardapioweb" | "keeta"

/**
 * Os meses a puxar para uma plataforma, do mais antigo ao mês corrente.
 *
 * `conectadaEm` limita o 99: o pedido do Marcus é ir até a DATA DA CONEXÃO
 * quando a fonte não alcança janeiro — não faz sentido pedir mês em que a
 * loja ainda não era nossa.
 */
export function mesesDoBackfill(
  plataforma: PlataformaBackfill,
  conectadaEm?: Date,
): { year: number; month: number }[] {
  if (plataforma === "keeta") return []

  const hoje = new Date()
  let inicio = new Date(BACKFILL_DESDE.year, BACKFILL_DESDE.month - 1, 1)

  if (plataforma === "99food") {
    // Teto MÓVEL, não fixo. A Bill API aceita ~3 meses corridos pra trás
    // ("errno 110004: Query period exceeds limit. You can query up to 3
    // months of data"). A versão anterior fixava junho/26 — medição de
    // agosto, correta EM agosto — e apodreceu em 01/09/26: junho saiu da
    // janela, o backfill das lojas novas do Le Brunch bateu 110004 pra
    // sempre e a fila travou nas mesmas 2 lojas (head-of-line de novo).
    // Janela = mês corrente + 2 anteriores, que é o que a API entrega hoje.
    const limite99 = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1)
    if (limite99 > inicio) inicio = limite99
  }
  if (plataforma === "cardapioweb" && conectadaEm) {
    const inst = new Date(conectadaEm.getFullYear(), conectadaEm.getMonth(), 1)
    if (inst > inicio) inicio = inst
  }

  const out: { year: number; month: number }[] = []
  for (
    const d = new Date(inicio);
    d <= hoje;
    d.setMonth(d.getMonth() + 1)
  ) {
    out.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  return out
}
