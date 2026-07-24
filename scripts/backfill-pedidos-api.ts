/**
 * Backfill dos PEDIDOS/PAGAMENTO via Financial Events.
 *
 * O sync diário cobre mês corrente + anterior. Este script puxa o histórico
 * (jan→mai/26 por padrão) de todas as lojas com o app financeiro habilitado.
 * Idempotente: upsert por (unit_id, pedido_id), pode rodar de novo à vontade.
 *
 * Rodar:
 *   npx tsx --tsconfig scripts/tsconfig.teste.json --env-file=.env.local \
 *     scripts/backfill-pedidos-api.ts
 *
 * Variáveis opcionais:
 *   COMPETENCIAS=2026-01,2026-02   (default: jan→mai/26)
 *   SO_UNIT=<uuid>                 (roda uma loja só, pra teste)
 */
import { syncPedidosDaLoja, logPedidosSync } from "../src/lib/ifood/pedidos-sync"
import { createAdminClient } from "../src/lib/supabase/admin"

const COMPETENCIAS = (
  process.env.COMPETENCIAS ?? "2026-01,2026-02,2026-03,2026-04,2026-05"
)
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean)

type Loja = {
  unitId: string
  merchantId: string
  code: string
  name: string
}

async function listarLojas(): Promise<Loja[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("unit_platforms")
    .select("unit_id, api_store_id, units!inner(code, name)")
    .eq("platform", "ifood")
    .eq("active", true)
    .not("api_store_id", "is", null)
    .not("fin_enabled_at", "is", null)
  if (error) throw new Error(error.message)

  const lojas = (data ?? []).map((r) => {
    const u = r.units as unknown as { code: string; name: string } | null
    return {
      unitId: r.unit_id as string,
      merchantId: r.api_store_id as string,
      code: u?.code ?? "?",
      name: u?.name ?? "?",
    }
  })
  const so = process.env.SO_UNIT
  return so ? lojas.filter((l) => l.unitId === so) : lojas
}

async function main() {
  const lojas = await listarLojas()
  console.log(
    `Backfill de pedidos · ${lojas.length} loja(s) × ${COMPETENCIAS.length} competência(s)\n` +
      `Competências: ${COMPETENCIAS.join(", ")}\n`,
  )

  let totalGravados = 0
  let falhas = 0
  const t0 = Date.now()

  // Sequencial de propósito: são centenas de milhares de eventos e o iFood
  // limita a taxa. Paralelizar aqui só troca tempo por 429.
  for (const loja of lojas) {
    console.log(`\n#${loja.code} ${loja.name}`)
    for (const comp of COMPETENCIAS) {
      const t = Date.now()
      try {
        const r = await syncPedidosDaLoja(loja.unitId, loja.merchantId, comp)
        if (!r.ok) {
          falhas++
          console.log(`  ${comp}: ❌ ${r.erro}`)
          continue
        }
        if (r.gravados > 0) await logPedidosSync(loja.unitId, comp, r.gravados)
        totalGravados += r.gravados
        const seg = ((Date.now() - t) / 1000).toFixed(0)
        console.log(
          `  ${comp}: ✅ ${r.pedidos} pedidos · ${r.gravados} gravados ` +
            `(${r.eventos} eventos, ${seg}s)`,
        )
      } catch (e) {
        falhas++
        console.log(`  ${comp}: ❌ ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }

  const min = ((Date.now() - t0) / 60000).toFixed(1)
  console.log(
    `\n─────────────\nTOTAL: ${totalGravados.toLocaleString("pt-BR")} pedidos gravados · ` +
      `${falhas} falha(s) · ${min} min`,
  )
}

main().catch((e) => {
  console.error("FALHA:", e)
  process.exit(1)
})
