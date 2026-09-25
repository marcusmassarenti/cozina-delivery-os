import { createAdminClient } from "@/lib/supabase/admin"
import { getVisibleUnits } from "@/lib/data/units"
import {
  getUnidadesSomenteLeitura,
  getVerComoHoldingId,
  userCan,
} from "@/lib/auth/permissions"

import { RespondidasAutoLista, type RespondidaAuto } from "./respondidas-auto-lista"

/**
 * "Respondidas automaticamente" — o que a máquina publicou em nome da loja,
 * e onde o cliente diz se ficou bom (Marcus, 25/09/26: "como ele sabe que
 * está respondendo automaticamente? … alguma forma de avaliar as nossas
 * respostas para ir melhorando").
 *
 * Últimos 30 dias, só das lojas do próprio cliente (loja emprestada fica de
 * fora: não é ele quem responde por ela). Sem nenhuma resposta automática, o
 * bloco não aparece.
 */
export async function RespondidasAutoCard() {
  if (!(await userCan("avaliacoes", "view"))) return null

  const [units, emprestadas, podeEditar, verComo] = await Promise.all([
    getVisibleUnits(),
    getUnidadesSomenteLeitura(),
    userCan("avaliacoes", "edit"),
    getVerComoHoldingId(),
  ])
  const minhas = units.filter((u) => !emprestadas.has(u.id))
  if (minhas.length === 0) return null
  const porId = new Map(minhas.map((u) => [u.id, u]))

  const desde = new Date()
  desde.setDate(desde.getDate() - 30)
  const { data } = await createAdminClient()
    .from("ifood_avaliacoes")
    .select(
      "id, unit_id, nota, comentario, resposta_texto, respondida_em, resposta_feedback, resposta_feedback_texto",
    )
    .in(
      "unit_id",
      minhas.map((u) => u.id),
    )
    .in("resposta_origem", ["ia", "modelo"])
    .gte("respondida_em", desde.toISOString())
    .order("respondida_em", { ascending: false })
    .limit(500)

  const itens: RespondidaAuto[] = (data ?? []).map((r) => {
    const u = porId.get(r.unit_id as string)!
    return {
      id: r.id as string,
      unitId: r.unit_id as string,
      loja: u.name,
      code: u.code,
      nota: Number(r.nota),
      comentario: (r.comentario as string | null)?.trim() || null,
      resposta: String(r.resposta_texto ?? ""),
      respondidaEm: String(r.respondida_em),
      voto: (r.resposta_feedback as 1 | -1 | null) ?? null,
      correcao: (r.resposta_feedback_texto as string | null) ?? null,
    }
  })
  if (itens.length === 0) return null

  return <RespondidasAutoLista itens={itens} podeAvaliar={podeEditar && verComo === null} />
}
