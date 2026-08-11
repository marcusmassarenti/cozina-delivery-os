import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Quanto tempo a loja fica aberta no iFood — programado e realizado.
 *
 * Duas fontes, e a distinção é o ponto:
 *  • PROGRAMADO — `ifood_horarios`, do opening-hours da API. É o que a loja
 *    prometeu ao cliente: 5h por dia, seis dias por semana.
 *  • REALIZADO — `pct_tempo_online`, do relatório de Qualidade. Quanto desse
 *    tempo ela esteve de fato disponível.
 *
 * Mostrar só o programado esconde a loja que fecha sozinha no meio do turno;
 * mostrar só o percentual esconde a loja que programou pouco e cumpriu 100%.
 * A conta que interessa é a multiplicação das duas.
 */

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const

export type TurnoDia = {
  dow: number
  rotulo: string
  /** "18:00" */
  inicio: string
  /** "23:00" — pode passar da meia-noite. */
  fim: string
  minutos: number
}

export type HorariosDaLoja = {
  turnos: TurnoDia[]
  /** Horas programadas por semana. */
  horasSemana: number
  /** Média por dia que ABRE (não pelos 7 dias — isso diluiria). */
  horasPorDiaAberto: number
  /** Dias da semana sem nenhum turno. */
  diasFechados: { dow: number; rotulo: string }[]
  /** % do tempo programado em que esteve online, do relatório de Qualidade. */
  pctOnline: number | null
  /** Horas efetivas por semana = programado × %online. Null sem o relatório. */
  horasEfetivasSemana: number | null
  sincronizadoEm: string | null
}

const hhmm = (t: string) => t.slice(0, 5)

