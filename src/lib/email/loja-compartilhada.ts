import "server-only"

import { contatoDaHolding } from "@/lib/email/contato-holding"
import { enviarEmail } from "@/lib/email/enviar"
import { lojaCompartilhada } from "@/lib/email/templates"
import { resumoDoAno } from "@/lib/email/resumo-da-loja"
import { getLojasCompartilhadasPorHolding } from "@/lib/data/lojas-compartilhadas"

/**
 * Avisa o cliente de que uma loja de terceiro passou a aparecer na conta dele.
 *
 * Roda no cron e é IDEMPOTENTE: a trava do `enviarEmail` (um envio bem
 * sucedido por tipo × cliente) é o que impede de repetir todo dia. Por isso
 * NÃO vai com `forcar`.
 *
 * ⚠️ Limite conhecido: a trava é por CLIENTE, não por loja. Se o mesmo cliente
 * receber uma segunda loja emprestada depois, o e-mail não sai de novo — quem
 * avisa é uma pessoa. Trocar isso exige um carimbo por (cliente, loja), e não
 * vale o peso enquanto o caso for raro.
 *
 * Usa o `resumoDoAno`, que chama as MESMAS funções do topo da unidade. Número
 * que vai pro cliente não pode ter conta própria — foi assim que o e-mail
 * anterior acabou mostrando 29% do faturamento real.
 */
export async function avisarLojasCompartilhadas(): Promise<{
  enviados: { cliente: string; loja: string }[]
  jaEnviados: string[]
  semContato: string[]
}> {
  const out = {
    enviados: [] as { cliente: string; loja: string }[],
    jaEnviados: [] as string[],
    semContato: [] as string[],
  }

  const mapa = await getLojasCompartilhadasPorHolding()
  for (const [holdingId, lojas] of mapa) {
    const loja = lojas[0]
    if (!loja) continue

    const contato = await contatoDaHolding(holdingId)
    if (!contato?.email) {
      out.semContato.push(holdingId)
      continue
    }

    // O ano da loja INTEIRA — as três plataformas, com a mesma régua do
    // painel. A versão anterior mandava só iFood e só o repasse: na Jardins
    // isso era R$ 442 mil no lugar de R$ 1,5 milhão.
    const resumo = await resumoDoAno(loja.unitId)

    const m = lojaCompartilhada({
      nome: contato.nome,
      loja: `#${loja.code} ${loja.name}`,
      dona: loja.donaNome,
      linhas: resumo.linhas,
      plataformas: resumo.plataformas,
    })
    const r = await enviarEmail({
      holdingId,
      tipo: "loja-compartilhada",
      para: contato.email,
      assunto: m.assunto,
      html: m.html,
    })
    if (r.jaEnviado) out.jaEnviados.push(loja.name)
    else if (r.ok) out.enviados.push({ cliente: contato.email, loja: loja.name })
  }

  return out
}
