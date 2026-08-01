/**
 * Reprocessa as lojas que caíram por statement timeout na gravação.
 *
 *   npx tsx --tsconfig scripts/tsconfig.teste.json --env-file=.env.local \
 *     scripts/resync-timeouts.ts <unitId> [competencia...]
 */
import { syncIfoodAll } from "../src/lib/ifood/sync"

async function main() {
  const [unitId, ...comps] = process.argv.slice(2)
  const competences = comps.length ? comps : ["2026-06", "2026-07"]
  console.log(`sync ${unitId} · ${competences.join(", ")}`)
  const res = await syncIfoodAll({ unitIds: [unitId], competences, force: true })
  for (const u of res.results) {
    console.log(`\n${u.unitCode} ${u.unitName}`)
    for (const c of u.reconciliation) {
      console.log(
        `  ${c.competencia}: ${c.ok ? "ok" : "FALHOU"}` +
          (c.persisted != null ? ` · ${c.persisted} linhas` : "") +
          (c.substituido ? " · substituiu carga anterior" : "") +
          (c.error ? ` · ${c.error}` : "") +
          (c.skipped ? ` · pulado: ${c.skipped}` : ""),
      )
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
