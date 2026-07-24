/**
 * Backfill da Yakisushi (DG Foods): Conciliação jan→jul/26 via syncIfoodAll,
 * escopado só à unidade dela. Mesma engine do sync diário (idempotente).
 *
 * Rodar: npx tsx --tsconfig scripts/tsconfig.teste.json --env-file=.env.local scripts/backfill-yakisushi.ts
 */
import { syncIfoodAll } from "../src/lib/ifood/sync"

const UNIT_ID = "871885ea-578e-46b4-88d1-572ea9e6a1f2" // #16 Yakisushi

async function main() {
  const competences = Array.from(
    { length: 7 },
    (_, i) => `2026-${String(i + 1).padStart(2, "0")}`,
  )
  console.log(`Backfill Yakisushi · competências: ${competences.join(", ")}`)
  const res = await syncIfoodAll({
    unitIds: [UNIT_ID],
    competences,
    force: true,
  })
  for (const u of res.results) {
    console.log(`\n${u.unitCode} ${u.unitName} (${u.merchantId})`)
    console.log(`primeira sincronização: ${u.primeiraSincronizacao ?? false}`)
    for (const c of u.reconciliation) {
      console.log(
        `  ${c.competencia}: ${c.skipped ? `skip(${c.skipped})` : c.ok ? `✅ ${c.rowCount} linhas · ${c.persisted} gravadas${c.substituido ? " (substituiu)" : ""}` : `❌ ${c.error ?? c.status}`}`,
      )
    }
    for (const p of u.pedidos ?? []) {
      console.log(
        `  pedidos ${p.competencia}: ${p.skipped ? `skip(${p.skipped})` : p.ok ? `✅ ${p.pedidos} pedidos · ${p.gravados} gravados` : `❌ ${p.error}`}`,
      )
    }
  }
}

main().catch((e) => {
  console.error("FALHA:", e)
  process.exit(1)
})
