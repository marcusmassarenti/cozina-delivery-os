import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { textoOuNull } from "@/lib/format"

/**
 * Avaliações do iFood que AINDA aceitam resposta.
 *
 * O prazo é de 5 dias corridos (documentação do iFood, módulo Review v2):
 * passou disso, a avaliação é publicada sem a resposta da loja e o cliente
 * nunca vê o que você escreveu. Por isso esta consulta NÃO respeita o filtro
 * de mês da tela: no dia 1º, a avaliação do dia 28 ainda está no prazo e
 * sumiria de vista justo na hora de agir.
 *
 * Quem manda é o `status_avaliacao`, não a nossa conta de dias:
 *  • NOT_REPLIED — o iFood ainda aceita resposta;
 *  • PUBLISHED / REPLIED / DISCARDED — recusa (409/422).
 * O contador de dias é orientação pra priorizar, não o gate.
 *
 * ⚠️ O status é uma foto do último sync. Uma avaliação sincronizada ontem como
 * NOT_REPLIED pode ter publicado desde então — quem confirma é a API na hora
 * do envio, e a action trata a recusa.
 */

/** Prazo do iFood pra responder, em dias corridos. */
export const PRAZO_RESPOSTA_DIAS = 5

export type AvaliacaoPendente = {
  avaliacaoId: string
  reviewId: string
  unitId: string
  nota: number
  comentario: string | null
  tagsNegativas: string[]
  tagsPositivas: string[]
  dataAvaliacao: string
  /** Dias que ainda restam do prazo. 0 = último dia. Pode vir negativo. */
  diasRestantes: number
}

export async function getAvaliacoesPendentesResposta(
  unitIds: string[] | null,
): Promise<AvaliacaoPendente[]> {
  const admin = createAdminClient()

  // Uma folga além do prazo: avaliação que o iFood ainda marca NOT_REPLIED com
  // 6 ou 7 dias aparece assim mesmo, sinalizada como vencida. Sumir em
  // silêncio esconderia justamente o caso que dói.
  const limite = new Date()
  limite.setDate(limite.getDate() - (PRAZO_RESPOSTA_DIAS + 3))

  let q = admin
    .from("ifood_avaliacoes")
    .select(
      "id, unit_id, review_id, nota, comentario, tags_positivas, tags_negativas, data_avaliacao",
    )
    .eq("status_avaliacao", "NOT_REPLIED")
    .not("review_id", "is", null)
    .is("resposta_texto", null)
    .gte("data_avaliacao", limite.toISOString().slice(0, 10))
    .order("data_avaliacao", { ascending: true })
  if (unitIds) q = q.in("unit_id", unitIds)

  const { data } = await q
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)

  return (data ?? []).map((r) => {
    const d = new Date(String(r.data_avaliacao) + "T00:00:00")
    const dias = Math.round((hoje.getTime() - d.getTime()) / 86_400_000)
    return {
      avaliacaoId: r.id as string,
      reviewId: r.review_id as string,
      unitId: r.unit_id as string,
      nota: Number(r.nota),
      comentario: textoOuNull(r.comentario as string | null),
      tagsPositivas: (r.tags_positivas as string[] | null) ?? [],
      tagsNegativas: (r.tags_negativas as string[] | null) ?? [],
      dataAvaliacao: String(r.data_avaliacao),
      diasRestantes: PRAZO_RESPOSTA_DIAS - dias,
    }
  })
}
