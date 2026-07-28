/**
 * Registro de quem mexeu em plano, cobrança e liberações de cliente.
 *
 * Antes nada disso deixava rastro: dava pra trocar o plano de um cliente ou
 * marcá-lo como pago sem autor nem data. Quando um valor sai errado — e nesta
 * base já saiu — não havia como reconstruir o que aconteceu, e a conversa vira
 * memória contra memória.
 *
 * Regra prática: registrar o que MUDA dinheiro ou acesso. Leitura não entra,
 * senão a tabela vira lixo e ninguém acha o que importa.
 */
import "server-only"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export type AcaoAuditada =
  | "plano.alterado"
  | "cobranca.alterada"
  | "pagamento.registrado"
  | "pagamento.removido"
  | "cliente.criado"
  | "cliente.removido"
  | "conta_interna.alterada"
  | "convite_asaas.alterado"
  | "assinatura.valor_sincronizado"
  | "nino.degustacao_alterada"
  | "trial.iniciado"
  | "indicador.alterado"
  | "comissao.paga"

/**
 * Grava uma entrada no log. Nunca lança: auditoria que quebra a operação é
 * pior que auditoria ausente — quem chamou já fez a mudança de verdade.
 */
export async function auditar(
  acao: AcaoAuditada,
  holdingId: string | null,
  detalhe?: Record<string, unknown>,
): Promise<void> {
  try {
    let actorId: string | null = null
    let actorEmail: string | null = null
    try {
      const supabase = await createClient()
      const { data } = await supabase.auth.getUser()
      actorId = data.user?.id ?? null
      actorEmail = data.user?.email ?? null
    } catch {
      // Sem sessão (cron, webhook) — fica registrado como automático.
    }

    await createAdminClient()
      .from("platform_audit_log")
      .insert({
        holding_id: holdingId,
        actor_id: actorId,
        actor_email: actorEmail ?? (actorId ? null : "sistema"),
        acao,
        detalhe: detalhe ?? null,
      })
  } catch (e) {
    console.error("auditar:", e)
  }
}

export type EntradaAuditoria = {
  id: string
  acao: string
  autor: string
  detalhe: Record<string, unknown> | null
  em: string
}

/** Histórico de mudanças de um cliente, da mais recente pra mais antiga. */
export async function getAuditoriaDoCliente(
  holdingId: string,
  limite = 30,
): Promise<EntradaAuditoria[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("platform_audit_log")
    .select("id, acao, actor_email, detalhe, criado_em")
    .eq("holding_id", holdingId)
    .order("criado_em", { ascending: false })
    .limit(limite)

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    acao: String(r.acao),
    autor: (r.actor_email as string | null) ?? "sistema",
    detalhe: (r.detalhe as Record<string, unknown> | null) ?? null,
    em: String(r.criado_em),
  }))
}

export { ACAO_LABEL } from "@/lib/auditoria-labels"
