/**
 * Ressincroniza o financeiro do iFood de UMA loja em UMA competência.
 *
 * Existe por causa do incidente de 08/08/26: um sync manual morreu no meio da
 * troca de carga e deixou 8 lojas com dado duplicado e a Hortolândia com 17
 * dias de julho apagados. Consertar isso exigia repuxar uma competência
 * específica, e a única ferramenta era o backfill inteiro (8 competências,
 * ~3 min por loja) ou o botão da tela, que roda tudo.
 *
 *   npx tsx --tsconfig scripts/tsconfig.teste.json --env-file=.env.local \
 *     scripts/ressync-competencia.ts "<trecho do nome>" <ano> <mes>
 */
import { createAdminClient } from "../src/lib/supabase/admin"
import { syncIfoodAll } from "../src/lib/ifood/sync"

const busca = process.argv[2]
const ano = Number(process.argv[3])
const mes = Number(process.argv[4])

if (!busca || !ano || !mes) {
  console.error('uso: ressync-competencia.ts "<loja>" <ano> <mes>')
  process.exit(1)
}

async function main() {
  const admin = createAdminClient()
  const { data: lojas, error } = await admin
    .from("units")
    .select("id, name")
    .ilike("name", `%${busca}%`)
  if (error) {
    console.error("consulta falhou:", error.message)
    process.exit(1)
  }
  if (!lojas?.length) {
    console.error(`nenhuma loja com "${busca}"`)
    process.exit(1)
  }
  if (lojas.length > 1) {
    console.error("mais de uma loja bate:")
    for (const l of lojas) console.error(`  · ${l.name}`)
    process.exit(1)
  }

  const loja = lojas[0]!
  const comp = `${ano}-${String(mes).padStart(2, "0")}`

  const antes = await contar(admin, loja.id, ano, mes)
  console.log(`${loja.name} · ${comp}`)
  console.log(`  antes:  ${antes.linhas} linhas, ${antes.dias} dias`)

  const r = await syncIfoodAll({
    unitIds: [loja.id],
    competences: [comp],
    force: true,
  })
  const u = r.results[0]
  const rec = u?.reconciliation ?? []
  console.log(
    `  API:    ${rec.map((x) => `${x.ok ? "ok" : "FALHOU"}${x.persisted != null ? ` (${x.persisted})` : ""}`).join(" ")}`,
  )

  const depois = await contar(admin, loja.id, ano, mes)
  console.log(`  depois: ${depois.linhas} linhas, ${depois.dias} dias`)

  // O que importa não é "rodou", é se sobrou MENOS do que tinha. Perder dado
  // numa correção de dado é o pior desfecho possível.
  if (depois.linhas < antes.linhas) {
    console.error(
      `\n⚠️  PERDEU ${antes.linhas - depois.linhas} linhas. Conferir antes de seguir.`,
    )
    process.exit(1)
  }
  console.log(`\n✓ ${depois.linhas - antes.linhas > 0 ? "ganhou" : "manteve"} dado`)
}

async function contar(
  admin: ReturnType<typeof createAdminClient>,
  unitId: string,
  ano: number,
  mes: number,
) {
  const { data } = await admin
    .from("ifood_financeiro_lancamentos")
    .select("data_fato_gerador")
    .eq("unit_id", unitId)
    .eq("ref_year", ano)
    .eq("ref_month", mes)
  const linhas = data?.length ?? 0
  const dias = new Set(
    (data ?? []).map((r) => String(r.data_fato_gerador).slice(0, 10)),
  ).size
  return { linhas, dias }
}

main()