function somaHora(inicio: string, minutos: number): string {
  const [h, m] = inicio.split(":").map(Number)
  const total = (h ?? 0) * 60 + (m ?? 0) + minutos
  const hh = Math.floor(total / 60) % 24
  const mm = total % 60
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

export async function getHorariosDaLoja(
  unitId: string,
): Promise<HorariosDaLoja | null> {
  const admin = createAdminClient()

  const { data } = await admin
    .from("ifood_horarios")
    .select("dow, hora_inicio, duracao_min, sincronizado_em")
    .eq("unit_id", unitId)
    .order("dow")
    .order("hora_inicio")

  const linhas = (data ?? []) as {
    dow: number
    hora_inicio: string
    duracao_min: number
    sincronizado_em: string
  }[]
  if (linhas.length === 0) return null

  const turnos: TurnoDia[] = linhas.map((l) => ({
    dow: l.dow,
    rotulo: DIAS[l.dow] ?? "?",
    inicio: hhmm(l.hora_inicio),
    fim: somaHora(l.hora_inicio, l.duracao_min),
    minutos: l.duracao_min,
  }))

  const minutosSemana = turnos.reduce((a, t) => a + t.minutos, 0)
  const diasQueAbrem = new Set(turnos.map((t) => t.dow))
  const diasFechados = [0, 1, 2, 3, 4, 5, 6]
    .filter((d) => !diasQueAbrem.has(d))
    .map((d) => ({ dow: d, rotulo: DIAS[d] ?? "?" }))

  // O % online mais recente que existir. Não filtra por período: o relatório
  // de Qualidade é importado à mão e pode estar semanas atrás — melhor mostrar
  // o último com a data do que não mostrar nada.
  const { data: op } = await admin
    .from("ifood_operacao_periodo")
    .select("pct_tempo_online, period_end")
    .eq("unit_id", unitId)
    .not("pct_tempo_online", "is", null)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle()

  const pctOnline = op ? Number((op as { pct_tempo_online: number }).pct_tempo_online) : null
  const horasSemana = minutosSemana / 60

  return {
    turnos,
    horasSemana,
    horasPorDiaAberto: diasQueAbrem.size > 0 ? horasSemana / diasQueAbrem.size : 0,
    diasFechados,
    pctOnline,
    horasEfetivasSemana: pctOnline == null ? null : (horasSemana * pctOnline) / 100,
    sincronizadoEm: linhas[0]?.sincronizado_em ?? null,
  }
}

/**
 * Dias em que cada loja NÃO abre, pra rede inteira.
 *
 * É o que substitui o chute do relatório de dia da semana, que marcava "não
 * opera" quando o dia ficava abaixo de 15% da média diária. A heurística
 * acertava a Hortolândia (1 pedido em 13 segundas) mas erraria numa loja que
 * abre e vende pouco.
 */
export async function getDiasFechadosPorLoja(
  unitIds: string[],
): Promise<Map<string, Set<number>>> {
  const out = new Map<string, Set<number>>()
  if (unitIds.length === 0) return out

  const admin = createAdminClient()
  const { data } = await admin
    .from("ifood_horarios")
    .select("unit_id, dow")
    .in("unit_id", unitIds)

  const abrem = new Map<string, Set<number>>()
  for (const l of (data ?? []) as { unit_id: string; dow: number }[]) {
    const s = abrem.get(l.unit_id) ?? new Set<number>()
    s.add(l.dow)
    abrem.set(l.unit_id, s)
  }

  // Só entra loja que TEM horário sincronizado. Sem isso, "nenhum turno"
  // viraria "fechada todos os dias" — e a tela diria que a loja não abre nunca
  // quando na verdade a gente é que não perguntou.
  for (const [unitId, diasAbertos] of abrem) {
    out.set(
      unitId,
      new Set([0, 1, 2, 3, 4, 5, 6].filter((d) => !diasAbertos.has(d))),
    )
  }
  return out
}

export type HorariosDaRede = {
  lojas: number
  /** Média de horas programadas por semana entre as lojas com horário. */
  horasSemanaMedia: number
  /** Lojas que não abrem em algum dia, com quais dias. */
  fechamJunto: { code: string; name: string; dias: string[] }[]
  /** Média do % de tempo online, das lojas que têm o relatório de Qualidade. */
  pctOnlineMedio: number | null
  lojasComOnline: number
}

/**
 * O mesmo retrato, para a rede — é o que a tela de Pedidos mostra.
 *
 * A média de horas é entre as lojas QUE TÊM horário sincronizado, não entre
 * todas: loja sem horário puxaria a média pra baixo como se abrisse zero hora.
 */
export async function getHorariosDaRede(
  unitIds: string[],
): Promise<HorariosDaRede | null> {
  if (unitIds.length === 0) return null
  const admin = createAdminClient()

  const { data } = await admin
    .from("ifood_horarios")
    .select("unit_id, dow, duracao_min")
    .in("unit_id", unitIds)
  const linhas = (data ?? []) as {
    unit_id: string
    dow: number
    duracao_min: number
  }[]
  if (linhas.length === 0) return null

  const porLoja = new Map<string, { min: number; dias: Set<number> }>()
  for (const l of linhas) {
    const a = porLoja.get(l.unit_id) ?? { min: 0, dias: new Set<number>() }
    a.min += l.duracao_min
    a.dias.add(l.dow)
    porLoja.set(l.unit_id, a)
  }

  const { data: us } = await admin
    .from("units")
    .select("id, code, name")
    .in("id", [...porLoja.keys()])
  const unidade = new Map(
    ((us ?? []) as { id: string; code: string; name: string }[]).map((u) => [
      u.id,
      u,
    ]),
  )

  const fechamJunto = [...porLoja.entries()]
    .filter(([, v]) => v.dias.size < 7)
    .map(([id, v]) => ({
      code: unidade.get(id)?.code ?? "?",
      name: unidade.get(id)?.name ?? "(loja)",
      dias: [0, 1, 2, 3, 4, 5, 6]
        .filter((d) => !v.dias.has(d))
        .map((d) => DIAS[d] ?? "?"),
    }))
    .sort((a, b) => b.dias.length - a.dias.length || a.code.localeCompare(b.code))

  const { data: ops } = await admin
    .from("ifood_operacao_periodo")
    .select("unit_id, pct_tempo_online")
    .in("unit_id", [...porLoja.keys()])
    .not("pct_tempo_online", "is", null)
  const pcts = ((ops ?? []) as { pct_tempo_online: number }[]).map((o) =>
    Number(o.pct_tempo_online),
  )

  const minutosTotais = [...porLoja.values()].reduce((a, v) => a + v.min, 0)
  return {
    lojas: porLoja.size,
    horasSemanaMedia: minutosTotais / 60 / porLoja.size,
    fechamJunto,
    pctOnlineMedio:
      pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
    lojasComOnline: pcts.length,
  }
}
