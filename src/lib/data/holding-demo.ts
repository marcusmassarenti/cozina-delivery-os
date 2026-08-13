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
 * Quem enxerga o balão de suporte. Desde 13/08/2026: TODO CLIENTE.
 *
 * Nasceu restrito à demo porque o painel onde a equipe responde ainda não
 * existia — cliente clicando em "falar com uma pessoa" e caindo no vazio é
 * pior que não ter chat. Com o painel e os avisos no ar, o motivo da trava
 * acabou, então o padrão passa a ser liberado.
 *
 * `SUPORTE_CHAT_HOLDINGS` continua valendo, mas agora RESTRINGE: uma lista de
 * ids separados por vírgula limita o balão a eles (a demo entra sempre). Vazio
 * ou `*` = todo mundo. Continua sendo env var e não flag no código porque
 * fechar o chat às pressas — se um dia isso for preciso — não deveria esperar
 * um deploy.
 */
export function podeVerSuporte(holdingId: string | null): boolean {
  if (!holdingId) return false
  const cfg = (process.env.SUPORTE_CHAT_HOLDINGS ?? "").trim()
  if (cfg === "" || cfg === "*") return true
  const liberados = new Set(
    cfg.split(",").map((s) => s.trim()).filter(Boolean),
  )
  liberados.add(HOLDING_DEMO_ID)
  return liberados.has(holdingId)
}
