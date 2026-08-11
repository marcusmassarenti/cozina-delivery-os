"use server"

import { revalidatePath } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { getVisibleUnits } from "@/lib/data/units"
import { userCan } from "@/lib/auth/permissions"
import { replyToReview } from "@/lib/ifood/review"
import { RESPOSTA_MAX, RESPOSTA_MIN } from "./_resposta-limites"

export type ResponderState = {
  ok: boolean
  message?: string
}

/**
 * Responde uma avaliação do iFood pelo painel.
 *
 * Só existe pro iFood: a 99 e a Keeta chegam por planilha, e o Cardápio Web não
 * tem endpoint de resposta. Nas outras a tela apenas EXIBE o que a loja já
 * respondeu no portal delas.
 *
 * Três checagens antes de chamar a API, nesta ordem:
 *  1. permissão de escrita no módulo;
 *  2. a loja da avaliação está entre as que o usuário enxerga — sem isso um
 *     franqueado responderia em nome de outra franquia mandando outro id;
 *  3. tamanho do texto, porque o 400 do iFood não diz qual é o limite.
 *
 * Só grava no banco DEPOIS do 2xx. Gravar antes deixaria a tela dizendo
 * "respondido" com o cliente do iFood sem ver resposta nenhuma.
 */
export async function responderAvaliacaoIfood(
  avaliacaoId: string,
  texto: string,
): Promise<ResponderState> {
  // Módulo "avaliacoes", não "relatorios": a tela mora no hub de relatórios,
  // mas o que se faz aqui é escrever no perfil público da loja. Quem só tem
  // leitura de avaliações não deve poder falar em nome dela por estar numa
  // rota de relatório.
  if (!(await userCan("avaliacoes", "edit")))
    return { ok: false, message: "Seu perfil não pode responder avaliações." }

  const t = texto.trim()
  if (t.length < RESPOSTA_MIN)
    return {
      ok: false,
      message: `A resposta precisa de pelo menos ${RESPOSTA_MIN} caracteres.`,
    }
  if (t.length > RESPOSTA_MAX)
    return {
      ok: false,
      message: `A resposta passa de ${RESPOSTA_MAX} caracteres (tem ${t.length}).`,
    }

  const admin = createAdminClient()
  const { data: av } = await admin
    .from("ifood_avaliacoes")
    .select("id, unit_id, review_id, resposta_texto")
    .eq("id", avaliacaoId)
    .maybeSingle()
  if (!av) return { ok: false, message: "Avaliação não encontrada." }
  if (av.resposta_texto)
    return { ok: false, message: "Essa avaliação já foi respondida." }
  if (!av.review_id)
    return {
      ok: false,
      message:
        "Essa avaliação é anterior à conexão com a API e não pode ser respondida por aqui. Responda pelo Portal do Parceiro.",
    }

  const visiveis = await getVisibleUnits()
  if (!visiveis.some((u) => u.id === av.unit_id))
    return { ok: false, message: "Você não tem acesso a essa loja." }

  const { data: vinc } = await admin
    .from("unit_platforms")
    .select("api_store_id")
    .eq("unit_id", av.unit_id)
    .eq("platform", "ifood")
    .not("api_store_id", "is", null)
    .maybeSingle()
  if (!vinc?.api_store_id)
    return { ok: false, message: "Essa loja não está conectada à API do iFood." }

  const r = await replyToReview(vinc.api_store_id, av.review_id, t)
  if (!r.ok) {
    // 422 é o caso previsto: alguém respondeu pelo portal no meio do caminho,
    // ou a avaliação saiu da janela em que o iFood aceita resposta.
    if (r.status === 422)
      return {
        ok: false,
        message:
          "O iFood recusou: essa avaliação já foi respondida ou não aceita mais resposta.",
      }
    return {
      ok: false,
      message: `O iFood recusou a resposta (${r.status}). Tente pelo Portal do Parceiro.`,
    }
  }

  await admin
    .from("ifood_avaliacoes")
    .update({
      resposta_texto: t,
      // Nosso relógio, não o do iFood — o sync sobrescreve com o `createdAt`
      // oficial na próxima passada.
      respondida_em: new Date().toISOString(),
      status_avaliacao: "REPLIED",
    })
    .eq("id", av.id)

  revalidatePath("/relatorios/avaliacoes-negativos")
  return { ok: true, message: "Resposta enviada." }
}
