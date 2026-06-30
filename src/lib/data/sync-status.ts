/**
 * "Sincronizado até" — a data mais recente de dado por plataforma, pra mostrar
 * num alerta o quão fresco está cada canal.
 *  - iFood : última data_fato_gerador da Conciliação (financeiro liquidado).
 *  - 99    : última business_date do extrato da API (ninefood_api_bill).
 *  - Keeta : última data da Loja diária (keeta_daily_loja).
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export type SyncStatus = {
  ifood: string | null // YYYY-MM-DD
  ninefood: string | null
  keeta: string | null
}

function toDay(v: unknown): string | null {
  if (!v) return null
  return String(v).slice(0, 10)
}

export async function getLastSyncedDates(): Promise<SyncStatus> {
  const admin = createAdminClient()
  const [ifood, nine, keeta] = await Promise.all([
    admin
      .from("ifood_financeiro_lancamentos")
      .select("data_fato_gerador")
      .not("data_fato_gerador", "is", null)
      .order("data_fato_gerador", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("ninefood_api_bill")
      .select("business_date")
      .not("business_date", "is", null)
      .order("business_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("keeta_daily_loja")
      .select("data")
      .not("data", "is", null)
      .order("data", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  return {
    ifood: toDay(
      (ifood.data as { data_fato_gerador?: string } | null)?.data_fato_gerador,
    ),
    ninefood: toDay(
      (nine.data as { business_date?: string } | null)?.business_date,
    ),
    keeta: toDay((keeta.data as { data?: string } | null)?.data),
  }
}
