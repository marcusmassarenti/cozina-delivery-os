/**
 * E-mail diário de saúde das integrações.
 *
 * O veredito vai no ASSUNTO. Num dia verde você resolve o relatório sem abrir
 * — e é isso que faz o hábito durar: relatório que exige abrir todo dia pra
 * ler "está tudo bem" deixa de ser lido na segunda semana, justamente quando
 * aparece o primeiro problema de verdade.
 *
 * Dentro, o que está OK vira contagem; só o que precisa de ação ganha linha.
 */
import "server-only"

import type { SaudeIntegracoes } from "@/lib/data/saude-integracoes"
import { rotulo } from "@/lib/cron-labels"

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.deliveryos.food"
const LARANJA = "#ff4d1c"

const COR = {
  alerta: { fundo: "#fef2f2", borda: "#dc2626", texto: "#991b1b" },
  atencao: { fundo: "#fffbeb", borda: "#d97706", texto: "#92400e" },
  ok: { fundo: "#f0fdf4", borda: "#16a34a", texto: "#166534" },
} as const

/** Nome da plataforma como o Marcus fala, não como o banco guarda. */
const NOMES: Record<string, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
  cardapioweb: "Cardápio Web",
}
const nomePlat = (p: string) => NOMES[p] ?? p

const hora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })

