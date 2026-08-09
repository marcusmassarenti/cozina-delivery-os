/**
 * Manda à mão o e-mail "pedi a conexão no iFood, falta você aprovar".
 *
 * Existe porque a ação da tela só dispara quando o status MUDA pra
 * 'solicitada' — e uma solicitação que já está nesse estado há dias (feita
 * antes do e-mail existir) nunca receberia o aviso. Sem isto, a saída seria
 * mexer no status na mão só pra provocar o gatilho.
 *
 *   npx tsx --tsconfig scripts/tsconfig.teste.json --env-file=.env.local \
 *     scripts/enviar-solicitacao-ifood.ts <holding>            # só mostra
 *   ... scripts/enviar-solicitacao-ifood.ts <holding> --enviar # manda
 */
import { createAdminClient } from "../src/lib/supabase/admin"
import { contatoDaHolding } from "../src/lib/email/contato-holding"
import { conexaoSolicitada } from "../src/lib/email/templates"
import { enviarEmail } from "../src/lib/email/enviar"

const nomeHolding = process.argv[2]
const enviar = process.argv.includes("--enviar")

async function main() {
  const admin = createAdminClient()
  const { data: h } = await admin
    .from("holdings").select("id, name").eq("name", nomeHolding).maybeSingle()
  if (!h) throw new Error(`Empresa "${nomeHolding}" não encontrada.`)

  const { data: reqs } = await admin
    .from("ifood_activation_requests")
    .select("cnpj, status, units(name)")
    .eq("holding_id", h.id)
    .eq("status", "solicitada")
  if (!reqs?.length) throw new Error("Nenhuma solicitação em 'solicitada'.")

  const contato = await contatoDaHolding(h.id as string)
  if (!contato) throw new Error("Empresa sem administrador com e-mail confirmado.")

  console.log(`empresa   ${h.name}`)
  console.log(`vai para  ${contato.nome ?? "(sem nome)"} <${contato.email}>`)
  for (const r of reqs) {
    const loja = (r.units as { name?: string } | null)?.name ?? null
    const { assunto } = conexaoSolicitada({ nome: contato.nome, loja, cnpj: r.cnpj as string })
    console.log(`  · ${loja} — ${r.cnpj}\n    assunto: ${assunto}`)
  }

  if (!enviar) {
    console.log("\n(simulação — rode com --enviar pra mandar de verdade)")
    return
  }
  for (const r of reqs) {
    const loja = (r.units as { name?: string } | null)?.name ?? null
    const { assunto, html } = conexaoSolicitada({ nome: contato.nome, loja, cnpj: r.cnpj as string })
    const res = await enviarEmail({
      holdingId: h.id as string, tipo: "conexao-solicitada",
      para: contato.email, assunto, html, forcar: true,
    })
    console.log(res.ok ? `✓ enviado: ${loja}` : `✗ falhou: ${res.erro}`)
  }
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
