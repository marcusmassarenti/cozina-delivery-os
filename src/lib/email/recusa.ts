import "server-only"

/**
 * Avisa o cliente de que a solicitação de conexão foi recusada.
 *
 * Mora aqui, e não dentro da server action, porque agora tem DOIS caminhos que
 * recusam: o botão da tela e a expiração automática. Deixar a função no
 * arquivo de actions obrigaria a expiração a reescrever a mesma coisa — e
 * "mesmo conceito em dois lugares" é o erro que já custou caro neste projeto
 * (a regra de canal próprio que existia em dois arquivos e um deles esqueceu
 * o totem).
 *
 * NUNCA lança: quando isto roda, o status já foi gravado. Falhar o e-mail não
 * pode desfazer a recusa nem parecer que a recusa falhou. O retorno é texto
 * pra quem recusou saber se o cliente foi mesmo avisado.
 */
import { contatoDaHolding } from "@/lib/email/contato-holding"
import { enviarEmail } from "@/lib/email/enviar"
import { conexaoRecusada } from "@/lib/email/templates"

export async function avisarRecusaPorEmail(d: {
  holdingId: string | null
  cnpj: string
  loja: string | null
  motivo: string | null
}): Promise<string> {
  if (!d.holdingId) return "Não avisei por e-mail: solicitação sem empresa."
  try {
    const contato = await contatoDaHolding(d.holdingId)
    if (!contato) {
      return "Não avisei por e-mail: a empresa não tem administrador com e-mail confirmado."
    }

    const { assunto, html } = conexaoRecusada({
      nome: contato.nome,
      loja: d.loja,
      cnpj: d.cnpj,
      motivo: d.motivo,
    })
    const r = await enviarEmail({
      holdingId: d.holdingId,
      tipo: "conexao-recusada",
      para: contato.email,
      assunto,
      html,
      // Pode recusar mais de uma vez o mesmo cliente (outro CNPJ, outra loja).
      forcar: true,
    })
    return r.ok
      ? `Avisei ${contato.email} por e-mail.`
      : `Não consegui avisar por e-mail: ${r.erro ?? "falha no envio"}.`
  } catch (e) {
    console.error("avisarRecusaPorEmail", e)
    return "Não consegui avisar por e-mail (erro interno)."
  }
}
