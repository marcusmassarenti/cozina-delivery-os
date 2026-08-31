import "server-only"

/**
 * Aviso SEMANAL para o cliente: "sua CONEXÃO precisa de você".
 *
 * ── SÓ CONEXÃO, E ISSO MUDOU EM 31/08/26 ────────────────────────────────
 * Este e-mail já foi "suas lojas pararam de mandar dados" e essa versão saiu
 * do ar antes de chegar a cliente nenhum. A prévia mostrou o problema: a
 * linha "os pedidos estão chegando normalmente, mas o faturamento parou em
 * 27/08" descreve um SINTOMA sem causa — e quem lê conclui, com razão, que o
 * defeito é do sistema que está escrevendo. Cobrar o cliente por uma falha
 * que pode ser nossa gasta a confiança que o canal existe pra construir
 * (Marcus).
 *
 * Então entra AQUI só o que a causa é comprovadamente do lado dele e a ação
 * é dele:
 *
 *   1. loja que autorizou o acesso e não foi cadastrada;
 *   2. loja que sumiu da lista do iFood — a autorização caiu e precisa ser
 *      refeita no Portal do Parceiro;
 *   3. plataforma marcada no cadastro sem integração ligada.
 *
 * "Vendia e parou" e "o financeiro parou antes dos pedidos" FICAM NO
 * RELATÓRIO INTERNO. A causa pode ser nossa, e enquanto não soubermos qual é
 * não é assunto pra caixa de entrada do cliente.
 *
 * As outras regras seguem valendo:
 *  • Só sai quando há problema. E-mail semanal dizendo "está tudo bem" treina
 *    o cliente a arquivar sem ler, e aí o dia em que algo quebra ele arquiva
 *    junto.
 *  • Nada de jargão: "extrato", "cron", "sync" e "conciliação" não aparecem.
 *
 * ⚠️ Por decisão do Marcus (08/ago/26), o disparo passa por `AVISO_CLIENTE_
 * LIBERADO`: enquanto ela não for "1", tudo vai pro endereço interno com uma
 * tarja dizendo pra quem iria.
 */
import type { LojaEsperando } from "@/lib/data/merchants-esperando"

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.deliveryos.food"
const LARANJA = "#ff4d1c"

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


export type LojaSumidaAviso = {
  nome: string
  cnpj: string | null
  dias: number
}

