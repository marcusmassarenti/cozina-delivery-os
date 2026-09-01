/** Inventário: quanto CADA caminho de faturamento devolve, mesmo mês/lojas. */
import { config } from "dotenv"
config({ path: ".env.local" })

import { createAdminClient } from "@/lib/supabase/admin"
import { getRealMonthlyForUnits } from "@/lib/data/lancamentos"
import { getUnitMetricsForMonth } from "@/lib/data/comparativo"
import {
  getFinanceiroResumoByUnits,
  getCancelamentoCestaByUnits,
} from "@/lib/data/ifood-imported"
import { brutoIfoodComoNoPortal } from "@/lib/ifood-bruto"
import type { PlatformId } from "@/components/platform-logo"

const Y = 2026, M = 8
const PLATAFORMAS: PlatformId[] = ["ifood", "99food", "keeta", "cardapioweb"]
const brl = (n: number) => "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function main() {
  const sb = createAdminClient()
  const { data: hs } = await sb.from("holdings").select("id, nome")
  const { data: us } = await sb.from("units").select("id, code, name, brand_id, active")
  const { data: bs } = await sb.from("brands").select("id, holding_id")
  type Brand = { id: string; holding_id: string }
  type Holding = { id: string; nome: string | null }
  type Unit = { id: string; code: string; name: string; brand_id: string; active: boolean }
  const holdingDaBrand = new Map(((bs ?? []) as Brand[]).map((b) => [b.id, b.holding_id]))
  const nomeHolding = new Map(((hs ?? []) as Holding[]).map((h) => [h.id, h.nome]))
  const units = ((us ?? []) as Unit[]).filter((u) => u.active)
  const ids = units.map((u) => u.id)

  const [monthly, metrics, fin, cestas] = await Promise.all([
    getRealMonthlyForUnits(ids, Y, M),
    getUnitMetricsForMonth(ids, PLATAFORMAS, Y, M),
    getFinanceiroResumoByUnits(ids, Y, M),
    getCancelamentoCestaByUnits(ids, Y, M),
  ])

  const grupos = new Map<string, { agg: number; evo: number; portal: number; cesta: number; lojas: number }>()
  for (const u of units) {
    // `.get()` de um Map devolve undefined quando a chave não existe, e o Map
    // de fora não aceita undefined como chave. Compilava por causa do `any`.
    const holdingId = holdingDaBrand.get(u.brand_id)
    const h = (holdingId ? nomeHolding.get(holdingId) : null) ?? "(sem holding)"
    const g = grupos.get(h) ?? { agg: 0, evo: 0, portal: 0, cesta: 0, lojas: 0 }
    const m = monthly.get(u.id)
    const mt = metrics.get(u.id)
    const f = fin.get(u.id)
    const c = cestas.get(u.id)?.valor ?? 0
    if (!m && !mt && !f) continue
    g.lojas++
    g.agg += m?.faturamentoBruto ?? 0
    g.evo += mt?.hasData ? mt.bruto : 0
    g.portal += (m?.faturamentoBruto ?? 0) + c
    g.cesta += c
    grupos.set(h, g)
  }

  console.log("\ncliente".padEnd(28), "lojas", "agregador(Carteira/rank)".padStart(26), "evolucao/Nino".padStart(18), "regua portal(KPI)".padStart(20), "cesta cancelada".padStart(17))
  const T = { agg: 0, evo: 0, portal: 0, cesta: 0 }
  for (const [h, g] of [...grupos.entries()].sort((a, b) => b[1].portal - a[1].portal)) {
    console.log(h.slice(0, 27).padEnd(28), String(g.lojas).padStart(5),
      brl(g.agg).padStart(26), brl(g.evo).padStart(18), brl(g.portal).padStart(20), brl(g.cesta).padStart(17))
    T.agg += g.agg; T.evo += g.evo; T.portal += g.portal; T.cesta += g.cesta
  }
  console.log("".padEnd(28), "".padStart(5), brl(T.agg).padStart(26), brl(T.evo).padStart(18), brl(T.portal).padStart(20), brl(T.cesta).padStart(17))
  console.log("\nagregador vs evolucao:", brl(T.agg - T.evo))
  console.log("regua portal vs agregador:", brl(T.portal - T.agg), "(= cesta cancelada)")
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
