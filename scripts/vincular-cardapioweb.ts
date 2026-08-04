/**
 * Vincula à loja as instalações do Cardápio Web que ficaram sem unidade.
 *
 * O QUE FAZ
 * Passa por toda instalação com `unit_id` nulo e aplica a mesma regra do
 * callback (src/lib/cardapioweb/vincular-automatico.ts): se a empresa tem
 * exatamente UMA loja ativa, vincula nela. Com duas ou mais, deixa em branco —
 * chutar misturaria o faturamento de uma loja na outra.
 *
 * QUANDO RODAR
 *  - Depois de um deploy que mudou a regra de vínculo (pra alcançar o que já
 *    estava conectado antes).
 *  - Quando aparecer instalação sem vínculo que deveria ter — por exemplo, uma
 *    conexão que entrou enquanto o deploy estava no ar.
 *  - Depois de cadastrar a primeira loja de um cliente que já tinha conectado
 *    o Cardápio Web antes de ter loja no sistema.
 *
 * É SEGURO RODAR DE NOVO? SIM.
 * A regra só toca em `unit_id` nulo, então nunca sobrescreve vínculo existente
 * — nem o que alguém fez à mão. Rodar duas vezes seguidas: a segunda não muda
 * nada.
 *
 * POR QUE ELE EXISTE
 * Quem conecta pela CW App Store não passa pelo nosso seletor de unidade: o
 * lojista clica em Instalar lá e autoriza direto. A instalação nasce sem loja,
 * e sem loja o faturamento entra no banco mas não aparece no dashboard nem no
 * DRE. Aconteceu na primeira conexão de produção que tivemos (joao nilson,
 * 04/ago/26 11h43): o e-mail de aviso chegou dizendo "sem unidade vinculada"
 * com a loja bem ali, óbvia, porque ele só tem uma.
 *
 *   npx tsx --tsconfig scripts/tsconfig.teste.json --env-file=.env.local \
 *     scripts/vincular-cardapioweb.ts
 */
import { createAdminClient } from "../src/lib/supabase/admin"
import { vincularSeObvio } from "../src/lib/cardapioweb/vincular-automatico"

async function main() {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from("cardapioweb_installs")
    .select("id, merchant_name, ambiente")
    .is("unit_id", null)
    .order("created_at")

  if (error) {
    console.error("Não consegui listar as instalações:", error.message)
    process.exitCode = 1
    return
  }

  const soltas = (data ?? []) as {
    id: string
    merchant_name: string | null
    ambiente: string
  }[]

  if (soltas.length === 0) {
    console.log("Nenhuma instalação sem unidade. Nada a fazer.")
    return
  }

  console.log(`${soltas.length} instalação(ões) sem unidade:\n`)

  let vinculadas = 0
  for (const i of soltas) {
    const unitId = await vincularSeObvio(i.id)
    if (unitId) vinculadas++
  }

  console.log(
    `\n${vinculadas} vinculada(s) · ${soltas.length - vinculadas} deixada(s) pro humano.`,
  )
  if (soltas.length - vinculadas > 0) {
    console.log(
      "As que sobraram têm mais de uma loja ativa — resolva em /integracao/cardapioweb.",
    )
  }
}

main()
