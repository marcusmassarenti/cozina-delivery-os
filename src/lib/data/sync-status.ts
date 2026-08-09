/**
 * "Sincronizado até" — a data mais recente de dado por plataforma, pra mostrar
 * num alerta o quão fresco está cada canal.
 *  - iFood : última data_fato_gerador da Conciliação (financeiro liquidado).
 *  - 99    : última business_date do extrato da API (ninefood_api_bill).
 *  - Keeta : última data da Loja diária (keeta_daily_loja).
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getAccessibleUnitIds } from "@/lib/auth/roles"

/** UUID que não existe — filtro "nenhuma loja". Array vazio no PostgREST vira
 *  "sem filtro", que traria o sistema inteiro. */
const SEM_LOJA = "00000000-0000-0000-0000-000000000000"

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

  // Sem filtro de loja, esta função devolvia a data mais recente do SISTEMA
  // INTEIRO. Um cliente cujo iFood parou em 20/07 lia "sincronizado até
  // 08/08" porque OUTRA empresa tinha sincronizado hoje -- e o alerta que
  // existe justamente pra denunciar canal parado dizia que estava tudo em dia.
  // Vale pra tela de Acompanhamento e pro Nino AI, que consome isto.
  const allowed = await getAccessibleUnitIds()
  const lojas = allowed === null ? null : allowed.length ? allowed : [SEM_LOJA]

  // A 99 guarda app_shop_id, não unit_id: o vínculo passa pela store_links.
  let shopIds: string[] | null = null
  if (lojas) {
    const { data: links } = await admin
      .from("ninefood_store_links")
      .select("app_shop_id")
      .in("unit_id", lojas)
    shopIds = (links ?? []).map((l) => l.app_shop_id as string).filter(Boolean)
    if (shopIds.length === 0) shopIds = ["__nenhuma__"]
  }

  const [ifood, nine, keeta] = await Promise.all([
    (() => {
      let q = admin
        .from("ifood_financeiro_lancamentos")
        .select("data_fato_gerador")
        .not("data_fato_gerador", "is", null)
      if (lojas) q = q.in("unit_id", lojas)
      return q
        .order("data_fato_gerador", { ascending: false })
        .limit(1)
        .maybeSingle()
    })(),
    (() => {
      let q = admin
        .from("ninefood_api_bill")
        .select("business_date")
        .not("business_date", "is", null)
      if (shopIds) q = q.in("app_shop_id", shopIds)
      return q
        .order("business_date", { ascending: false })
        .limit(1)
        .maybeSingle()
    })(),
    (() => {
      let q = admin
        .from("keeta_daily_loja")
        .select("data")
        .not("data", "is", null)
      if (lojas) q = q.in("unit_id", lojas)
      return q.order("data", { ascending: false }).limit(1).maybeSingle()
    })(),
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
