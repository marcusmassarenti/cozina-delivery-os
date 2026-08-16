import "server-only"

/**
 * Lojas de cliente ENCERRADO — as que o sync para de puxar NA HORA.
 *
 * ⚠️ É DIFERENTE de `unidades-sem-assinatura`, e a diferença é o prazo.
 *
 *   suspenso por cobrança  → 7 dias de tolerância antes de cortar
 *   encerrado              → corta imediatamente
 *
 * Os 7 dias existem pra proteger quem só deixou o cartão vencer: parar no
 * primeiro dia pune o distraído e abre buraco no histórico (no iFood dá pra
 * fazer backfill quando volta, mas a Keeta é planilha e o dia perdido não
 * volta). Essa folga só faz sentido pra quem PODE voltar.
 *
 * Quando o cliente avisa que saiu, não há a quem proteger: esperar a semana é
 * queimar chamada de API das plataformas e execução na Vercel pra buscar dado
 * que ninguém vai abrir. O caso que criou esta regra foi o joao nilson
 * (Cardápio Web, 16/ago/26) — trial vencido em 10/08, não seguiu, e o sync
 * continuaria batendo na API deles até 18/08.
 *
 * NÃO APAGA NADA. O histórico fica no banco e as telas continuam abrindo: se
 * o cliente voltar, é só limpar `encerrado_em` e o sync retoma. O que para é
 * ir buscar dado novo.
 */
import { createAdminClient } from "@/lib/supabase/admin"

export async function idsDeUnidadesEncerradas(): Promise<Set<string>> {
  const vazio = new Set<string>()
  const admin = createAdminClient()

  const { data: hs, error } = await admin
    .from("holdings")
    .select("id")
    .not("encerrado_em", "is", null)
  if (error) {
    // Mesma postura dos outros filtros: erro de leitura NÃO pode cortar o sync
    // de ninguém. Na dúvida sincroniza demais — desperdício é recuperável,
    // buraco no dado de cliente pagante não é.
    console.error("idsDeUnidadesEncerradas:", error.message)
    return vazio
  }

  const encerradas = ((hs ?? []) as { id: string }[]).map((h) => h.id)
  if (encerradas.length === 0) return vazio

  const { data: us } = await admin
    .from("units")
    .select("id, brands!inner(holding_id)")
    .in("brands.holding_id", encerradas)

  const ids = new Set(((us ?? []) as unknown as { id: string }[]).map((u) => u.id))
  if (ids.size > 0) {
    console.log(`[sync] ${ids.size} loja(s) fora do sync: cliente encerrado`)
  }
  return ids
}
