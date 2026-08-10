/**
 * Gera o HTML do e-mail "conectado — olha o que já entrou" SEM enviar.
 *
 * POR QUE EXISTE: esse e-mail sai uma vez só por (loja, plataforma) e é a
 * primeira coisa que o cliente lê depois de autorizar. Não dá pra "mandar pra
 * ver como ficou" — o carimbo `email_conectado_at` queima a única chance.
 *
 * ⚠️ Usa `resumoDaLoja` do próprio módulo de envio, de propósito. Refazer as
 * consultas aqui daria um preview bonito que não prova nada sobre o e-mail
 * real — é o erro de "mesmo conceito em dois lugares" que já custou caro neste
 * projeto.
 *
 *   npx tsx --tsconfig scripts/tsconfig.teste.json --env-file=.env.local \
 *     scripts/preview-email-conectado.ts "<trecho do nome da loja>" [plataforma]
 */
import { createAdminClient } from "../src/lib/supabase/admin"
import {
  resumoDaLoja,
  type PlataformaConexao,
} from "../src/lib/email/conexao-ativada"
import { conexaoAtivada } from "../src/lib/email/templates"
import { writeFileSync } from "node:fs"

const busca = process.argv[2]
const plataforma = (process.argv[3] ?? "ifood") as PlataformaConexao
const saida = process.argv[4] ?? "/tmp/preview-conectado.html"

if (!busca) {
  console.error('uso: preview-email-conectado.ts "<nome da loja>" [plataforma]')
  process.exit(1)
}

async function main() {
  const admin = createAdminClient()
  const { data: lojas, error } = await admin
    .from("units")
    .select("id, name, brand_id")
    .ilike("name", `%${busca}%`)
    .limit(5)

  // Sem isso, erro de consulta vira "nenhuma loja encontrada" — a mesma tela
  // de "não existe", que manda procurar no lugar errado.
  if (error) {
    console.error("Consulta falhou:", error.message)
    process.exit(1)
  }
  if (!lojas?.length) {
    console.error(`Nenhuma loja com "${busca}".`)
    process.exit(1)
  }
  if (lojas.length > 1) {
    console.error("Mais de uma loja bate. Seja mais específico:")
    for (const l of lojas) console.error(`  · ${l.name}`)
    process.exit(1)
  }

  const loja = lojas[0]
  const resumo = await resumoDaLoja(loja.id, plataforma)

  // O envio real desiste quando não há dado — o preview precisa dizer isso em
  // vez de mostrar um e-mail vazio que nunca sairia.
  if (!resumo.temDado) {
    console.error(
      `\n⚠️  ${loja.name}: sem dado de ${plataforma}. O e-mail NÃO sairia.\n`,
    )
  }

  // A loja pendura na marca, e a marca no cliente — não há holding_id em units.
  const { data: dono } = await admin
    .from("brands")
    .select("holdings(name)")
    .eq("id", loja.brand_id)
    .maybeSingle()

  const email = conexaoAtivada({
    nome: null, // o envio real resolve o contato; aqui o que importa é o corpo
    loja: loja.name,
    plataforma:
      plataforma === "ifood"
        ? "iFood"
        : plataforma === "99food"
          ? "99 Food"
          : "Cardápio Web",
    linhas: resumo.linhas,
    pendencias: resumo.pendencias,
  })

  writeFileSync(saida, email.html)
  const cliente = (dono as { holdings?: { name?: string } } | null)?.holdings
  console.log(`Cliente:   ${cliente?.name ?? "—"}`)
  console.log(`Loja:      ${loja.name}`)
  console.log(`Assunto:   ${email.assunto}`)
  console.log(`Tem dado:  ${resumo.temDado ? "sim" : "NÃO — não sairia"}`)
  console.log("\nCorpo:")
  for (const l of resumo.linhas) console.log(`  ${l.rotulo}: ${l.valor}`)
  for (const p of resumo.pendencias) console.log(`  ⚠ ${p}`)
  console.log(`\nHTML: ${saida}`)
}

main()
