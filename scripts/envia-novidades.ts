/**
 * Dispara a campanha de novidades.
 *
 *   ... scripts/envia-novidades.ts --teste   # só pro Marcus
 *   ... scripts/envia-novidades.ts --enviar  # todos os clientes
 */
import { enviarNovidades } from "@/lib/email/novidades"
import { enviarEmail } from "@/lib/email/enviar"
import { novidadesAgosto26 } from "@/lib/email/templates"

async function main() {
  const args = process.argv.slice(2)
  if (args.includes("--teste")) {
    const m = novidadesAgosto26({ nome: "Marcus" })
    const r = await enviarEmail({
      holdingId: null,
      tipo: "novidades-ago26",
      para: "marcus@cozinafoods.com",
      assunto: `[TESTE] ${m.assunto}`,
      html: m.html,
      forcar: true,
    })
    console.log(JSON.stringify(r, null, 2))
    return
  }
  if (!args.includes("--enviar")) {
    console.log("Use --teste ou --enviar")
    return
  }
  const r = await enviarNovidades({ confirmar: true })
  console.log(JSON.stringify(r, null, 2))
}
void main()
