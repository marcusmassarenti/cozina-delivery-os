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

import { createAdminClient } from "@/lib/supabase/admin"
import { enviarEmail } from "@/lib/email/enviar"

const DESTINO = process.env.SAUDE_EMAIL ?? "marcus@massarenti.me"
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.deliveryos.food"

/** Formata CNPJ pra leitura (00.000.000/0000-00). Entra só dígito. */
function cnpjBonito(cnpj: string): string {
  const d = cnpj.replace(/\D/g, "")
  if (d.length !== 14) return cnpj
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

type Evento =
  | { tipo: "pedido"; cnpj: string; unitId: string }
  | { tipo: "aprovacao"; lojas: number; unitId: string | null }

/** Nome do cliente e da unidade, pra mensagem não falar em UUID. */
async function contexto(holdingId: string, unitId: string | null) {
  const admin = createAdminClient()
  const [hold, uni] = await Promise.all([
    admin.from("holdings").select("name").eq("id", holdingId).maybeSingle(),
    unitId
      ? admin.from("units").select("code, name").eq("id", unitId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const u = uni.data as { code?: string; name?: string } | null
  return {
    cliente: (hold.data as { name?: string } | null)?.name ?? "cliente não identificado",
    unidade: u ? `${u.code ? `${u.code} · ` : ""}${u.name}` : "—",
  }
}

const MOLDURA = (titulo: string, linhas: string, chamada: string, acao: string) =>
  `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;padding:24px;color:#18181b;">
  <p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:1.4px;color:#71717a;text-transform:uppercase;">Delivery OS · iFood</p>
  <h1 style="margin:0 0 16px;font-size:20px;">${titulo}</h1>
  <table cellpadding="0" cellspacing="0" border="0" style="font-size:14px;line-height:1.7;">
    ${linhas}
  </table>
  <p style="margin:16px 0 0;font-size:13px;color:#1e40af;background:#eff6ff;border-left:3px solid #2563eb;padding:10px 12px;">${chamada}</p>
  <p style="margin:20px 0 0;"><a href="${SITE}${acao}" style="color:#ff4d1c;font-weight:600;">Abrir a fila de ativação</a></p>
</div>`.trim()

const linha = (r: string, v: string) =>
  `<tr><td style="padding-right:16px;color:#71717a;">${r}</td><td>${v}</td></tr>`

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
    const { cliente, unidade } = await contexto(holdingId, ev.unitId)

    const pedido = ev.tipo === "pedido"
    const assunto = pedido
      ? `iFood: ${cliente} pediu conexão · ${unidade}`
      : `iFood: ${cliente} aprovou no portal — pronto pra vincular`

    const html = pedido
      ? MOLDURA(
          "Pedido de conexão",
          linha("Cliente", `<strong>${cliente}</strong>`) +
            linha("Unidade", unidade) +
            linha("CNPJ", `<strong>${cnpjBonito(ev.cnpj)}</strong>`),
          "Próximo passo é <strong>nosso</strong>: solicitar essa loja no Portal do Desenvolvedor do iFood. Depois o cliente aprova no Portal do Parceiro dele.",
          "/clientes/conexoes",
        )
      : MOLDURA(
          "Cliente aprovou a conexão",
          linha("Cliente", `<strong>${cliente}</strong>`) +
            linha(
              ev.lojas > 1 ? "Lojas aprovadas" : "Unidade",
              ev.lojas > 1 ? `<strong>${ev.lojas} lojas</strong>` : unidade,
            ),
          "O cliente já aprovou no Portal do Parceiro. <strong>Agora é a nossa vez</strong>: vincular a loja e puxar o histórico.",
          "/clientes/conexoes",
        )

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
