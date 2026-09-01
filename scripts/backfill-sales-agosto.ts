/**
 * Backfill do endpoint `sales` (frete/itens/status por pedido) — AGOSTO/2026,
 * todas as lojas com iFood conectado. Uma vez só; depois do deploy o cron
 * diário mantém (o sales roda dentro do syncPedidosDaLoja).
 *
 * Concorrência 2 de propósito: página fixa de 20 na API — loja grande faz
 * centenas de chamadas, e o teto de rate é por APP, não por loja.
 */
import { config } from "dotenv"
config({ path: ".env.local" })
import { createAdminClient } from "@/lib/supabase/admin"
import { syncSalesDaLoja } from "@/lib/ifood/sales-sync"

const COMPETENCIA = "2026-08"

async function main() {
  const admin = createAdminClient()
  const { data: links } = await admin
    .from("unit_platforms")
    .select("unit_id, api_store_id, units!inner(name, active)")
    .eq("platform", "ifood")
    .eq("active", true)
    .not("api_store_id", "is", null)
  const lojas = (links ?? [])
    .filter((l: any) => l.units?.active)
    .map((l: any) => ({ unitId: l.unit_id, mid: l.api_store_id, nome: l.units.name }))
  console.log(`lojas: ${lojas.length} — competência ${COMPETENCIA}`)

  let okCount = 0, errCount = 0, totalGravados = 0
  const fila = [...lojas]
  const worker = async () => {
    for (;;) {
      const l = fila.shift()
      if (!l) return
      try {
        const r = await syncSalesDaLoja(l.unitId, l.mid, COMPETENCIA)
        if (r.ok) { okCount++; totalGravados += r.gravados }
        else { errCount++; console.log(`ERRO ${l.nome}: ${r.erro}`) }
        console.log(`${l.nome}: ${r.ok ? "ok" : "ERRO"} · ${r.gravados} vendas`)
      } catch (e) {
        errCount++
        console.log(`THROW ${l.nome}: ${e instanceof Error ? e.message : e}`)
      }
    }
  }
  await Promise.all([worker(), worker()])
  console.log(`FIM — ok: ${okCount} | erro: ${errCount} | vendas gravadas: ${totalGravados}`)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
