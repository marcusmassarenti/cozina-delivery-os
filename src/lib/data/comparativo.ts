/**
 * Comparativo loja × loja — métricas por unidade no mês, respeitando o filtro
 * de plataformas (soma só as plataformas escolhidas). Reusa os 3 "resumos"
 * por unidade (iFood / 99 / Keeta), então é a mesma fonte do resto do sistema.
 *
 * Tipos e metadados das métricas (compartilhados com o Client) ficam em
 * `comparativo-metrics.ts` — este arquivo é server-only.
 */
import "server-only"

import type { PlatformId } from "@/components/platform-logo"
import { getFinanceiroResumoByUnits } from "@/lib/data/ifood-imported"
import { getNinefoodResumoByUnits } from "@/lib/data/ninefood-imported"
import { getKeetaResumoByUnits } from "@/lib/data/keeta-imported"
import type { UnitMetrics } from "@/lib/data/comparativo-metrics"

/**
 * Métricas por unidade no mês, somando só as plataformas pedidas.
 * Retorna um Map keyed por unitId (mesmas chaves de `unitIds`).
 */
export async function getUnitMetricsForMonth(
  unitIds: string[],
  platforms: PlatformId[],
  year: number,
  month: number,
): Promise<Map<string, UnitMetrics>> {
  const want = new Set(platforms)
  const [ifood, nine, keeta] = await Promise.all([
    want.has("ifood")
      ? getFinanceiroResumoByUnits(unitIds, year, month)
      : null,
    want.has("99food")
      ? getNinefoodResumoByUnits(unitIds, year, month)
      : null,
    want.has("keeta") ? getKeetaResumoByUnits(unitIds, year, month) : null,
  ])

  const out = new Map<string, UnitMetrics>()
  for (const id of unitIds) {
    let bruto = 0
    let liquido = 0
    let pedidos = 0
    let cancelados = 0
    let hasData = false

    const fi = ifood?.get(id)
    if (fi) {
      bruto += fi.bruto
      liquido += fi.liquido
      pedidos += fi.pedidosUnicos
      cancelados += fi.cancelamentoTotalQtd + fi.cancelamentoParcialQtd
      if (fi.hasData) hasData = true
    }
    const ni = nine?.get(id)
    if (ni) {
      bruto += ni.bruto
      liquido += ni.liquido
      pedidos += ni.pedidos
      cancelados += ni.cancelamentosQtd
      if (ni.hasData) hasData = true
    }
    const ke = keeta?.get(id)
    if (ke) {
      bruto += ke.bruto
      liquido += ke.liquido
      pedidos += ke.pedidos
      cancelados += ke.cancelamentosQtd
      if (ke.hasData) hasData = true
    }

    const ticket = pedidos > 0 ? bruto / pedidos : 0
    const repasse = bruto > 0 ? (liquido / bruto) * 100 : 0

    out.set(id, {
      bruto,
      liquido,
      pedidos,
      ticket,
      repasse,
      cancelados,
      hasData,
    })
  }
  return out
}
