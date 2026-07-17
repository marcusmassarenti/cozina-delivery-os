"use server"

import { perguntarConsultor } from "@/lib/data/ia-chat"
import type { ChatTurn } from "@/lib/anthropic/client"

export type PerguntarResult =
  | { ok: true; resposta: string; fonte: "gratis" | "credito" }
  | { ok: false; mensagem: string; bloqueado: boolean }

/**
 * Recebe o histórico da conversa e devolve a resposta do Consultor.
 * `bloqueado` = a cota acabou (a tela mostra o card de comprar +100).
 */
export async function perguntar(
  messages: ChatTurn[],
): Promise<PerguntarResult> {
  const r = await perguntarConsultor(messages)
  if (r.ok) return { ok: true, resposta: r.resposta, fonte: r.fonte }
  return { ok: false, mensagem: r.mensagem, bloqueado: r.motivo === "cota" }
}
