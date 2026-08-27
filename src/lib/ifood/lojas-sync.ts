import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { idsDeUnidadesForaDoSync } from "@/lib/data/unidades-inativas"

export type LojaIfoodSync = {
  unitId: string
  merchantId: string
  code: string
  name: string
}

/**
 * As lojas que um cron do iFood pode BATER NA API.
 *
 * Aplica `idsDeUnidadesForaDoSync()` — o ponto único que já reunia os quatro
 * motivos de pular uma loja (fechada no cadastro, assinatura suspensa, rede de
 * demonstração, cliente encerrado). Sete módulos de sync já o usavam; os
 * únicos dois que não usavam eram `horarios.ts` e o cron de repasses, e foram
 * exatamente os dois que vazaram chamada.
 *
 * Não vazaram por falta de aviso: `unidades-inativas.ts` diz que o ponto único
 * existe "porque se cada sync fizesse a própria união, o terceiro motivo
 * entraria em três dos quatro e ninguém perceberia no quarto". O que faltava
 * era o passo anterior — ESCOLHER a loja também estava copiado, e quem copia o
 * select copia junto o que ele esqueceu. Por isso a seleção vem para cá
 * inteira, em vez de só o filtro.
 *
 * Custo medido do escape, em 10 dias: 130 chamadas 403 ao iFood — 120 de
 * `opening-hours` com merchant da demo e 10 de `anticipations`, mais a
 * Pizzaria Quero Mais, de cliente com sync pausado desde 22/08.
 *
 * Só para sync/cron. Tela e relatório continuam lendo `unit_platforms`
 * direto — lá a loja suspensa e a demo PRECISAM aparecer conectadas.
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

  const [{ data }, fora] = await Promise.all([q, idsDeUnidadesForaDoSync()])

  return ((data ?? []) as unknown as {
    unit_id: string
    api_store_id: string
    units: { code: string; name: string }
  }[])
    .filter((v) => !fora.has(v.unit_id))
    .map((v) => ({
      unitId: v.unit_id,
      merchantId: v.api_store_id,
      code: v.units.code,
      name: v.units.name,
    }))
}
