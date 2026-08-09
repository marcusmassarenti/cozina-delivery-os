/**
 * Puxa o histórico do iFood desde janeiro/2026 das lojas que estão na fila.
 *
 *   npx tsx --tsconfig scripts/tsconfig.teste.json --env-file=.env.local \
 *     scripts/backfill-historico-ifood.ts "<cliente>" [--aplicar]
 *
 * A fila é `unit_platforms.historico_backfill_at is null` — o mesmo estado que
 * o cron de 15 min consome. Rodar aqui é só antecipar: o cron faria sozinho,
 * 2 lojas por rodada.
 */
import { createAdminClient } from "../src/lib/supabase/admin"
import { syncIfoodAll } from "../src/lib/ifood/sync"
import { competenciasDesdeInicio } from "../src/lib/ifood/auto-link"

const cliente = process.argv[2]
const aplicar = process.argv.includes("--aplicar")

async function main() {
  const admin = createAdminClient()
  const { data: rows } = await admin
    .from("unit_platforms")
    .select("unit_id, units(name, active, brands(holdings(name)))")
    .eq("platform", "ifood")
    .eq("active", true)
    .not("api_store_id", "is", null)
    .is("historico_backfill_at", null)

  type R = {
    unit_id: string
    units: { name: string; active: boolean; brands: { holdings: { name: string } | null } | null } | null
  }
  const fila = ((rows ?? []) as unknown as R[])
    .filter((r) => r.units?.active)
    .filter((r) => !cliente || r.units?.brands?.holdings?.name === cliente)

  console.log(`${fila.length} loja(s) na fila${cliente ? ` de ${cliente}` : ""}`)
  for (const r of fila) console.log("  ·", r.units?.name)
  if (!aplicar) return console.log("\n(simulação — rode com --aplicar)")

  const comps = competenciasDesdeInicio()
  console.log(`\ncompetências: ${comps[0]} → ${comps[comps.length - 1]}\n`)

  for (const r of fila) {
    const t0 = Date.now()
    try {
      const res = await syncIfoodAll({ unitIds: [r.unit_id], competences: comps, force: true })
      const u = res.results[0]
      const linhas = (u?.reconciliation ?? []).reduce((s, x) => s + (x.persisted ?? 0), 0)
      const meses = (u?.reconciliation ?? []).filter((x) => (x.persisted ?? 0) > 0).length
      if (meses > 0) {
        await admin.from("unit_platforms")
          .update({ historico_backfill_at: new Date().toISOString() })
          .eq("unit_id", r.unit_id).eq("platform", "ifood")
      }
      console.log(`✓ ${r.units?.name}: ${meses} meses, ${linhas} linhas (${((Date.now()-t0)/1000).toFixed(0)}s)`)
    } catch (e) {
      console.log(`✗ ${r.units?.name}: ${e instanceof Error ? e.message : e}`)
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
