import "server-only"

/**
 * A rede de demonstração — a conta que a gente abre na frente do cliente.
 *
 * As lojas dela são fictícias mas ficam marcadas como CONECTADAS por API
 * (`unit_platforms.api_store_id`, `ninefood_store_links`, install do Cardápio
 * Web), porque é isso que o cliente precisa ver: o sistema no estado final, não
 * no estado de quem ainda sobe planilha. Sem isso a demo abre com "10 de 10
 * lojas ainda dependem de planilha", que é o oposto do que estamos vendendo.
 *
 * ⚠️ E É JUSTAMENTE POR ESTAR "CONECTADA" QUE ELA PRECISA FICAR FORA DO SYNC.
 * Os syncs escolhem loja por esses mesmos campos. Deixar a demo passar faria o
 * cron diário bater na API REAL do iFood e da 99 com 10 merchants que não
 * existem — todo dia, gastando chamada de parceiro, enchendo o log de erro e
 * envenenando o relatório de integridade com 10 lojas eternamente "sem dado".
 *
 * O dado da demo não vem de sync: é semeado no banco e fica parado. Não há o
 * que sincronizar mesmo.
 */
import { createAdminClient } from "@/lib/supabase/admin"

/** Holding da rede "Sabor & Cia (demonstração)". */
export const HOLDING_DEMO_ID =
  process.env.DEMO_HOLDING_ID ?? "de0d0000-0000-4000-8000-000000000001"

export async function idsDeUnidadesDemo(): Promise<Set<string>> {
  const { data, error } = await createAdminClient()
    .from("units")
    .select("id, brands!inner(holding_id)")
    .eq("brands.holding_id", HOLDING_DEMO_ID)
  if (error) {
    // Mesma postura dos outros dois motivos: falha de leitura não muda o
    // comportamento anterior. Aqui isso significa sincronizar a demo por
    // engano — barulho no log, não buraco no dado de cliente pagante.
    console.error("idsDeUnidadesDemo:", error.message)
    return new Set()
  }
  return new Set(((data ?? []) as unknown as { id: string }[]).map((u) => u.id))
}

/**
 * Quem enxerga o balão de suporte hoje.
 *
 * Nasce restrito à rede de demonstração porque o painel onde a EQUIPE responde
 * (bloco 3) ainda não existe: ligar pra todos deixaria o cliente clicar em
 * "falar com uma pessoa" e cair no vazio. Chamado sem ninguém do outro lado é
 * pior que não ter chat.
 *
 * Pra liberar depois, `SUPORTE_CHAT_HOLDINGS`: ids separados por vírgula, ou
 * `*` pra todos. É env var e não flag no código de propósito — liberar não
 * deveria exigir deploy.
 */
export function podeVerSuporte(holdingId: string | null): boolean {
  if (!holdingId) return false
  const cfg = (process.env.SUPORTE_CHAT_HOLDINGS ?? "").trim()
  if (cfg === "*") return true
  const liberados = new Set(
    cfg.split(",").map((s) => s.trim()).filter(Boolean),
  )
  liberados.add(HOLDING_DEMO_ID)
  return liberados.has(holdingId)
}
