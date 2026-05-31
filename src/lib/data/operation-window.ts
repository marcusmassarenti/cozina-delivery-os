/**
 * Janela de operação de uma loja dentro de um mês.
 *
 * Recorta o mês pelo período em que a loja realmente operou (entre a
 * inauguração e o encerramento, e nunca depois de hoje). Usado pra Cobertura
 * "inteligente": meses antes de inaugurar / depois de fechar viram N/A (não
 * contam como lacuna) e o "esperado" de dias passa a ser só os dias da janela.
 *
 * Pura — sem dependência de DB. Pode rodar no server ou no client.
 */

export type UnitOperacao = {
  dataInauguracao: string | null // "YYYY-MM-DD"
  dataEncerramento: string | null // "YYYY-MM-DD" (null = ativa)
}

export type MonthWindow = {
  /** A loja operou em pelo menos 1 dia desse mês? Se false → célula N/A. */
  applicable: boolean
  /** Dias do calendário dentro da janela de operação ∩ mês (até hoje). */
  operatingDays: number
  /** Total de dias do mês (referência). */
  diasNoMes: number
}

function parseYmd(s: string | null | undefined): Date | null {
  if (!s) return null
  const [y, m, d] = s.slice(0, 10).split("-").map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/**
 * Calcula a janela de operação de (loja, ano, mês).
 *  - Sem data de inauguração → assume que sempre operou (comportamento atual).
 *  - Sem data de encerramento → opera até hoje.
 *  - Nunca conta dias no futuro (cap em hoje), o que reduz o esperado do mês
 *    corrente naturalmente.
 */
export function monthOperationWindow(
  year: number,
  month: number, // 1-12
  op: UnitOperacao,
  today: Date = new Date(),
): MonthWindow {
  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 0) // último dia do mês
  const diasNoMes = monthEnd.getDate()

  const inaug = parseYmd(op.dataInauguracao)
  const encer = parseYmd(op.dataEncerramento)
  const todayMid = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  )

  // Limite inferior: maior entre início do mês e inauguração.
  const start = inaug && inaug > monthStart ? inaug : monthStart
  // Limite superior: menor entre fim do mês, encerramento e hoje.
  let end = monthEnd
  if (encer && encer < end) end = encer
  if (todayMid < end) end = todayMid

  if (start > end) return { applicable: false, operatingDays: 0, diasNoMes }
  const operatingDays =
    Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  return { applicable: true, operatingDays: Math.max(0, operatingDays), diasNoMes }
}
