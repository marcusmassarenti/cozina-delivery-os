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
/**
 * O dia mais antigo que a Bill API do 99 aceita hoje: 90 dias corridos, menos
 * 3 de margem pra janela não escorregar durante uma execução longa.
 *
 * Exportado porque quem monta o intervalo precisa clampar o mês mais antigo
 * por ele — pedir 01/06 quando a janela abre em 06/06 derruba o mês inteiro.
 */
export function primeiroDia99(hoje = new Date()): Date {
  const d = new Date(hoje)
  d.setDate(d.getDate() - (90 - 3))
  d.setHours(0, 0, 0, 0)
  return d
}

export function mesesDoBackfill(
  plataforma: PlataformaBackfill,
  conectadaEm?: Date,
): { year: number; month: number }[] {
  if (plataforma === "keeta") return []

  const hoje = new Date()
  let inicio = new Date(BACKFILL_DESDE.year, BACKFILL_DESDE.month - 1, 1)

  if (plataforma === "99food") {
    /* Teto MÓVEL, medido dia a dia — e a medição corrigiu a versão anterior.
     *
     * A Bill API recusa com "errno 110004: You can query up to 3 months of
     * data", e "3 meses" ali são 90 DIAS CORRIDOS, não três meses de
     * calendário. Provado em 04/09/26 pedindo um dia por vez: 05/06 recusa,
     * 06/06 responde — exatamente 90 dias antes.
     *
     * A regra anterior usava "mês corrente + 2 anteriores" (1º de julho, em
     * setembro) por segurança. Só que isso jogava fora 25 dias de junho que a
     * API entregava — e foi o Marcus que pegou: "se libera 3 e estamos em
     * setembro, não deveria ser jun jul e ago?". Devia mesmo.
     *
     * A margem de 3 dias existe porque a janela ANDA: um backfill longo que
     * começasse colado no limite veria o dia mais antigo cair fora no meio da
     * execução, e o 110004 volta a travar a fila (head-of-line, 01/09/26).
     *
     * ⚠️ O mês mais antigo NÃO começa no dia 1 — quem monta o intervalo tem
     * de clampar pelo `primeiroDia99` abaixo, senão a chamada de junho vai
     * de 01/06 e é recusada inteira, levando junho junto. */
    const limite99 = primeiroDia99(hoje)
    if (limite99 > inicio) inicio = limite99
  }
  if (plataforma === "cardapioweb" && conectadaEm) {
    const inst = new Date(conectadaEm.getFullYear(), conectadaEm.getMonth(), 1)
    if (inst > inicio) inicio = inst
  }

  /* O laço anda de MÊS em mês, sempre a partir do dia 1.
   *
   * ⚠️ Não usar `inicio` cru aqui. Desde que a janela do 99 virou "90 dias
   * corridos", `inicio` carrega um dia qualquer (09/06, por exemplo) — e um
   * laço que soma mês mantendo o dia 9 pularia o mês corrente sempre que
   * hoje fosse antes do dia 9. Setembro sumiu assim no primeiro teste.
   *
   * O dia só importa pra clampar a PRIMEIRA chamada; quem monta o intervalo
   * usa `primeiroDia99` pra isso. */
  const out: { year: number; month: number }[] = []
  for (
    const d = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
    d <= hoje;
    d.setMonth(d.getMonth() + 1)
  ) {
    out.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  return out
}
