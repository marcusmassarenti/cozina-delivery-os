/**
 * Exercita a importação de NF ponta a ponta, sem passar pela tela.
 *
 * O upload de arquivo não dá pra simular pelo navegador, mas o que importa
 * verificar é o caminho de gravação — parse → nota → itens → catálogo de
 * insumos — e ele é exatamente o mesmo que a server action chama.
 *
 *   npx tsx --tsconfig scripts/tsconfig.teste.json --env-file=.env.local \
 *     scripts/teste-import-nf.ts <arquivo.xml> <nome-da-loja>       # só lê
 *   ... scripts/teste-import-nf.ts <arquivo.xml> <nome-da-loja> --aplicar
 */
import { readFileSync } from "node:fs"

import { createAdminClient } from "../src/lib/supabase/admin"
import { custoDoItem, parseNFe } from "../src/lib/nf/parse-xml"
import { importarNF } from "../src/lib/data/nf"

const [arquivo, nomeLoja] = process.argv.slice(2)
const aplicar = process.argv.includes("--aplicar")

async function main() {
  if (!arquivo || !nomeLoja) {
    console.error("uso: teste-import-nf.ts <arquivo.xml> <nome-da-loja> [--aplicar]")
    process.exit(1)
  }
  const xml = readFileSync(arquivo, "utf8")
  const nf = parseNFe(xml)
  const admin = createAdminClient()

  const { data: unit } = await admin
    .from("units")
    .select("id, name, regime_fiscal, brand_id")
    .eq("name", nomeLoja)
    .maybeSingle()
  if (!unit) throw new Error(`Loja "${nomeLoja}" não encontrada.`)

  const { data: brand } = await admin
    .from("brands")
    .select("holding_id")
    .eq("id", unit.brand_id)
    .single()
  const holdingId = brand!.holding_id as string

  const regime = (unit.regime_fiscal ?? "simples") as "simples" | "normal"
  const custo = nf.itens.reduce((s, i) => s + custoDoItem(i, regime), 0)

  console.log(`nota ${nf.numero} · ${nf.emissao} · ${nf.itens.length} itens`)
  console.log(`loja ${unit.name} (regime ${regime})`)
  console.log(`valor da nota R$ ${nf.valorTotal.toFixed(2)} · custo apurado R$ ${custo.toFixed(2)}`)

  if (!aplicar) {
    console.log("\n(simulação — rode com --aplicar pra gravar)")
    return
  }

  const r = await importarNF(holdingId, nf, unit.id as string, null, xml)
  console.log("\ngravado:", JSON.stringify(r, null, 2))
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
