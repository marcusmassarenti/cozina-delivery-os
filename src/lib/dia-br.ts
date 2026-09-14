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

/**
 * VENCIMENTO EM FIM DE SEMANA OU FERIADO VALE NO PRÓXIMO DIA ÚTIL.
 *
 * ── POR QUE (Marcus, 14/09/2026) ──────────────────────────────────────────
 * A fatura da DG FOODS venceu num domingo (13/09) e na segunda o sistema já a
 * tratava como atrasada. Conta que vence em dia sem expediente bancário pode
 * ser paga no dia útil seguinte sem multa — avisar ou rebaixar antes é errado.
 *
 * Calendário bancário NACIONAL: sábado, domingo, feriados nacionais fixos,
 * Carnaval (segunda e terça), Sexta-feira Santa e Corpus Christi. Feriado
 * estadual/municipal não entra (varia por cliente).
 *
 * A data GRAVADA não muda — é a do contrato e a do Asaas. Só a pergunta "está
 * atrasado?" usa esta. PONTO ÚNICO: todo lugar que decide atraso chama aqui
 * (status do cliente, cron de vencimento, faturas, régua de e-mail).
 */
const FERIADOS_FIXOS = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"]

function somaDias(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function pascoa(ano: number): string {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
}

const feriadosPorAno = new Map<number, Set<string>>()
function feriados(ano: number): Set<string> {
  let set = feriadosPorAno.get(ano)
  if (!set) {
    const p = pascoa(ano)
    set = new Set([
      ...FERIADOS_FIXOS.map((md) => `${ano}-${md}`),
      somaDias(p, -48), // Carnaval (segunda)
      somaDias(p, -47), // Carnaval (terça)
      somaDias(p, -2), // Sexta-feira Santa
      somaDias(p, 60), // Corpus Christi
    ])
    feriadosPorAno.set(ano, set)
  }
  return set
}

/** Tem expediente bancário nacional nesta data (YYYY-MM-DD)? */
export function ehDiaUtilBR(iso: string): boolean {
  const dia = iso.slice(0, 10)
  const semana = new Date(`${dia}T12:00:00Z`).getUTCDay()
  if (semana === 0 || semana === 6) return false
  return !feriados(Number(dia.slice(0, 4))).has(dia)
}

/** O vencimento que vale: a própria data, ou o próximo dia útil se ela não for. */
export function vencimentoEfetivo(iso: string): string {
  let dia = iso.slice(0, 10)
  for (let i = 0; i < 10 && !ehDiaUtilBR(dia); i++) dia = somaDias(dia, 1)
  return dia
}
