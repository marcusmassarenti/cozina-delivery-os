import "server-only"

/**
 * Aviso SEMANAL para o cliente: "sua loja parou de mandar dados".
 *
 * É o mesmo diagnóstico do relatório interno, escrito para quem não conhece a
 * máquina por dentro. As diferenças que importam:
 *
 *  • O interno é um painel de controle — placar, volume, rotinas. Este aqui
 *    responde três perguntas e só: qual loja, desde quando, o que eu faço.
 *  • O interno sai TODO dia, inclusive verde, porque silêncio ambíguo é o modo
 *    de falha dele. Este só sai quando há problema: e-mail semanal dizendo
 *    "está tudo bem" treina o cliente a arquivar sem ler, e aí o dia em que
 *    algo quebra ele arquiva também.
 *  • Nada de jargão nosso: "extrato", "cron", "sync" e "conciliação" não
 *    aparecem. O cliente entende "faturamento" e "relatório".
 *
 * ⚠️ Por decisão do Marcus (08/ago/26), nas duas primeiras semanas este e-mail
 * vai SÓ pra ele, com uma tarja dizendo pra quem iria. Estrear um e-mail
 * automático direto na caixa do cliente é o tipo de coisa que só dá pra
 * corrigir depois que já saiu.
 */
import type { PlatformId } from "@/components/platform-logo"

import type { GrupoCliente } from "@/lib/data/saude-agrupada"

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.deliveryos.food"
const LARANJA = "#ff4d1c"

const NOMES: Record<string, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
  cardapioweb: "Cardápio Web",
}

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/**
 * Quantas lojas aparecem com nome antes de virar contagem.
 *
 * A DG FOODS tem 37 lojas na lista. Trinta e sete cartões num e-mail não é
 * relatório, é paredão — e a primeira reação a um paredão é marcar como spam,
 * o que mata o canal justamente antes da semana em que ele importaria. Cinco
 * nomes bastam pra pessoa reconhecer o problema; o resto vira um número e um
 * botão. É a mesma régua que resolveu o relatório interno.
 */
const TETO = 5

function logos(plats: PlatformId[]): string {
  return plats
    .map(
      (p) =>
        `<img src="${SITE}/platforms/${p}.png" width="18" height="18" alt="${NOMES[p] ?? p}" style="display:inline-block;width:18px;height:18px;border-radius:4px;vertical-align:-4px;margin-right:4px;" />`,
    )
    .join("")
}

/**
 * Marcações de plataforma que NUNCA trouxeram dado.
 *
 * Não é a mesma coisa que "parou": aqui nunca começou. E a causa o sistema não
 * consegue deduzir — pode ser relatório que falta subir na primeira vez, ou
 * plataforma marcada no cadastro em que a loja nunca vendeu. Só o dono sabe,
 * então o texto pergunta em vez de acusar.
 */
export type NuncaTrouxe = {
  /** Marcações sem conexão nenhuma — dependem de uma ação do cliente. */
  semConexao: number
  /** Em quantas lojas distintas elas estão. */
  lojas: number
  /** Conectadas por API, primeira carga ainda vindo — não pedem nada. */
  aguardando: number
}

