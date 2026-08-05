/**
 * Avisa o dono da plataforma que um cliente pediu a conexão do 99 Food.
 *
 * Gêmeo do aviso do iFood, e pelo mesmo motivo: a conexão não é self-service.
 * A diferença está em QUEM age depois — no iFood abrimos o Portal do
 * Desenvolvedor; aqui é preciso falar com o 99 pra autorizar a loja ao nosso
 * app e obter o `app_shop_id`. A frase do e-mail diz isso, senão o aviso chega
 * sem dizer o que fazer com ele.
 *
 * Nunca lança: quando isto roda, o pedido do cliente JÁ está gravado.
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

export async function avisarSolicitacaoNinefood(
  holdingId: string,
  d: { cnpj: string; unitId: string; loja99: string | null },
): Promise<void> {
  try {
    const { cliente, unidade } = await contextoConexao(holdingId, d.unitId)

    await enviarEmail({
      // Interno, não é régua de cliente — ver a nota no aviso do iFood.
      holdingId: null,
      tipo: "ninefood-solicitacao",
      para: DESTINO,
      assunto: `99 Food: ${cliente} pediu conexão · ${unidade}`,
      html: montarAvisoConexao({
        plataforma: "99 Food",
        titulo: "Pedido de conexão",
        linhas:
          linhaAviso("Cliente", `<strong>${cliente}</strong>`) +
          linhaAviso("Unidade", unidade) +
          linhaAviso("CNPJ", `<strong>${cnpjBonito(d.cnpj)}</strong>`) +
          (d.loja99 ? linhaAviso("Loja no 99", d.loja99) : ""),
        proximoPasso:
          "Próximo passo é <strong>nosso</strong>: pedir ao 99 que autorize essa loja ao nosso app e devolva o <code>app_shop_id</code>. Só depois disso o token por loja funciona. Atenção: uma loja só pode estar ligada a <strong>um</strong> app — se ela já usa outro integrador, confirme com o cliente antes.",
        acaoHref: "/clientes/conexoes",
        acaoTexto: "Abrir a fila de ativação",
      }),
      forcar: true,
    })
  } catch (e) {
    console.error(
      "[avisarSolicitacaoNinefood]",
      e instanceof Error ? e.message : e,
    )
  }
}
