import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { idsDeUnidadesDemo } from "@/lib/data/holding-demo"

export type LojaIfoodSync = {
  unitId: string
  merchantId: string
  code: string
  name: string
}

/**
 * As lojas que um cron do iFood pode BATER NA API — já sem a demo.
 *
 * Existe porque o mesmo `select` estava copiado em dois crons e os dois
 * esqueceram o mesmo filtro. O aviso já estava escrito em `holding-demo.ts`
 * ("é justamente por estar conectada que ela precisa ficar fora do sync") e
 * ainda assim escapou duas vezes, porque quem escreve o cron seguinte copia o
 * anterior, não o comentário. Filtro que depende de lembrar vira filtro que
 * um dia não acontece; então a escolha da loja passa a ter um lugar só.
 *
 * Custo real do escape: 130 chamadas 403 ao iFood em 10 dias (120 de
 * `opening-hours` + 10 de `anticipations`), todas com merchant fictício.
 *
 * Só para sync/cron. Tela e relatório continuam lendo `unit_platforms`
 * direto — lá a demo PRECISA aparecer conectada.
 */
export async function lojasIfoodParaSync(
  unitIds?: string[] | null,
): Promise<LojaIfoodSync[]> {
  const admin = createAdminClient()
  let q = admin
    .from("unit_platforms")
    .select("unit_id, api_store_id, units!inner(code, name)")
    .eq("platform", "ifood")
    .not("api_store_id", "is", null)
  if (unitIds && unitIds.length > 0) q = q.in("unit_id", unitIds)

  const [{ data }, demo] = await Promise.all([q, idsDeUnidadesDemo()])

  return ((data ?? []) as unknown as {
    unit_id: string
    api_store_id: string
    units: { code: string; name: string }
  }[])
    .filter((v) => !demo.has(v.unit_id))
    .map((v) => ({
      unitId: v.unit_id,
      merchantId: v.api_store_id,
      code: v.units.code,
      name: v.units.name,
    }))
}
