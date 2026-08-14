/**
 * Cobra do cliente a confirmação de que ele aprovou a conexão no iFood.
 *
 * SIMULA por padrão — mostra quem receberia, com quais lojas, e não manda
 * nada. Envia de verdade só com `--enviar`.
 *
 * A simulação existe porque este e-mail sai UMA vez por loja: se ele for pro
 * contato errado ou com a loja errada na lista, não há segunda chance de
 * causar a impressão certa.
 *
 *   npx tsx --tsconfig scripts/tsconfig.teste.json --env-file=.env.local \
 *     scripts/cobrar-confirmacao-conexao.ts [--enviar] [--dias=N] [--holding=<uuid>]
 *
 * `--dias` e `--holding` são pra disparo à mão, quando já se sabe que a loja
 * travou e esperar o prazo não muda nada. O cron nunca passa esses dois.
 */
import {
  cobrarConfirmacaoDeConexao,
  expirarSolicitacoesParadas,
} from "../src/lib/email/conexao-sem-dado"

async function main() {
  const enviar = process.argv.includes("--enviar")
  const dias = process.argv.find((a) => a.startsWith("--dias="))?.split("=")[1]
  const holding = process.argv
    .find((a) => a.startsWith("--holding="))
    ?.split("=")[1]

  const r = await cobrarConfirmacaoDeConexao(!enviar, {
    diasMinimos: dias ? Number(dias) : undefined,
    holdingIds: holding ? [holding] : undefined,
  })

  console.log(
    enviar
      ? `\n=== ENVIADO — ${r.clientes} cliente(s), ${r.lojas} loja(s) ===`
      : `\n=== SIMULAÇÃO — ${r.clientes} cliente(s), ${r.lojas} loja(s) receberiam ===`,
  )
  for (const e of r.enviados) {
    console.log(`\n• ${e.cliente}  →  ${e.para}`)
    for (const l of e.lojas) console.log(`    - ${l}`)
    if (e.erro) console.log(`    ⚠️  ${e.erro}`)
  }
  if (r.enviados.length === 0) console.log("(nenhuma loja a cobrar)")

  // Quem passou do prazo volta à estaca zero.
  const exp = await expirarSolicitacoesParadas(!enviar)
  console.log(
    `\n=== ${enviar ? "EXPIRADAS" : "EXPIRARIAM"}: ${exp.expiradas.length} ===`,
  )
  for (const e of exp.expiradas) console.log(`  • ${e.cliente} — ${e.loja}`)
  if (exp.reincidentes.length > 0) {
    console.log(
      `\n⚠️  ${exp.reincidentes.length} já expiraram antes — NÃO expiram de novo, precisam de gente:`,
    )
    for (const e of exp.reincidentes) console.log(`  • ${e.cliente} — ${e.loja}`)
  }
  if (!enviar) console.log("\nNada foi enviado. Rode com --enviar pra valer.")
}

void main()
