/**
 * Avisa o dono da plataforma quando um cliente mexe na fila de ativação do
 * iFood — pediu a conexão, ou confirmou que já aprovou no portal dele.
 *
 * Por que existe: a conexão do iFood NÃO é self-service. O cliente só pode
 * pedir; quem age depois somos nós, no Portal do Desenvolvedor. Até agora o
 * pedido caía numa tabela em silêncio, e só era descoberto por quem abrisse a
 * tela de admin. Cliente esperando conexão sem ninguém saber que ele pediu é o
 * pior momento possível pra um SaaS ficar quieto — vale ainda mais na segunda
 * etapa, que é literalmente "é a sua vez".
 *
 * Espelha `cardapioweb/avisar-instalacao.ts`, inclusive no princípio de nunca
 * lançar: quando isto roda, o pedido do cliente JÁ está gravado. Falhar o
 * e-mail não pode transformar uma solicitação bem-sucedida em erro na tela.
 */
import "server-only"

import { enviarEmail } from "@/lib/email/enviar"
import {
  cnpjBonito,
  contextoConexao,
  linhaAviso,
  montarAvisoConexao,
} from "@/lib/email/aviso-conexao"

const DESTINO = process.env.SAUDE_EMAIL ?? "marcus@massarenti.me"

type Evento =
  | { tipo: "pedido"; cnpj: string; unitId: string }
  | { tipo: "aprovacao"; lojas: number; unitId: string | null }

/**
 * Dispara o aviso. Nunca lança — o erro vai pro log e a vida segue.
 *
 * Chame com `void` (sem await) quando estiver no caminho de uma server action:
 * o cliente não deve esperar o Resend responder pra ver que o pedido entrou.
 */
export async function avisarSolicitacaoIfood(
  holdingId: string,
  ev: Evento,
): Promise<void> {
  try {
    const { cliente, unidade } = await contextoConexao(holdingId, ev.unitId)

    const pedido = ev.tipo === "pedido"
    const assunto = pedido
      ? `iFood: ${cliente} pediu conexão · ${unidade}`
      : `iFood: ${cliente} aprovou no portal — pronto pra vincular`

    const html = pedido
      ? montarAvisoConexao({
          plataforma: "iFood",
          titulo: "Pedido de conexão",
          linhas:
            linhaAviso("Cliente", `<strong>${cliente}</strong>`) +
            linhaAviso("Unidade", unidade) +
            linhaAviso("CNPJ", `<strong>${cnpjBonito(ev.cnpj)}</strong>`),
          proximoPasso:
            "Próximo passo é <strong>nosso</strong>: solicitar essa loja no Portal do Desenvolvedor do iFood. Depois o cliente aprova no Portal do Parceiro dele.",
          acaoHref: "/clientes/conexoes",
          acaoTexto: "Abrir a fila de ativação",
        })
      : montarAvisoConexao({
          plataforma: "iFood",
          titulo: "Cliente aprovou a conexão",
          linhas:
            linhaAviso("Cliente", `<strong>${cliente}</strong>`) +
            linhaAviso(
              ev.lojas > 1 ? "Lojas aprovadas" : "Unidade",
              ev.lojas > 1 ? `<strong>${ev.lojas} lojas</strong>` : unidade,
            ),
          proximoPasso:
            "O cliente já aprovou no Portal do Parceiro. <strong>Agora é a nossa vez</strong>: vincular a loja e puxar o histórico.",
          acaoHref: "/clientes/conexoes",
          acaoTexto: "Abrir a fila de ativação",
        })

    await enviarEmail({
      // holdingId null de propósito: este e-mail é INTERNO, não é régua do
      // cliente. Passar a holding faria a trava de duplicidade tratar "já
      // avisei sobre esse cliente" como "não avisar de novo" — e uma rede
      // conecta 7 lojas, uma por vez.
      holdingId: null,
      tipo: pedido ? "ifood-solicitacao" : "ifood-aprovacao-confirmada",
      para: DESTINO,
      assunto,
      html,
      forcar: true,
    })
  } catch (e) {
    console.error("[avisarSolicitacaoIfood]", e instanceof Error ? e.message : e)
  }
}
