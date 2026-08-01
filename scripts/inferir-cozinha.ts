/**
 * Sugere o tipo de cozinha pelo nome da loja.
 *
 * O iFood não devolve categoria na Merchant API (só id, name e corporateName),
 * então o nome é o melhor sinal que temos. Regra explícita e ordenada em vez
 * de lista chumbada: serve pra qualquer cliente novo que chegar com 60 lojas.
 *
 * Deliberadamente conservador — quando o nome não diz nada ("Pasqual",
 * "Sabores da Luh"), deixa em branco em vez de chutar. Cadastro errado é pior
 * que cadastro vazio: ele contamina a comparação entre lojas do mesmo tipo,
 * que é justamente o que justifica o campo existir.
 *
 *   npx tsx --tsconfig scripts/tsconfig.teste.json --env-file=.env.local \
 *     scripts/inferir-cozinha.ts "DG FOODS" [--aplicar]
 */
import { createAdminClient } from "../src/lib/supabase/admin"
import { inferirCozinha } from "../src/lib/unidade-perfil"

const holdingNome = process.argv[2] ?? "DG FOODS"
const aplicar = process.argv.includes("--aplicar")

async function main() {
  const admin = createAdminClient()
  const { data: holding } = await admin
    .from("holdings")
    .select("id")
    .eq("name", holdingNome)
    .single()
  if (!holding) throw new Error(`Holding "${holdingNome}" não encontrada`)

  const { data: brands } = await admin
    .from("brands")
    .select("id")
    .eq("holding_id", holding.id)
  const { data: units } = await admin
    .from("units")
    .select("id, code, name, nome_fantasia, tipo_cozinha")
    .in("brand_id", (brands ?? []).map((b) => b.id))
    .eq("active", true)
    .order("code")

  const semSugestao: string[] = []
  let gravadas = 0

  for (const u of units ?? []) {
    const tipo = inferirCozinha(u.name ?? "", u.nome_fantasia)
    if (!tipo) {
      semSugestao.push(`${u.code} ${u.name}`)
      console.log(`${u.code.padEnd(4)} ${(u.name ?? "").padEnd(38)} —`)
      continue
    }
    console.log(`${u.code.padEnd(4)} ${(u.name ?? "").padEnd(38)} ${tipo}`)
    if (aplicar) {
      const { error } = await admin
        .from("units")
        .update({ tipo_cozinha: tipo })
        .eq("id", u.id)
      if (error) console.log(`  erro: ${error.message}`)
      else gravadas++
    }
  }

  console.log(
    `\n${(units?.length ?? 0) - semSugestao.length} com sugestão · ` +
      `${semSugestao.length} sem: ${semSugestao.join(", ") || "—"}`,
  )
  if (aplicar) console.log(`${gravadas} unidades atualizadas.`)
  else console.log(`Simulação. Rode com --aplicar pra gravar.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
