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
import type { TipoCozinha } from "../src/lib/unidade-perfil"

const holdingNome = process.argv[2] ?? "DG FOODS"
const aplicar = process.argv.includes("--aplicar")

/**
 * Ordem = desempate quando duas palavras casam na MESMA posição. O critério
 * principal é outro: vence quem aparece antes no nome.
 *
 * "O Conde Churrascaria" tinha virado pizzaria porque o nome fantasia citava
 * pizza; "Espeto do Chefe - Churrasco e Marmitex" tinha virado marmita. Loja
 * põe na frente o que ela é.
 */
const REGRAS: Array<[TipoCozinha, RegExp]> = [
  ["pizzaria", /pizza|forno a lenha|esfih/],
  ["japonesa", /sushi|temaki|yaki|poke|japon|oriental|wok|sashimi/],
  ["hamburgueria", /h[aá]mb|hamburg|burgu|burger|smash/],
  ["acai", /a[çc]a[íi]/],
  ["sorveteria", /sorvete|gelato|milkshake/],
  ["doces", /brownie|confeit|doces|bolo|chocolat|sobremesa/],
  ["marmita", /marmit|prato feito|quentinha/],
  ["churrasco", /churrasc|espet|espeto|grill|parrilla|costela/],
  ["frango", /frango|galeto|assados/],
  ["peixes", /peixe|frutos do mar|camar[ãa]o/],
  ["padaria", /padaria|pane|p[ãa]o/],
  ["salgados", /salgad|coxinh/],
  ["pastel", /pastel|pastelaria/],
  ["arabe", /[áa]rabe|kebab|shawarma|esfiha/],
  ["mexicana", /mexican|burrito|taco/],
  ["saudavel", /fit|saud[áa]vel|natural|salad/],
  ["cafeteria", /caf[ée]|cafeteria/],
  ["massas", /massas|macarr[ãa]o|talharim/],
  ["italiana", /italian|cantina/],
  // Genéricos por último: "Lanches" perde pra "Burguer" se os dois aparecem.
  ["lanches", /lanche|dog|hot ?dog|submarine|sandu|x-|xis /],
  ["brasileira", /caseir|fog[ãa]o|comidinha|sabor fam/],
]

/**
 * Camada de cima: quando a loja escreve a própria categoria no nome ("Santo
 * Peixe - Comida Japonesa"), isso vale mais que qualquer palavra da marca.
 * Sem isso, "Peixe" ganhava de "Japonesa" só por vir antes.
 */
const DECLARADAS: Array<[TipoCozinha, RegExp]> = [
  ["japonesa", /comida (japon|oriental)/],
  ["brasileira", /comida (caseira|brasileira|mineira|baiana)/],
  ["arabe", /comida [áa]rabe/],
  ["mexicana", /comida mexicana/],
  ["italiana", /comida italiana/],
  ["vegetariana", /comida (vegetariana|vegana)/],
]

/**
 * Camada de baixo: palavra que descreve o formato, não o prato. Só entra se
 * NENHUMA regra específica casou — senão "Restaurante Colher de Pau -
 * Marmitas" vira brasileira só porque "Restaurante" abre o nome.
 */
const GENERICAS: Array<[TipoCozinha, RegExp]> = [
  ["brasileira", /restaurante|buffet|self ?service/],
]

function melhorMatch(
  texto: string,
  REGRAS: Array<[TipoCozinha, RegExp]>,
): TipoCozinha | null {
  const n = texto.toLowerCase()
  let melhor: { tipo: TipoCozinha; pos: number; ordem: number } | null = null
  REGRAS.forEach(([tipo, re], ordem) => {
    const m = n.match(re)
    if (!m || m.index === undefined) return
    const cand = { tipo, pos: m.index, ordem }
    if (
      !melhor ||
      cand.pos < melhor.pos ||
      (cand.pos === melhor.pos && cand.ordem < melhor.ordem)
    ) {
      melhor = cand
    }
  })
  return melhor ? (melhor as { tipo: TipoCozinha }).tipo : null
}

/**
 * O nome interno manda. O nome fantasia da Receita só entra quando o interno
 * não diz nada — ele costuma ser mais genérico e às vezes cita um produto
 * secundário da casa.
 */
export function inferirCozinha(
  nome: string,
  nomeFantasia?: string | null,
): TipoCozinha | null {
  const fantasia = nomeFantasia ?? ""
  return (
    melhorMatch(nome, DECLARADAS) ??
    melhorMatch(fantasia, DECLARADAS) ??
    melhorMatch(nome, REGRAS) ??
    melhorMatch(fantasia, REGRAS) ??
    melhorMatch(nome, GENERICAS) ??
    melhorMatch(fantasia, GENERICAS)
  )
}

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
