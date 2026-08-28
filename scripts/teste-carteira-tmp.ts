import { createAdminClient } from "../src/lib/supabase/admin"
import { rankingDeGestores, listarGestores } from "../src/lib/data/carteira"

const brl = (v: number) => v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})

async function main() {
  const admin = createAdminClient()
  const { data } = await admin.from("holdings").select("id").eq("name","DG FOODS").maybeSingle()
  const hid = (data as { id: string }).id

  const gs = await listarGestores(hid)
  console.log(`gestores cadastrados: ${gs.length} → ${gs.map(g=>g.nome).join(" · ")}`)

  const r = await rankingDeGestores({ start:"2026-08-01", end:"2026-08-31" }, hid)
  console.log(`\n═══ ranking · agosto ═══`)
  for (const g of r) {
    console.log(
      `  ${g.nome.padEnd(22)} ${String(g.lojasAtivas+"/"+g.lojas+" lojas").padEnd(12)}` +
      ` ${brl(g.bruto).padStart(14)} · ${String(g.pedidos).padStart(5)} ped` +
      ` · ${g.diasMedios===null?"— sem data":`${g.diasMedios} dias`}`.padEnd(16) +
      ` · ${g.semanasPendentes} semanas pendentes`)
  }
  const semCarteira = r.find(g=>g.lojas===0)
  console.log(`\ngestor sem carteira aparece no ranking? ${semCarteira? "✓ sim ("+semCarteira.nome+")":"✗ SUMIU"}`)
}
main()
