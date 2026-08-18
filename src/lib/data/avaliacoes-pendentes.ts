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

  // ⚠️ MUDOU EM 18/08/26. Antes a fila carregava 3 dias de folga além do prazo,
  // pra vencida não "sumir em silêncio". Na prática virou uma fila cheia de
  // linha com botão Responder que o iFood recusa — trabalho que não existe
  // mais, empurrando pra baixo o que ainda dá pra salvar.
  //
  // O Marcus resolveu melhor: em vez de esconder, MEDIR. A vencida sai da fila
  // e entra na conta de `getPlacarResposta` — perdida vira número, não item de
  // to-do. A preocupação original (perder de vista o que dói) fica atendida por
  // um placar que mostra o tamanho da perda, que é mais honesto que uma linha
  // solta no meio da lista.
  const limite = new Date()
  limite.setDate(limite.getDate() - PRAZO_RESPOSTA_DIAS)

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


export type PlacarResposta = {
  /** Só as com comentário: sem comentário o iFood já publica, nunca abre prazo. */
  respondiveis: number
  respondidas: number
  /** Prazo venceu sem resposta. É o que se perdeu. */
  perdidas: number
  /** Ainda dentro do prazo — o trabalho que existe agora. */
  naFila: number
  /** Respondidas ÷ (respondidas + perdidas). Null enquanto nada fechou prazo. */
  aproveitamento: number | null
}

/**
 * O placar de resposta: quantas foram respondidas e quantas se perderam.
 *
 * ── O QUE ESTE NÚMERO REVELOU (18/08/26) ─────────────────────────────────
 * Desde que o sync por API começou: 96 respondidas contra 463 perdidas. Das
 * que fecharam prazo, 83% foram embora sem resposta — e ninguém sabia, porque
 * a tela só mostrava a fila do momento. Fila é fotografia; placar é o filme.
 *
 * ⚠️ SÓ CONTA AVALIAÇÃO COM COMENTÁRIO. Medimos na base inteira: as 4.203 sem
 * comentário estão TODAS como PUBLISHED, sem exceção — o iFood publica direto
 * e nunca abre janela de resposta. Metê-las no denominador criaria uma perda
 * que não existe e um aproveitamento de 2% que não quer dizer nada.
 *
 * ⚠️ E SÓ O QUE VEIO DA API. O status em português ("PUBLICADA") é do import
 * manual antigo, que nunca teve informação de resposta. Contá-lo jogaria como
 * "perdida" avaliação de antes de existir integração.
 */
export async function getPlacarResposta(
  unitIds: string[] | null,
  desde?: string,
): Promise<PlacarResposta> {
  const admin = createAdminClient()

  let q = admin
    .from("ifood_avaliacoes")
    .select("status_avaliacao, comentario, data_avaliacao")
    .in("status_avaliacao", ["REPLIED", "NOT_REPLIED", "PUBLISHED"])
    .not("comentario", "is", null)
  if (unitIds) q = q.in("unit_id", unitIds)
  if (desde) q = q.gte("data_avaliacao", desde)

  const { data, error } = await q
  if (error) console.error("placar resposta:", error)

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  let respondidas = 0
  let perdidas = 0
  let naFila = 0

  for (const r of data ?? []) {
    if (!String(r.comentario ?? "").trim()) continue
    const status = String(r.status_avaliacao)
    if (status === "REPLIED") {
      respondidas++
      continue
    }
    const d = new Date(String(r.data_avaliacao) + "T00:00:00")
    const dias = Math.round((hoje.getTime() - d.getTime()) / 86_400_000)
    // NOT_REPLIED dentro do prazo ainda é trabalho; fora dele, e qualquer
    // PUBLISHED sem resposta, já foi.
    if (status === "NOT_REPLIED" && dias <= PRAZO_RESPOSTA_DIAS) naFila++
    else perdidas++
  }

  const fechadas = respondidas + perdidas
  return {
    respondiveis: respondidas + perdidas + naFila,
    respondidas,
    perdidas,
    naFila,
    aproveitamento: fechadas > 0 ? respondidas / fechadas : null,
  }
}
