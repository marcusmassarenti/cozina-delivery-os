/**
 * Backfill do endpoint `sales` — JANEIRO a JULHO/2026, todas as lojas com
 * iFood conectado. Roda DEPOIS do de agosto (scripts/backfill-sales-agosto.ts)
 * pra não somar concorrência no rate do app.
 *
 * Meses em SEQUÊNCIA (progresso legível e rate comportado); lojas em
 * concorrência 2 dentro do mês. 403 numa loja = merchant desautorizado —
 * registra e segue, não é fatal (caso real: Pizzaria Quero Mais, 31/08).
 */
import { config } from "dotenv"
config({ path: ".env.local" })
import { createAdminClient } from "@/lib/supabase/admin"
import { syncSalesDaLoja } from "@/lib/ifood/sales-sync"

const MESES = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]

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
  console.log(`lojas: ${lojas.length} · meses: ${MESES.join(", ")}`)

  const desautorizadas = new Set<string>()
  for (const competencia of MESES) {
    let ok = 0, erro = 0, vendas = 0
    const fila = lojas.filter((l) => !desautorizadas.has(l.mid))
    const worker = async () => {
      for (;;) {
        const l = fila.shift()
        if (!l) return
        try {
          const r = await syncSalesDaLoja(l.unitId, l.mid, competencia)
          if (r.ok) { ok++; vendas += r.gravados }
          else {
            erro++
            console.log(`  ERRO ${l.nome} ${competencia}: ${r.erro}`)
            // 403 = desautorizado; não adianta insistir nos outros meses.
            if (/HTTP 403/.test(r.erro ?? "")) desautorizadas.add(l.mid)
          }
        } catch (e) {
          erro++
          console.log(`  THROW ${l.nome} ${competencia}: ${e instanceof Error ? e.message : e}`)
        }
      }
    }
    await Promise.all([worker(), worker()])
    console.log(`${competencia}: ok ${ok} · erro ${erro} · ${vendas} vendas`)
  }
  if (desautorizadas.size > 0) {
    console.log(`merchants desautorizados (403): ${desautorizadas.size}`)
  }
  console.log("FIM")
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
