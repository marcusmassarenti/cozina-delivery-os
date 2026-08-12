import "server-only"

/**
 * Lojas de cliente SUSPENSO HÁ MAIS DE UMA SEMANA — as que o sync para de puxar.
 *
 * Antes disto, nenhum sync olhava cobrança: o único filtro era `units.active`
 * (loja fechada no cadastro). Cliente com trial vencido e sem pagar continuava
 * sendo sincronizado todo dia, gastando chamada de API das plataformas,
 * execução na Vercel e linha no banco. Em 12/ago/26 já era um cliente nessa
 * situação, com outro entrando no dia seguinte.
 *
 * ⚠️ POR QUE 7 DIAS E NÃO NA HORA (decisão do Marcus, 12/ago/26): parar no
 * primeiro dia pune quem só deixou o cartão vencer. E parar cria BURACO no
 * histórico — no iFood e no Cardápio Web dá pra fazer backfill quando a pessoa
 * volta, mas a Keeta é planilha e o dia perdido não volta. A semana é a folga
 * pra regularizar sem perder dado.
 *
 * A régua de "está suspenso?" NÃO é reescrita aqui: vem de
 * `computeBillingStatus`. Reimplementar regra de negócio em dois lugares é
 * como as cinco definições de "margem" nasceram neste projeto.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import {
  computeBillingStatus,
  daysUntil,
  todayISO,
  type HoldingBilling,
} from "@/lib/data/billing"

/** Dias de tolerância depois que a assinatura cai antes de cortar o sync. */
export const DIAS_ATE_CORTAR_SYNC = 7

/**
 * Desde quando esta empresa está suspensa. `null` = não está.
 *
 * São duas portas de entrada pra suspensão e cada uma tem a sua data: trial
 * vencido suspende no dia SEGUINTE ao fim do teste; `suspend_on` suspende no
 * próprio dia.
 */
function suspensoDesde(b: HoldingBilling, hoje: string): string | null {
  if (computeBillingStatus(b, hoje) !== "suspended") return null
  if (b.trialEndsAt) {
    const d = new Date(`${b.trialEndsAt}T00:00:00-03:00`)
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  }
  return b.suspendOn
}

/**
 * IDs das unidades que NÃO devem ser sincronizadas por causa de cobrança.
 *
 * Devolve Set pra o chamador filtrar em memória, igual ao
 * `idsDeUnidadesInativas` — os syncs já trazem a lista de lojas por outros
 * critérios, e uma consulta pequena sai mais barato que reescrever cada query.
 */
export async function idsDeUnidadesSemAssinatura(): Promise<Set<string>> {
  const vazio = new Set<string>()
  const admin = createAdminClient()
  const hoje = todayISO()

  const { data: hs, error } = await admin
    .from("holdings")
    .select("id, paid, due_date, suspend_on, trial_ends_at")
  if (error) {
    // Falhar aqui NÃO pode cortar sync de ninguém: na dúvida sincroniza demais,
    // que é o comportamento de antes. Trocar desperdício por buraco no dado do
    // cliente PAGANTE seria o pior dos dois mundos.
    console.error("idsDeUnidadesSemAssinatura:", error.message)
    return vazio
  }

  const cortar: string[] = []
  for (const h of (hs ?? []) as {
    id: string
    paid: boolean | null
    due_date: string | null
    suspend_on: string | null
    trial_ends_at: string | null
  }[]) {
    const desde = suspensoDesde(
      {
        paymentMethod: null,
        monthlyFee: null,
        dueDate: h.due_date,
        paid: !!h.paid,
        suspendOn: h.suspend_on,
        trialEndsAt: h.trial_ends_at,
      },
      hoje,
    )
    if (!desde) continue
    // daysUntil devolve negativo pra data passada; -7 = suspenso há 7 dias.
    if (-daysUntil(desde, hoje) >= DIAS_ATE_CORTAR_SYNC) cortar.push(h.id)
  }
  if (cortar.length === 0) return vazio

  const { data: us } = await admin
    .from("units")
    .select("id, brands!inner(holding_id)")
    .in("brands.holding_id", cortar)
  const ids = new Set(
    ((us ?? []) as unknown as { id: string }[]).map((u) => u.id),
  )
  if (ids.size > 0) {
    console.log(
      `[sync] ${ids.size} loja(s) fora do sync: assinatura suspensa há ${DIAS_ATE_CORTAR_SYNC}+ dias`,
    )
  }
  return ids
}
