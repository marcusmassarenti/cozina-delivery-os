/**
 * Mede o auto-vínculo e sincroniza TODAS as lojas iFood vinculadas.
 *
 * Rodar:
 *   npx tsx --tsconfig scripts/tsconfig.teste.json --env-file=.env.local \
 *     scripts/diag-ifood-sync-todas.ts
 *
 * Existe pra responder duas perguntas de uma vez: quanto tempo o auto-vínculo
 * leva agora que a sondagem de CNPJ é memoizada, e se TODAS as lojas estão de
 * fato trazendo financeiro e avaliações — em vez de olhar loja por loja.
 */
import { autoLinkIfoodMerchants } from "../src/lib/ifood/auto-link"
import { syncIfoodReviews } from "../src/lib/ifood/review-sync"
import { syncIfoodAll } from "../src/lib/ifood/sync"
import { createAdminClient } from "../src/lib/supabase/admin"

const seg = (ms: number) => `${(ms / 1000).toFixed(1)}s`

async function main() {
  const admin = createAdminClient()

  // ── 1) auto-vínculo cronometrado ──────────────────────────────────
  console.log("\n=== AUTO-VÍNCULO ===")
  const t0 = Date.now()
  const link = await autoLinkIfoodMerchants(null)
  const tLink = Date.now() - t0
  console.log(`tempo: ${seg(tLink)}`)
  console.log(`merchants vistos: ${link.merchantsVistos}`)
  console.log(`vinculadas agora: ${link.vinculadas.length}`)
  for (const v of link.vinculadas) console.log(`  ✓ ${v.unitCode} ${v.unitName}`)
  console.log(`não resolvidas: ${link.ambiguas.length}`)
  for (const a of link.ambiguas) console.log(`  · ${a.unitName}: ${a.motivo}`)

  // ── 2) sync de todas as lojas vinculadas ──────────────────────────
  console.log("\n=== SYNC (todas as lojas) ===")
  const t1 = Date.now()
  const out = await syncIfoodAll({ force: true })
  console.log(`tempo: ${seg(Date.now() - t1)}`)
  console.log(`unidades processadas: ${out.unitsProcessed ?? "?"}`)

  // syncIfoodAll faz Conciliação + Financial Events, mas NÃO avaliações —
  // são crons distintos (ifood-sync às 06:00, ifood-review-sync às 08:00).
  // Rodar só o primeiro dá a impressão errada de que a loja "não tem
  // avaliação", quando na verdade ninguém foi buscar.
  console.log("\n=== SYNC DE AVALIAÇÕES ===")
  const t2 = Date.now()
  const rev = await syncIfoodReviews(null)
  console.log(`tempo: ${seg(Date.now() - t2)}`)
  console.log(
    `lojas: ${rev.lojasProcessadas} · avaliações novas: ${rev.totalGravadas}`,
  )
  if (rev.homologacao) {
    console.log("⚠️ app de avaliações ainda em HOMOLOGAÇÃO — loja real dá 403")
  }

  // ── 3) o que cada loja tem, depois do sync ────────────────────────
  console.log("\n=== RESULTADO POR LOJA ===")
  const { data: vinculadas } = await admin
    .from("unit_platforms")
    .select("unit_id, units!inner(code, name, active)")
    .eq("platform", "ifood")
    .not("api_store_id", "is", null)

  const linhas: {
    code: string
    name: string
    ativa: boolean
    fin: number
    aval: number
    ped: number
    ultimaComp: string | null
  }[] = []

  for (const v of (vinculadas ?? []) as unknown as {
    unit_id: string
    units: { code: string; name: string; active: boolean }
  }[]) {
    const [fin, aval, ped, ult] = await Promise.all([
      admin
        .from("ifood_financeiro_lancamentos")
        .select("*", { count: "exact", head: true })
        .eq("unit_id", v.unit_id),
      admin
        .from("ifood_avaliacoes")
        .select("*", { count: "exact", head: true })
        .eq("unit_id", v.unit_id),
      admin
        .from("ifood_pedidos")
        .select("*", { count: "exact", head: true })
        .eq("unit_id", v.unit_id),
      admin
        .from("ifood_financeiro_lancamentos")
        .select("competencia")
        .eq("unit_id", v.unit_id)
        .order("competencia", { ascending: false })
        .limit(1),
    ])
    linhas.push({
      code: v.units.code,
      name: v.units.name,
      ativa: v.units.active,
      fin: fin.count ?? 0,
      aval: aval.count ?? 0,
      ped: ped.count ?? 0,
      ultimaComp:
        (ult.data?.[0] as { competencia?: string } | undefined)?.competencia ??
        null,
    })
  }

  linhas.sort((a, b) => a.code.localeCompare(b.code))
  console.log(
    "cod  loja                                    financ.  aval  pedidos  últ.comp",
  )
  for (const l of linhas) {
    const nome = (l.name + (l.ativa ? "" : " (inativa)")).slice(0, 38).padEnd(38)
    const alerta = l.fin === 0 || l.aval === 0 ? "  ⚠️" : ""
    console.log(
      `${l.code.padEnd(4)} ${nome} ${String(l.fin).padStart(7)} ${String(l.aval).padStart(5)} ${String(l.ped).padStart(8)}  ${l.ultimaComp ?? "—"}${alerta}`,
    )
  }

  const semFin = linhas.filter((l) => l.fin === 0)
  const semAval = linhas.filter((l) => l.aval === 0)
  console.log(`\ntotal vinculadas: ${linhas.length}`)
  console.log(
    `sem financeiro (${semFin.length}): ${semFin.map((l) => l.code).join(", ") || "—"}`,
  )
  console.log(
    `sem avaliações (${semAval.length}): ${semAval.map((l) => l.code).join(", ") || "—"}`,
  )
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