export function emailClienteIntegracao(
  cliente: string,
  /** Quando presente, o e-mail sai com a tarja de prévia interna. */
  previaPara: string | undefined,
  /** Lojas que autorizaram o acesso e não foram cadastradas. */
  esperando: LojaEsperando[],
  /** Lojas cuja autorização caiu — sumiram da lista do iFood. */
  sumidas: LojaSumidaAviso[],
  /** Plataformas marcadas no cadastro sem integração ligada. */
  semConexao: { plataformas: number; lojas: number } | null,
): { assunto: string; html: string } {
  const totalAcoes =
    esperando.length + sumidas.length + (semConexao?.plataformas ?? 0)

  /* O assunto nomeia a AÇÃO, não o sintoma.
   *
   * "2 das suas lojas estão sem dados" descrevia o que aconteceu e deixava a
   * causa em aberto — e causa em aberto num e-mail nosso é lida como culpa
   * nossa. "Falta cadastrar" e "precisa reconectar" dizem o que fazer. */
  const assunto =
    esperando.length > 0 && sumidas.length === 0
      ? esperando.length === 1
        ? `${esperando[0].nome}: falta cadastrar a loja no Delivery OS`
        : `${esperando.length} lojas autorizaram o acesso e faltam cadastrar`
      : sumidas.length > 0 && esperando.length === 0
        ? sumidas.length === 1
          ? `${sumidas[0].nome}: a conexão com o iFood precisa ser refeita`
          : `${sumidas.length} lojas precisam reconectar com o iFood`
        : `${totalAcoes} conexões das suas lojas precisam de você`

  const cartao = (
    titulo: string,
    detalhe: string,
    rodape: string,
  ) => `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 10px;background:#fafafa;border-radius:10px;">
      <tr><td style="padding:14px 16px;">
        <p style="margin:0 0 3px;font-size:15px;font-weight:700;color:#18181b;">${titulo}</p>
        <p style="margin:0;font-size:13px;color:#71717a;">${detalhe}</p>
        ${rodape ? `<p style="margin:6px 0 0;font-size:13px;color:#3f3f46;">${rodape}</p>` : ""}
      </td></tr>
    </table>`

  const bloco = (
    cor: { fundo: string; borda: string; titulo: string; texto: string },
    titulo: string,
    intro: string,
    itens: string[],
    resto: number,
    acao: string,
  ) => `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;">
      <tr><td style="background:${cor.fundo};border:1px solid ${cor.borda};border-radius:12px;padding:16px 18px;">
        <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:${cor.titulo};">${titulo}</p>
        <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:${cor.texto};">${intro}</p>
        ${itens.join("")}
        ${resto > 0 ? `<p style="margin:2px 0 10px;font-size:13px;color:${cor.texto};">E mais ${resto} — a lista completa está no painel.</p>` : ""}
        <p style="margin:8px 0 0;padding-top:10px;border-top:1px solid ${cor.borda};font-size:14px;line-height:1.6;color:${cor.texto};">${acao}</p>
      </td></tr>
    </table>`

  const blocoEsperando =
    esperando.length === 0
      ? ""
      : bloco(
          { fundo: "#fffbeb", borda: "#fcd34d", titulo: "#92400e", texto: "#78350f" },
          esperando.length === 1
            ? "1 loja autorizou o acesso e falta cadastrar"
            : `${esperando.length} lojas autorizaram o acesso e faltam cadastrar`,
          `${esperando.length === 1 ? "O lojista já aprovou" : "Os lojistas já aprovaram"} a conexão no iFood e o faturamento está liberado do lado deles. Só falta ${esperando.length === 1 ? "essa loja existir" : "essas lojas existirem"} no seu cadastro.`,
          esperando
            .slice(0, TETO)
            .map((l) =>
              cartao(
                l.nome,
                `${l.cnpj ? `${l.cnpj} · ` : ""}esperando há ${l.dias} dia${l.dias === 1 ? "" : "s"}`,
                "",
              ),
            ),
          Math.max(0, esperando.length - TETO),
          `Cadastre ${esperando.length === 1 ? "a loja" : "as lojas"} em <strong>Unidades</strong>, com o mesmo CNPJ acima. A conexão já existe: assim que a unidade estiver lá, o histórico entra sozinho.`,
        )

  const blocoSumidas =
    sumidas.length === 0
      ? ""
      : bloco(
          { fundo: "#fef2f2", borda: "#fecaca", titulo: "#991b1b", texto: "#7f1d1d" },
          sumidas.length === 1
            ? "1 loja saiu da lista do iFood"
            : `${sumidas.length} lojas saíram da lista do iFood`,
          `A autorização que ${sumidas.length === 1 ? "essa loja deu" : "essas lojas deram"} não aparece mais para nós. Costuma ser o app removido nas permissões do Portal do Parceiro.`,
          sumidas
            .slice(0, TETO)
            .map((l) =>
              cartao(
                l.nome,
                `${l.cnpj ? `${l.cnpj} · ` : ""}sem aparecer há ${l.dias} dia${l.dias === 1 ? "" : "s"}`,
                "",
              ),
            ),
          Math.max(0, sumidas.length - TETO),
          `No <strong>Portal do Parceiro do iFood</strong>, aba <strong>Permissões</strong>, confira se o Delivery OS ainda está autorizado. Se não estiver, autorizar de novo religa a entrada de dados sozinho.`,
        )

  const blocoSemConexao =
    !semConexao || semConexao.plataformas === 0
      ? ""
      : bloco(
          { fundo: "#f0f9ff", borda: "#bae6fd", titulo: "#075985", texto: "#0c4a6e" },
          `${semConexao.plataformas} ${semConexao.plataformas === 1 ? "plataforma marcada" : "plataformas marcadas"} sem conexão ligada`,
          `Em ${semConexao.lojas} ${semConexao.lojas === 1 ? "loja" : "lojas"} do seu cadastro. Isso costuma ser uma de duas coisas, e só você sabe qual:`,
          [
            `<p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#0c4a6e;"><strong>1. A conexão nunca foi ligada.</strong> Dá pra fazer em <strong>Conexões</strong>, e leva menos de um minuto.</p>`,
            `<p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#0c4a6e;"><strong>2. A loja não vende nessa plataforma.</strong> Aí é o cadastro que está a mais — no painel, cada uma tem o botão <em>“não vendo nessa plataforma”</em>. Um clique tira a marcação e o aviso para de aparecer.</p>`,
          ],
          0,
          `Enquanto a marcação existir sem conexão, essa plataforma aparece vazia nos seus relatórios.`,
        )

  const html = `
  <div style="background:#f4f4f5;padding:28px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
      ${
        previaPara
          ? `<tr><td style="background:#18181b;padding:10px 16px;font-size:12px;color:#fafafa;">
               PRÉVIA INTERNA — este e-mail iria para <strong>${previaPara}</strong>
             </td></tr>`
          : ""
      }
      <tr><td style="padding:28px 26px 8px;">
        <p style="margin:0 0 2px;font-size:12px;font-weight:700;letter-spacing:1.6px;color:#71717a;text-transform:uppercase;">Delivery OS</p>
        <h1 style="margin:0 0 6px;font-size:22px;line-height:1.3;color:#18181b;">
          ${totalAcoes === 1 ? "Uma conexão sua precisa de você" : "Suas conexões precisam de você"}
        </h1>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#3f3f46;">
          ${cliente}, ${totalAcoes === 1 ? "há uma pendência" : `há ${totalAcoes} pendências`} que só você consegue resolver — ${totalAcoes === 1 ? "ela depende" : "elas dependem"} de um acesso ou de um cadastro do seu lado. Enquanto ${totalAcoes === 1 ? "isso não for feito" : "isso não for feito"}, ${totalAcoes === 1 ? "essa loja não aparece" : "essas lojas não aparecem"} nos seus relatórios.
        </p>

        ${blocoEsperando}
        ${blocoSumidas}
        ${blocoSemConexao}

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 4px;">
          <tr><td align="center">
            <a href="${SITE}/conexoes" style="display:inline-block;background:${LARANJA};color:#ffffff;text-decoration:none;padding:14px 34px;border-radius:999px;font-size:15px;font-weight:700;">Abrir Conexões</a>
          </td></tr>
        </table>
        <p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#71717a;">
          Ficou com dúvida em alguma? Responda este e-mail que a gente resolve junto.
        </p>
      </td></tr>
      <tr><td style="padding:18px 26px 26px;border-top:1px solid #e4e4e7;">
        <p style="margin:0;font-size:12px;color:#a1a1aa;">
          Delivery OS · você recebe este aviso quando alguma conexão sua precisa de ação.
        </p>
      </td></tr>
    </table>
  </div>`

  return { assunto, html }
}