export function emailClienteIntegracao(
  grupo: GrupoCliente,
  /** Quando presente, o e-mail sai com a tarja de prévia interna. */
  previaPara?: string,
  nunca?: NuncaTrouxe,
): { assunto: string; html: string } {
  const n = grupo.lojas.length
  const assunto =
    n === 1
      ? `Sua loja ${grupo.lojas[0].loja} está sem dados no Delivery OS`
      : `${n} das suas lojas estão sem dados no Delivery OS`

  // As mais antigas primeiro: parada há 12 dias é pior que parada há 2.
  const ordenadas = [...grupo.lojas].sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0))
  const mostra = ordenadas.slice(0, TETO)
  const resto = ordenadas.length - mostra.length

  const linhas = mostra
    .map(
      (l) => `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 10px;background:#fafafa;border-radius:10px;">
      <tr><td style="padding:14px 16px;">
        <p style="margin:0 0 3px;font-size:15px;font-weight:700;color:#18181b;">
          ${logos(l.plataformas)}${l.loja}
        </p>
        <p style="margin:0;font-size:13px;color:#71717a;">
          ${
            l.tipo === "nunca" || l.dias === null
              ? "Ainda não recebemos nenhum dado desta loja."
              : l.tipo === "financeiro"
                ? // A loja está vendendo — o que não chegou foi o dinheiro
                  // daquelas vendas. Dizer "parou" aqui assustaria à toa.
                  `Os pedidos estão chegando normalmente, mas o faturamento parou em ${
                    l.ultimoFinanceiro ? dm(l.ultimoFinanceiro) : "—"
                  }${l.ultimoPedido ? `, e a loja vendeu até ${dm(l.ultimoPedido)}` : ""}. Os relatórios desses dias estão sem valor.`
                : `Sem dados novos ${l.desde ? `desde ${dm(l.desde)}` : ""}${
                    l.dias > 0 ? ` — ${l.dias} dia${l.dias === 1 ? "" : "s"}` : ""
                  }${l.ultimoPedido ? `. O último pedido que chegou foi em ${dm(l.ultimoPedido)}.` : "."}`
          }
        </p>
      </td></tr>
    </table>`,
    )
    .join("")

  const html = `
<div style="margin:0;padding:32px 12px;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;">
    ${
      previaPara
        ? `<tr><td style="background:#18181b;color:#fafafa;border-radius:12px;padding:12px 16px;font-size:12px;line-height:1.5;">
             <strong>PRÉVIA INTERNA</strong> — este e-mail iria para <strong>${previaPara}</strong>.
             Ninguém de fora recebeu. Ajuste o texto antes de liberar.
           </td></tr><tr><td style="height:12px;"></td></tr>`
        : ""
    }
    <tr><td style="background:#ffffff;border-radius:16px;padding:36px 32px;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;">
        <tr>
          <td style="padding-right:12px;">
            <img src="${SITE}/deliveryos-icon.png" width="36" height="36" alt="Delivery OS"
                 style="display:block;width:36px;height:36px;border-radius:9px;background:${LARANJA};" />
          </td>
          <td style="font-size:12px;font-weight:700;letter-spacing:1.6px;color:#71717a;text-transform:uppercase;">Delivery OS</td>
        </tr>
      </table>

      <h1 style="margin:0 0 12px;font-size:23px;line-height:1.3;color:#18181b;font-weight:700;">
        ${n === 1 ? "Uma loja sua parou de mandar dados" : `${n} lojas suas pararam de mandar dados`}
      </h1>

      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3f3f46;">
        Enquanto isso, o faturamento, as taxas e as avaliações ${n === 1 ? "dessa loja" : "dessas lojas"}
        não entram nos seus relatórios — e o mês aparece menor do que foi de verdade no seu painel.
      </p>

      ${linhas}
      ${
        resto > 0
          ? `<p style="margin:2px 0 0;font-size:13px;color:#71717a;">
               E mais <strong>${resto}</strong> ${resto === 1 ? "loja" : "lojas"} na mesma situação —
               a lista completa está no painel.
             </p>`
          : ""
      }

      ${
        nunca && nunca.semConexao > 0
          ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:18px 0 0;">
        <tr><td style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:16px 18px;">
          <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#075985;">
            E ${nunca.semConexao} ${nunca.semConexao === 1 ? "plataforma marcada" : "plataformas marcadas"} que nunca trouxe${nunca.semConexao === 1 ? "" : "ram"} dado
          </p>
          <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#0c4a6e;">
            Em ${nunca.lojas} ${nunca.lojas === 1 ? "loja" : "lojas"} do seu cadastro. Isso costuma ser
            uma de duas coisas, e só você sabe qual:
          </p>
          <p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#0c4a6e;">
            <strong>1. Falta puxar pela primeira vez.</strong> Suba o relatório dessa plataforma em
            <strong>Importação</strong> e o histórico entra de uma vez.
          </p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#0c4a6e;">
            <strong>2. A loja nunca vendeu por ali.</strong> Aí é o cadastro que está a mais — no
            painel, cada uma tem o botão <em>“não vendo nessa plataforma”</em>. Um clique tira a
            marcação e o aviso para de aparecer.
          </p>
          ${
            nunca.aguardando > 0
              ? `<p style="margin:10px 0 0;padding-top:8px;border-top:1px solid #bae6fd;font-size:13px;color:#0369a1;">
                   Outras ${nunca.aguardando} já estão conectadas e a primeira carga ainda está vindo —
                   essas não precisam de nada da sua parte.
                 </p>`
              : ""
          }
        </td></tr>
      </table>`
          : ""
      }

      <p style="margin:22px 0 8px;font-size:15px;font-weight:700;color:#18181b;">Como resolver</p>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#3f3f46;">
        <strong>Se a loja é conectada direto na plataforma:</strong> a autorização pode ter expirado.
        Refaça a conexão na tela <strong>Conexões</strong> — leva menos de um minuto e o histórico
        entra sozinho depois.
      </p>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#3f3f46;">
        <strong>Se você envia os relatórios manualmente:</strong> baixe o relatório no portal da
        plataforma e suba em <strong>Importação</strong>. Os dias que faltam entram de uma vez.
      </p>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:26px 0 4px;">
        <tr><td align="center">
          <a href="${SITE}/conexoes" style="display:inline-block;background:${LARANJA};color:#ffffff;text-decoration:none;padding:14px 34px;border-radius:999px;font-size:15px;font-weight:700;">Resolver agora</a>
        </td></tr>
      </table>

      <hr style="border:none;border-top:1px solid #e4e4e7;margin:26px 0 14px;" />
      <p style="margin:0;font-size:12px;line-height:1.6;color:#a1a1aa;">
        Uma vez por semana a gente confere se todas as suas lojas estão mandando dados.
        Quando está tudo certo, este e-mail não sai — se ele chegou, é porque tem algo pra olhar.
      </p>

    </td></tr>
    <tr><td align="center" style="padding:16px 0 0;font-size:12px;color:#a1a1aa;">Delivery OS</td></tr>
  </table>
</div>`.trim()

  return { assunto, html }
}
