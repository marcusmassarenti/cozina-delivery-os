/**
 * Etiquetas de cache compartilhadas entre quem LÊ e quem ESCREVE.
 *
 * Ficam num arquivo só porque o par tem que casar: se a leitura marca uma tag
 * e a gravação derruba outra, o cache serve número velho pra sempre e ninguém
 * percebe — que é exatamente o tipo de silêncio que já custou caro aqui.
 */

/** Conciliação do iFood: qualquer coisa derivada de ifood_financeiro_lancamentos. */
export const TAG_FINANCEIRO_IFOOD = "ifood-financeiro"
