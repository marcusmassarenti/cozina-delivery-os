/**
 * A virada do dia é em BRASÍLIA, não em UTC.
 *
 * ── O BUG QUE ISSO CONSERTA (16/08/2026) ──────────────────────────────────
 * As rotinas que perguntam "esta loja já recebeu o extrato HOJE?" montavam o
 * início do dia assim:
 *
 *   new Date(d.getFullYear(), d.getMonth(), d.getDate())
 *
 * Isso usa o fuso do PROCESSO. No meu Mac é Brasília e parece certo; na
 * Vercel o processo roda em UTC, e aí "00:00 de hoje" virava 21:00 de ontem
 * no horário de Brasília.
 *
 * O efeito medido: às 00h08 UTC (21h08 de Brasília) o dia "virava", as 74
 * lojas entravam na fila de uma vez, o coletor baixava tudo em 12 minutos —
 * e depois considerava todas frescas pelas 24 horas seguintes. O sistema
 * inteiro se acomodou num único refresh diário às 21h. Às 9h da manhã de
 * 16/08 o painel mostrava dado de 21h da véspera e o coletor estava ocioso,
 * com fila 4, "achando" que já tinha trabalhado hoje.
 *
 * Não era perda de dado — era ATRASO SILENCIOSO de meio dia, bem em cima da
 * madrugada, que é justamente quando o delivery vende. E, de quebra, empurrava
 * o relatório de saúde pra noite: ele espera a rotina fechar, e a rotina só
 * fechava depois das 21h.
 *
 * ⚠️ NÃO trocar por `new Date().setHours(0,0,0,0)` — é a mesma armadilha com
 * outro nome. O fuso precisa ser explícito.
 */

const FUSO = "America/Sao_Paulo"

/** Hoje em Brasília, no formato YYYY-MM-DD. */
export function hojeBR(agora = new Date()): string {
  return agora.toLocaleDateString("en-CA", { timeZone: FUSO })
}

/**
 * Instante em que o dia de Brasília começou, em ISO (UTC).
 *
 * `-03:00` é fixo de propósito: o Brasil não tem horário de verão desde 2019.
 * Se voltar, este é o ponto único a mudar — e o teste é comparar com
 * `Intl.DateTimeFormat` em janeiro.
 */
export function inicioDoDiaBR(agora = new Date()): string {
  return new Date(`${hojeBR(agora)}T00:00:00-03:00`).toISOString()
}
