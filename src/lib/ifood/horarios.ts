/**
 * Horário de funcionamento programado — GET /merchant/v1.0/merchants/{id}/opening-hours
 *
 * Funciona com o app que JÁ temos homologado (módulo Merchant). Não depende do
 * módulo Order, que exigiria assumir a operação do pedido — confirmado na
 * documentação e nos 403 que os endpoints de Order devolvem pro nosso app.
 *
 * A API responde:
 *   { storeId, shifts: [{ id, dayOfWeek: "MONDAY", start: "18:00:00",
 *                         duration: 300 }] }
 *
 * `duration` é em MINUTOS e pode passar da meia-noite (um turno de 18h com 480
 * min fecha às 2h do dia seguinte). Guardamos como veio: quem exibe decide se
 * mostra "18:00–02:00" ou só o total de horas.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { lojasIfoodParaSync } from "@/lib/ifood/lojas-sync"
import { fetchIfood } from "./client"

/** MONDAY → 1, igual ao extract(dow) do Postgres (0=domingo). */
const DOW: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
}

type OpeningHours = {
  storeId?: string
  shifts?: {
    id?: string
    dayOfWeek?: string
    start?: string
    duration?: number
  }[]
}

export type ResultadoHorarios = {
  lojas: number
  turnos: number
  puladas: { loja: string; motivo: string }[]
}

export async function syncIfoodHorarios(
  unitIds: string[] | null,
): Promise<ResultadoHorarios> {
  const admin = createAdminClient()
  const out: ResultadoHorarios = { lojas: 0, turnos: 0, puladas: [] }

  const vinculos = await lojasIfoodParaSync(unitIds)

  for (const v of vinculos) {
    const nome = `#${v.code} ${v.name}`
    const r = await fetchIfood<OpeningHours>({
      path: `/merchant/v1.0/merchants/${encodeURIComponent(v.merchantId)}/opening-hours`,
      method: "GET",
      responseType: "json",
      merchantId: v.merchantId,
      endpointLabel: "GET /merchant/v1.0/merchants/{id}/opening-hours",
    })

    if (!r.ok || !r.data?.shifts) {
      out.puladas.push({ loja: nome, motivo: `HTTP ${r.status}` })
      continue
    }

    const linhas = r.data.shifts
      .map((s) => {
        const dow = DOW[String(s.dayOfWeek ?? "").toUpperCase()]
        if (dow == null || !s.start || !s.duration) return null
        return {
          unit_id: v.unitId,
          dow,
          hora_inicio: s.start,
          duracao_min: Math.round(s.duration),
          shift_id: s.id ?? null,
          sincronizado_em: new Date().toISOString(),
        }
      })
      .filter((x): x is NonNullable<typeof x> => x != null)

    // Apaga e regrava a loja inteira. O upsert sozinho não serve: turno que a
    // loja REMOVEU no portal continuaria aqui pra sempre, e "abre segunda"
    // errado é pior que não saber — a tela usaria isso pra dizer que a loja
    // não abriu num dia em que ela nem opera mais.
    await admin.from("ifood_horarios").delete().eq("unit_id", v.unitId)
    if (linhas.length > 0) {
      const { error } = await admin.from("ifood_horarios").insert(linhas)
      if (error) {
        out.puladas.push({ loja: nome, motivo: error.message })
        continue
      }
    }
    out.lojas++
    out.turnos += linhas.length
  }

  return out
}