function bloco(g: "alerta" | "atencao" | "ok", titulo: string, itens: string[]): string {
  if (!itens.length) return ""
  const c = COR[g]
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;">
    <tr><td style="background:${c.fundo};border-left:4px solid ${c.borda};border-radius:0 8px 8px 0;padding:16px 18px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:${c.texto};">${titulo}</p>
      ${itens.map((i) => `<p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#3f3f46;">${i}</p>`).join("")}
    </td></tr>
  </table>`
}

/** Só as plataformas que a rede realmente usa entram no placar. */
function placar(r: SaudeIntegracoes["resumo"]): string {
  return (
    [
      ["iFood", r.ifood],
      ["99 Food", r.noveNove],
      ["Keeta", r.keeta],
      ["Cardápio Web", r.cardapioWeb],
    ] as const
  )
    .filter(([, v]) => v.total > 0)
    .map(([nome, v]) => `${nome} ${v.ok}/${v.total}`)
    .join(", ")
}

/** Uma linha da conferência API × planilha (só as que divergem em dia). */
export type ConferenciaResumo = {
  clienteNome: string
  unitCode: string
  unitName: string
  plataforma: string
  pedidosApi: number
  pedidosPlanilha: number
  provavelMotivo: string
}

export function emailSaude(
  s: SaudeIntegracoes,
  /**
   * Conferência entre as duas fontes do mesmo pedido. Vai NESTE e-mail e não
   * num novo: já é o relatório interno diário, e um segundo e-mail competiria
   * com ele pela mesma atenção.
   *
   * Sem limiar por enquanto — de propósito. A lista sai crua e ordenada pra a
   * gente ver a distribuição real na base antes de escolher o corte, em vez de
   * calibrar o alarme por palpite.
   */
  conferencia: ConferenciaResumo[] = [],
): { assunto: string; html: string } {
  const r = s.resumo
  const problemas = s.lojas.filter((l) => l.gravidade === "alerta")
  const atencoes = s.lojas.filter((l) => l.gravidade === "atencao")
  const cronsRuins = s.crons.filter((c) => c.gravidade === "alerta")
  const cronsAviso = s.crons.filter((c) => c.gravidade === "atencao")
  // Loja parada na fila de conexão não é "integração com defeito" — é conexão
  // que nunca começou. Entra nos mesmos blocos porque a pergunta é a mesma:
  // tem algo esperando alguém agir?
  const filaRuim = s.filaIfood.filter((f) => f.gravidade === "alerta")
  const filaAviso = s.filaIfood.filter((f) => f.gravidade === "atencao")
  const linhaFila = (f: (typeof s.filaIfood)[number]) =>
    `<strong>${f.cliente} · ${f.loja}</strong> <span style="font-size:12px;color:#71717a;">(conexão iFood)</span><br/>${f.motivo}`

  // O assunto carrega o veredito inteiro. É a única linha que você é obrigado
  // a ler, então ela precisa bastar.
  const emObservacao = atencoes.length + cronsAviso.length + filaAviso.length
  const assunto = !s.tudoCerto
    ? `⚠️ ${r.lojasAlerta + cronsRuins.length + filaRuim.length} ${
        r.lojasAlerta + cronsRuins.length + filaRuim.length === 1 ? "problema" : "problemas"
      }${
        // Diz logo no assunto ONDE está o problema: iFood e 99 são integrações
        // independentes, e saber qual delas caiu já muda o que você vai abrir.
        r.ifood.alerta && r.noveNove.alerta
          ? " no iFood e na 99 Food"
          : r.ifood.alerta
            ? " no iFood"
            : r.noveNove.alerta
              ? " na 99 Food"
              : " nas rotinas"
      }`
    : emObservacao > 0
      ? `✅ Sem alertas — ${placar(r)}, ${emObservacao} em observação`
      : `✅ Tudo certo — ${placar(r)}`

  const html = `
<div style="margin:0;padding:32px 12px;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;margin:0 auto;">
    <tr><td style="background:#ffffff;border-radius:16px;padding:36px 32px;">

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
        <tr>
          <td style="padding-right:12px;">
            <img src="${SITE}/deliveryos-icon.png" width="36" height="36" alt="D"
                 style="display:block;width:36px;height:36px;border-radius:9px;background:${LARANJA};" />
          </td>
          <td style="font-size:12px;font-weight:700;letter-spacing:1.6px;color:#71717a;text-transform:uppercase;">Delivery OS · Saúde</td>
        </tr>
      </table>

      <h1 style="margin:0 0 6px;font-size:24px;line-height:1.3;color:#18181b;font-weight:700;">
        ${!s.tudoCerto ? "Tem coisa pra olhar" : s.temObservacao ? "Sem alertas hoje" : "Tudo sincronizando"}
      </h1>
      <p style="margin:0 0 24px;font-size:14px;color:#71717a;">Checado em ${hora(s.geradoEm)}</p>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 24px;">
        <tr>
          ${[
            ["iFood", r.ifood],
            ["99 Food", r.noveNove],
            ["Keeta", r.keeta],
            ["Cardápio Web", r.cardapioWeb],
          ]
            .filter(([, v]) => (v as { total: number }).total > 0)
            .map(([nome, v]) => {
              const x = v as { ok: number; total: number; alerta: number }
              return `<td style="padding:14px;background:${x.alerta ? COR.alerta.fundo : COR.ok.fundo};border-radius:10px;text-align:center;">
            <p style="margin:0;font-size:26px;font-weight:700;color:${x.alerta ? COR.alerta.texto : COR.ok.texto};">${x.ok}/${x.total}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#71717a;">${nome}</p>
          </td><td style="width:8px;"></td>`
            })
            .join("")}
          <td style="padding:14px;background:${cronsRuins.length ? COR.alerta.fundo : COR.ok.fundo};border-radius:10px;text-align:center;">
            <p style="margin:0;font-size:26px;font-weight:700;color:${cronsRuins.length ? COR.alerta.texto : COR.ok.texto};">${r.cronsOk}/${s.crons.length}</p>
            <p style="margin:2px 0 0;font-size:12px;color:#71717a;">rotinas rodando</p>
          </td>
        </tr>
      </table>

      ${bloco(
        "alerta",
        "Precisa de ação",
        [
          ...problemas.map(
            (l) =>
              `<strong>${l.cliente} · ${l.loja}</strong> <span style="font-size:12px;color:#71717a;">(${nomePlat(l.plataforma)})</span><br/>${l.motivo}`,
          ),
          ...cronsRuins.map(
            (c) => `<strong>${rotulo(c.nome).titulo}</strong><br/>${c.motivo}`,
          ),
          ...filaRuim.map(linhaFila),
        ],
      )}

      ${bloco(
        "atencao",
        "De olho",
        [
          ...atencoes.map(
            (l) =>
              `<strong>${l.cliente} · ${l.loja}</strong> <span style="font-size:12px;color:#71717a;">(${nomePlat(l.plataforma)})</span><br/>${l.motivo}`,
          ),
          ...cronsAviso.map(
            (c) => `<strong>${rotulo(c.nome).titulo}</strong><br/>${c.motivo}`,
          ),
          ...filaAviso.map(linhaFila),
        ],
      )}

      ${
        s.tudoCerto && !s.temObservacao
          ? bloco("ok", "Nada a fazer", [
              `Placar de hoje: ${placar(r)} — todas com o dado em dia com as próprias vendas. E as ${r.cronsOk} rotinas rodaram nas últimas 24h.`,
            ])
          : ""
      }

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:26px 0 4px;">
        <tr><td align="center">
          <a href="${SITE}/saude" style="display:inline-block;background:${LARANJA};color:#ffffff;text-decoration:none;padding:14px 34px;border-radius:999px;font-size:15px;font-weight:700;">Ver o detalhe de todas as lojas</a>
        </td></tr>
      </table>

      ${
        conferencia.length > 0
          ? `
      <hr style="border:none;border-top:1px solid #e4e4e7;margin:28px 0 16px;" />
      <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#18181b;">API × planilha — ${conferencia.length} loja(s) com dia faltando</p>
      <p style="margin:0 0 12px;font-size:12px;line-height:1.6;color:#71717a;">
        Comparação entre o que a API trouxe e o que o cliente subiu, por dia. Só entram lojas que têm as DUAS fontes.
      </p>
      ${conferencia
        .map(
          (c) => `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 8px;background:#fafafa;border-radius:10px;">
        <tr><td style="padding:10px 12px;font-size:13px;line-height:1.6;color:#3f3f46;">
          <strong>${c.clienteNome} · ${c.unitCode} ${c.unitName}</strong>
          <span style="font-size:12px;color:#71717a;">(${c.plataforma})</span><br/>
          API ${c.pedidosApi} pedidos · planilha ${c.pedidosPlanilha}<br/>
          <span style="color:#71717a;">${c.provavelMotivo}</span>
        </td></tr>
      </table>`,
        )
        .join("")}`
          : ""
      }

      <hr style="border:none;border-top:1px solid #e4e4e7;margin:28px 0 16px;" />
      <p style="margin:0;font-size:12px;line-height:1.6;color:#a1a1aa;">
        Loja sem venda não gera lançamento — por isso a comparação é entre o último pedido e o último dado financeiro de cada loja, não contra o calendário.
      </p>

    </td></tr>
    <tr><td align="center" style="padding:16px 0 0;font-size:12px;color:#a1a1aa;">Delivery OS · relatório interno</td></tr>
  </table>
</div>`.trim()

  return { assunto, html }
}
