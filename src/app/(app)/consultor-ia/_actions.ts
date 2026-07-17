"use server"

import {
  perguntarConsultor,
  listarConversas,
  getConversaMensagens,
  type ConversaResumo,
} from "@/lib/data/ia-chat"
import type { ChatTurn } from "@/lib/anthropic/client"

export type PerguntarResult =
  | {
      ok: true
      resposta: string
      fonte: "gratis" | "credito"
      conversaId: string
      titulo: string
    }
  | { ok: false; mensagem: string; bloqueado: boolean }

/**
 * Recebe a conversa atual (null = nova) + o histórico e devolve a resposta.
 * `bloqueado` = a cota acabou (a tela mostra o card de comprar +100).
 */
export async function perguntar(
  conversaId: string | null,
  messages: ChatTurn[],
): Promise<PerguntarResult> {
  const r = await perguntarConsultor(conversaId, messages)
  if (r.ok)
    return {
      ok: true,
      resposta: r.resposta,
      fonte: r.fonte,
      conversaId: r.conversaId,
      titulo: r.titulo,
    }
  return { ok: false, mensagem: r.mensagem, bloqueado: r.motivo === "cota" }
}

/** Lista as conversas do usuário (pra lateral). */
export async function carregarConversas(): Promise<ConversaResumo[]> {
  return listarConversas()
}

/** Carrega as mensagens de uma conversa (ao clicar na lateral). */
export async function abrirConversa(conversaId: string): Promise<ChatTurn[]> {
  return getConversaMensagens(conversaId)
}
