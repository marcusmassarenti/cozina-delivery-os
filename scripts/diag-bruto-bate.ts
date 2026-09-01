/** Mede se os caminhos de bruto do iFood devolvem o MESMO número. */
import { config } from "dotenv"
config({ path: ".env.local" })

import { createAdminClient } from "@/lib/supabase/admin"
import { getRealMonthlyForUnits } from "@/lib/data/lancamentos"
import { getFinanceiroResumoByUnits } from "@/lib/data/ifood-imported"
import { brutoIfoodComoNoPortal, ifoodEntregaPelaPlataforma } from "@/lib/ifood-bruto"

const YEAR = 2026, MONTH = 8

async function main() {
  const sb = createAdminClient()
  const { data: units } = await sb
    .from("units").select("id, code, name").limit(500)
  const all = (units ?? []) as { id: string; code: string; name: string }[]
  const ids = all.map((u) => u.id)

  const fin = await getFinanceiroResumoByUnits(ids, YEAR, MONTH)
  const monthly = await getRealMonthlyForUnits(ids, YEAR, MONTH)

  let iguais = 0, comEntrega = 0, semEntrega = 0
  const difs: string[] = []
  let somaAgg = 0, somaRegua = 0
  for (const u of all) {
    const f = fin.get(u.id)
    if (!f?.hasData) continue
    ifoodEntregaPelaPlataforma(f) ? comEntrega++ : semEntrega++
    const regua = brutoIfoodComoNoPortal(f)
    const m = monthly.get(u.id)
    const agg = m?.platforms.find((p) => p.id === "ifood")?.bruto ?? 0
    somaAgg += agg; somaRegua += regua
    if (Math.abs(agg - regua) < 0.01) iguais++
    else difs.push(`${u.code} ${u.name}: agregador ${agg.toFixed(2)} vs régua ${regua.toFixed(2)} (dif ${(agg - regua).toFixed(2)})`)
  }
  console.log(`lojas com extrato iFood em ${MONTH}/${YEAR}: ${iguais + difs.length}`)
  console.log(`  entrega do iFood (bruto inclui frete): ${comEntrega}`)
  console.log(`  entrega própria (bruto = só itens):    ${semEntrega}`)
  console.log(`\nagregador == régua: ${iguais}  |  divergentes: ${difs.length}`)
  difs.slice(0, 15).forEach((d) => console.log("  " + d))
  console.log(`\nsoma agregador: R$ ${somaAgg.toFixed(2)}`)
  console.log(`soma régua:     R$ ${somaRegua.toFixed(2)}`)
  console.log(`delta:          R$ ${(somaAgg - somaRegua).toFixed(2)}`)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
