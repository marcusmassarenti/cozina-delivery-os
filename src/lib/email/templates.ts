/**
 * Textos e visual da régua de e-mails.
 *
 * Voz: direta, sem corporativês, escrita como o Marcus fala com o cliente —
 * "seu delivery", "sua loja", não "sua operação de food service". Cada e-mail
 * tem UM pedido só; e-mail com três botões não é lido, é fechado.
 *
 * Visual: mesmo padrão do e-mail de confirmação de cadastro (ícone laranja +
 * "DELIVERY OS", título grande, botão pílula, rodapé fora do cartão). Cliente
 * que recebe dois e-mails da mesma marca com caras diferentes desconfia do
 * segundo — parece phishing.
 *
 * HTML inline e tudo em tabela: Gmail e Outlook derrubam <style> no head e o
 * Outlook desktop ignora boa parte de flex/grid.
 */

/**
 * Domínio dos links E das imagens. Precisa ser o mesmo da marca do e-mail:
 * botão do DeliveryOS que aponta pra delivery.cozinafoods.com faz o cliente
 * achar que errou de e-mail — ou que é golpe.
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.deliveryos.food"

const LARANJA = "#ff4d1c"
const TINTA = "#18181b"
const TEXTO = "#52525b"
const SUAVE = "#a1a1aa"
const LINHA = "#e4e4e7"

/** Print do sistema. Fica em /public/email (versão leve dos prints da landing). */
type Imagem = { arquivo: string; alt: string; legenda?: string }

function figura(img: Imagem): string {
  return `
  <div style="margin:26px 0;">
    <img src="${SITE}/email/${img.arquivo}" alt="${img.alt}" width="520"
         style="display:block;width:100%;max-width:100%;height:auto;border:1px solid ${LINHA};border-radius:10px;" />
    ${
      img.legenda
        ? `<p style="margin:10px 0 0;font-size:13px;line-height:1.5;color:${SUAVE};text-align:center;">${img.legenda}</p>`
        : ""
    }
  </div>`
}

/** Caixa de número forte — o "olha o tamanho disso" dos e-mails de retomada. */
export function destaque(numero: string, texto: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0;">
    <tr>
      <td style="background:#fff7ed;border-left:4px solid ${LARANJA};border-radius:0 10px 10px 0;padding:20px 22px;">
        <p style="margin:0 0 6px;font-size:30px;line-height:1.1;font-weight:700;color:${LARANJA};">${numero}</p>
        <p style="margin:0;font-size:15px;line-height:1.5;color:#7c2d12;">${texto}</p>
      </td>
    </tr>
  </table>`
}

/**
 * Moldura comum. `cta` é opcional — nem todo e-mail pede clique.
 * A ordem dos blocos é fixa: texto → imagens → botão. Botão antes da imagem
 * faz a pessoa clicar sem ver o argumento.
 */
function layout(opts: {
  titulo: string
  corpo: string
  imagens?: readonly Imagem[]
  cta?: { texto: string; url: string }
  ps?: string
}): string {
  return `
<div style="margin:0;padding:32px 12px;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;">
    <tr>
      <td style="background:#ffffff;border-radius:16px;padding:40px 36px;">

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
          <tr>
            <td style="padding-right:12px;">
              <img src="${SITE}/deliveryos-icon.png" width="40" height="40" alt="D"
                   style="display:block;width:40px;height:40px;border-radius:10px;background:${LARANJA};" />
            </td>
            <td style="font-size:13px;font-weight:700;letter-spacing:1.6px;color:#71717a;text-transform:uppercase;">Delivery OS</td>
          </tr>
        </table>

        <h1 style="margin:0 0 20px;font-size:27px;line-height:1.25;color:${TINTA};font-weight:700;">${opts.titulo}</h1>

        <div style="font-size:16px;line-height:1.62;color:${TEXTO};">${opts.corpo}</div>

        ${(opts.imagens ?? []).map(figura).join("")}

        ${
          opts.cta
            ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:30px 0 4px;">
                 <tr><td align="center">
                   <a href="${opts.cta.url}" style="display:inline-block;background:${LARANJA};color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:999px;font-size:16px;font-weight:700;">${opts.cta.texto}</a>
                 </td></tr>
               </table>`
            : ""
        }

        ${opts.ps ? `<p style="margin:26px 0 0;font-size:14px;line-height:1.6;color:#71717a;">${opts.ps}</p>` : ""}

        <hr style="border:none;border-top:1px solid ${LINHA};margin:30px 0 18px;" />
        <p style="margin:0;font-size:13px;line-height:1.6;color:${SUAVE};">
          É só responder este e-mail que eu leio — <a href="mailto:suporte@deliveryos.food" style="color:#71717a;">suporte@deliveryos.food</a>
        </p>

      </td>
    </tr>
    <tr>
      <td align="center" style="padding:18px 0 0;font-size:13px;color:${SUAVE};">Delivery OS · deliveryos.food</td>
    </tr>
  </table>
</div>`.trim()
}

export type DadosEmail = {
  nome: string | null
  empresa: string
  /** Já cadastrou alguma loja? Muda o que se pede. */
  temLoja: boolean
  diasRestantes?: number
  valorMensal?: number
}

const oi = (nome: string | null) => (nome ? `Oi, ${nome.split(" ")[0]}!` : "Oi!")
const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

/** 1. Assim que confirma o e-mail. Um pedido só: cadastrar a primeira loja. */
export function boasVindas(d: DadosEmail) {
  return {
    assunto: `${d.empresa} está no ar no DeliveryOS`,
    html: layout({
      titulo: "Sua conta está pronta",
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} Bem-vindo ao DeliveryOS.</p>
        <p style="margin:0 0 14px;">Seus <strong>7 dias de teste</strong> começam agora, e neles <strong>tudo</strong> está liberado — inclusive o Nino AI, que lê os números da sua loja e monta o plano de ação.</p>
        <p style="margin:0 0 14px;">${
          d.temLoja
            ? "O próximo passo é importar seus relatórios do iFood, 99 Food ou Keeta — ou conectar a API do iFood, que puxa tudo sozinha."
            : "O primeiro passo leva menos de um minuto: <strong>cadastrar sua loja</strong>. Sem ela o sistema fica vazio, porque tudo aqui é sobre os números dela."
        }</p>`,
      imagens: [
        {
          arquivo: "dashboard.png",
          alt: "Painel do DeliveryOS com faturamento, pedidos e ticket médio",
          legenda: "É isto que te espera assim que os primeiros números entrarem.",
        },
      ],
      cta: {
        texto: d.temLoja ? "Importar meus relatórios" : "Cadastrar minha loja",
        url: d.temLoja ? `${SITE}/importacao` : `${SITE}/unidades`,
      },
      ps: "Se travar em algo, me chama. Prefiro resolver em dois minutos agora do que você desistir achando que é complicado.",
    }),
  }
}

/**
 * 2. Faltando 3 dias. Pergunta de verdade + mostra o que ele talvez não viu.
 * Aqui entra print: nos primeiros dias a pessoa mal saiu do painel inicial, e
 * descrever o Diagnóstico em texto não chega nem perto de mostrar a tela.
 */
export function trial3Dias(d: DadosEmail) {
  return {
    assunto: `Faltam ${d.diasRestantes ?? 3} dias do seu teste — o que você achou?`,
    html: layout({
      titulo: `Faltam ${d.diasRestantes ?? 3} dias do seu teste`,
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} Queria saber, honestamente: <strong>o que você está achando?</strong></p>
        <p style="margin:0 0 20px;">Pergunto porque tem coisa aqui que passa batido nos primeiros dias, e seria uma pena você decidir sem ter visto:</p>

        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td style="padding:0 0 14px;vertical-align:top;width:26px;color:${LARANJA};font-size:17px;font-weight:700;">✓</td>
              <td style="padding:0 0 14px;"><strong>Quanto sobra de verdade</strong> — o líquido depois de comissão, entrega, promoção e taxa, por loja e por plataforma</td></tr>
          <tr><td style="padding:0 0 14px;vertical-align:top;color:${LARANJA};font-size:17px;font-weight:700;">✓</td>
              <td style="padding:0 0 14px;"><strong>Quanto some em cancelamento</strong> — com o motivo e de quem foi a culpa</td></tr>
          <tr><td style="padding:0 0 14px;vertical-align:top;color:${LARANJA};font-size:17px;font-weight:700;">✓</td>
              <td style="padding:0 0 14px;"><strong>Nino AI</strong> — pergunte "por que caiu meu faturamento?" e ele responde com os <em>seus</em> números</td></tr>
          <tr><td style="padding:0 0 14px;vertical-align:top;color:${LARANJA};font-size:17px;font-weight:700;">✓</td>
              <td style="padding:0 0 14px;"><strong>Conexão com o iFood</strong> — depois de ligada, financeiro e avaliações entram sozinhos, sem planilha</td></tr>
        </table>`,
      imagens: [
        {
          arquivo: "diagnostico.png",
          alt: "Diagnóstico da loja com plano de ação gerado por IA",
          legenda: "O Diagnóstico aponta o que está travando a loja e o que fazer primeiro.",
        },
        {
          arquivo: "dre.png",
          alt: "DRE com faturamento, custos e margem",
          legenda: "E o resultado fechado, do bruto até o que sobra no bolso.",
        },
      ],
      cta: { texto: "Voltar pro sistema", url: SITE },
      ps: "Se faltou alguma coisa, me responde dizendo o quê. Isso me ajuda mais do que você imagina.",
    }),
  }
}

/** 3. Terminou o teste. Aqui sim o pedido é pagar. */
export function trialTerminou(d: DadosEmail) {
  const valor = d.valorMensal
    ? ` Pelo seu tamanho hoje, fica em <strong>${brl(d.valorMensal)}/mês</strong>.`
    : ""
  return {
    assunto: `Seu teste do DeliveryOS terminou`,
    html: layout({
      titulo: "Seu teste terminou hoje",
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} Os 7 dias de teste do ${d.empresa} chegaram ao fim.</p>
        <p style="margin:0 0 14px;">Pra continuar de onde parou — com o histórico que já entrou e as conexões que você ligou — é só escolher um plano.${valor}</p>
        <p style="margin:0 0 14px;">Seus dados continuam aqui. Se assinar depois, está tudo como você deixou.</p>`,
      cta: { texto: "Escolher meu plano", url: `${SITE}/assinatura` },
      ps: "Se o preço for o problema, me responde. Prefiro conversar a te perder por causa disso.",
    }),
  }
}

/**
 * 4-7. Recuperação, de 15 em 15 dias. Cada um tenta um ângulo DIFERENTE —
 * repetir "volte pra gente" quatro vezes só ensina a pessoa a ignorar.
 *
 * Os três últimos são de venda mesmo: número forte, print da tela e um botão
 * só. O primeiro é a exceção proposital — ver explicação nele.
 */
export function recuperacao(n: 1 | 2 | 3 | 4, d: DadosEmail) {
  const variantes = {
    // Este é o único sem enfeite de venda: a força dele é parecer o que é —
    // uma pergunta de gente, não campanha. Com print e número gigante em cima,
    // "queria entender por quê" vira só mais um anúncio e ninguém responde.
    1: {
      assunto: "Uma pergunta rápida sobre o DeliveryOS",
      titulo: "Posso te fazer uma pergunta?",
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} Você testou o DeliveryOS e não seguiu — e eu queria entender por quê.</p>
        <p style="margin:0 0 14px;">Não é e-mail automático pedindo pra voltar. É pergunta mesmo: <strong>faltou alguma coisa? ficou confuso? o preço não fechou?</strong></p>
        <p style="margin:0 0 14px;">Uma linha de resposta já me ajuda a melhorar o produto.</p>`,
      imagens: undefined,
      cta: undefined,
      ps: undefined,
    },
    2: {
      assunto: "Você fatura bem. Mas quanto sobra?",
      titulo: "Você fatura bem. Mas quanto sobra?",
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} Tem uma coisa que a gente vê em quase toda loja que entra:</p>
        <p style="margin:0 0 14px;">O dono sabe de cor quanto <em>faturou</em>. Poucos sabem quanto <strong>sobrou</strong> — depois da comissão, da entrega, das promoções e dos cancelamentos.</p>
        ${destaque("+40%", "é a diferença que costumamos achar entre o que a loja fatura e o que ela realmente recebe. Todo mês, sem aparecer em lugar nenhum.")}
        <p style="margin:0 0 14px;">No DeliveryOS esse caminho fica na tela inteiro: do bruto ao que entra na conta, linha por linha.</p>`,
      imagens: [
        {
          arquivo: "dre.png",
          alt: "DRE do DeliveryOS mostrando do faturamento bruto até a margem",
          legenda: "Do bruto até a margem — sem planilha, sem achismo.",
        },
      ],
      cta: { texto: "Ver quanto sobra na minha loja", url: SITE },
      ps: "Sua conta continua aqui, com o que você já tinha importado.",
    },
    3: {
      assunto: "Agora o iFood entra sozinho",
      titulo: "Acabou a planilha do iFood",
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} Desde que você testou, mudou uma coisa que talvez resolva justamente o que te travou:</p>
        <p style="margin:0 0 14px;">Agora dá pra <strong>conectar o iFood direto</strong>. Você autoriza uma vez no Portal do Parceiro e pronto — todo dia o financeiro e as avaliações entram sozinhos.</p>
        ${destaque("0", "relatórios pra baixar, abrir e importar na mão. A conexão faz isso de madrugada, todo dia, em todas as suas lojas.")}
        <p style="margin:0 0 14px;">Se o trabalho de ficar importando arquivo foi o motivo de você parar, esse motivo não existe mais.</p>`,
      imagens: [
        {
          arquivo: "avaliacoes.png",
          alt: "Tela de avaliações com notas e comentários vindos do iFood",
          legenda: "Nota, comentário e motivo da reclamação — puxados direto do iFood.",
        },
      ],
      cta: { texto: "Conectar meu iFood", url: SITE },
      ps: undefined,
    },
    4: {
      assunto: "Último e-mail meu",
      titulo: "Este é o último e-mail que te mando",
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} Não quero virar aquele e-mail que a pessoa arrasta pro lixo sem abrir, então este é o último.</p>
        <p style="margin:0 0 14px;">Antes de sumir, queria te mostrar a coisa que mais surpreende quem entra: o sistema olha os números da sua loja e <strong>escreve o plano de ação</strong> — o que está travando, quanto custa e o que fazer primeiro.</p>`,
      imagens: [
        {
          arquivo: "diagnostico.png",
          alt: "Diagnóstico da loja com plano de ação priorizado",
          legenda: "Não é gráfico bonito: é o que fazer na segunda de manhã.",
        },
      ],
      cta: { texto: "Ver o diagnóstico da minha loja", url: SITE },
      ps: `Sua conta do ${d.empresa} continua aqui, com os dados que você importou — sem prazo pra sumir. Se um dia fizer sentido, é só entrar. Boas vendas.`,
    },
  } as const

  const v = variantes[n]
  return {
    assunto: v.assunto,
    html: layout({
      titulo: v.titulo,
      corpo: v.corpo,
      imagens: v.imagens,
      cta: v.cta,
      ps: v.ps,
    }),
  }
}

/**
 * Régua de quem se cadastrou e NUNCA confirmou o e-mail.
 *
 * É a única série que sai pra endereço não confirmado, e por isso ela é curta
 * (3 e-mails e acabou) e transacional na essência: a pessoa pediu a conta, só
 * não terminou. Insistir além disso é gastar reputação de domínio numa caixa
 * que pode nem existir.
 *
 * O `link` é gerado na hora do envio e vale 24h — por isso cada lembrete traz
 * um novo. Um clique confirma o e-mail e já entra no sistema.
 */
export function confirmarEmail(
  n: 1 | 2 | 3,
  d: DadosEmail & { link: string; diasDeTeste?: number },
) {
  const perdidos = d.diasDeTeste ?? 0
  const variantes = {
    1: {
      assunto: "Falta um clique pra sua conta abrir",
      titulo: "Sua conta está esperando por você",
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} Você criou a conta do ${d.empresa} no DeliveryOS, mas o e-mail de confirmação ficou sem clicar — e sem isso a conta não abre.</p>
        <p style="margin:0 0 14px;">É um clique só. Depois dele você entra direto e seus <strong>7 dias de teste</strong> começam a valer de verdade.</p>`,
      imagens: [
        {
          arquivo: "dashboard.png",
          alt: "Painel do DeliveryOS",
          legenda: "É o que abre do outro lado do botão.",
        },
      ] as const,
      ps: undefined,
    },
    2: {
      assunto: "Seu teste está correndo sem você",
      titulo: "Seu teste começou — e você não entrou",
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} Passando de novo porque tem um detalhe chato: o prazo do seu teste começou a contar no dia do cadastro, <strong>não no dia em que você entrar</strong>.</p>
        ${
          perdidos > 0
            ? destaque(
                `${perdidos} ${perdidos === 1 ? "dia" : "dias"}`,
                "é o que já passou do seu teste grátis sem você ver uma tela sequer. Dá pra recuperar o resto agora.",
              )
            : ""
        }
        <p style="margin:0 0 14px;">Se foi o e-mail que se perdeu no meio de outros, o botão abaixo resolve na hora.</p>`,
      imagens: undefined,
      ps: "Se você desistiu, tudo bem — é só ignorar que eu paro de mandar.",
    },
    3: {
      assunto: "Último lembrete sobre sua conta",
      titulo: "Último lembrete, prometo",
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} Este é o último e-mail que te mando sobre a confirmação.</p>
        <p style="margin:0 0 14px;">Se o momento não for esse, sem problema. Mas se foi só esquecimento, seria uma pena você ter se cadastrado e nunca ter visto o que o sistema mostra da sua loja — <strong>quanto sobra de verdade</strong> depois de comissão, entrega e cancelamento.</p>`,
      imagens: [
        {
          arquivo: "dre.png",
          alt: "DRE do DeliveryOS, do faturamento bruto até a margem",
          legenda: "Do bruto até o que sobra no bolso.",
        },
      ] as const,
      ps: "Qualquer coisa é só responder este e-mail — chega direto em mim.",
    },
  } as const

  const v = variantes[n]
  return {
    assunto: v.assunto,
    html: layout({
      titulo: v.titulo,
      corpo: v.corpo,
      imagens: v.imagens,
      cta: { texto: "Confirmar meu e-mail e entrar", url: d.link },
      ps: v.ps,
    }),
  }
}

/** Aviso de fatura chegando (3 dias antes). Transacional: sem print, sem venda. */
export function faturaVencendo(d: DadosEmail & { vencimento: string }) {
  return {
    assunto: `Sua mensalidade do DeliveryOS vence em ${d.vencimento}`,
    html: layout({
      titulo: "Sua mensalidade vence em breve",
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} Passando pra avisar que a mensalidade do ${d.empresa}${
          d.valorMensal ? ` — <strong>${brl(d.valorMensal)}</strong>` : ""
        } vence em <strong>${d.vencimento}</strong>.</p>
        <p style="margin:0 0 14px;">Se já pagou, pode ignorar este e-mail.</p>`,
      cta: { texto: "Ver minha assinatura", url: `${SITE}/minha-conta/assinatura` },
    }),
  }
}

/** Fatura venceu e não foi paga. Avisa antes de cortar. */
export function faturaVencida(
  d: DadosEmail & { vencimento: string; suspendeEm?: string },
) {
  return {
    assunto: `Mensalidade em atraso — ${d.empresa}`,
    html: layout({
      titulo: "Sua mensalidade está em atraso",
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} A mensalidade${
          d.valorMensal ? ` de <strong>${brl(d.valorMensal)}</strong>` : ""
        } venceu em <strong>${d.vencimento}</strong> e ainda não caiu por aqui.</p>
        ${
          d.suspendeEm
            ? `<p style="margin:0 0 14px;">Pra não te pegar de surpresa: se não for regularizada até <strong>${d.suspendeEm}</strong>, o acesso é suspenso — e você perde as sincronizações automáticas que estão rodando.</p>`
            : ""
        }
        <p style="margin:0 0 14px;">Se já pagou nos últimos dias, me responde que eu confirmo aqui e resolvo.</p>`,
      cta: { texto: "Regularizar agora", url: `${SITE}/assinatura` },
    }),
  }
}

/**
 * Conexão iFood recusada.
 *
 * A recusa acontece na fila interna, e o cliente só descobria se entrasse na
 * página daquela loja específica. Este e-mail existe pra ele não ficar
 * esperando por uma conexão que não vem.
 *
 * `motivo` é a nota escrita na hora de recusar — é o conteúdo do e-mail, não um
 * detalhe. Sem ela sobra "não deu certo", que não ajuda ninguém a agir.
 */
export function conexaoRecusada(d: {
  nome: string | null
  loja: string | null
  cnpj: string
  motivo: string | null
}) {
  const cnpjFmt =
    d.cnpj.length === 14
      ? `${d.cnpj.slice(0, 2)}.${d.cnpj.slice(2, 5)}.${d.cnpj.slice(5, 8)}/${d.cnpj.slice(8, 12)}-${d.cnpj.slice(12)}`
      : d.cnpj
  const ondeFica = d.loja ? ` da <strong>${d.loja}</strong>` : ""
  return {
    assunto: `Não consegui conectar o iFood${d.loja ? ` — ${d.loja}` : ""}`,
    html: layout({
      titulo: "A conexão com o iFood não deu certo",
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} Tentei conectar o iFood${ondeFica} com o CNPJ <strong style="white-space:nowrap;">${cnpjFmt}</strong> e não foi possível.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;">
          <tr><td style="background:#fff1f2;border-left:4px solid #e11d48;border-radius:0 8px 8px 0;padding:16px 18px;font-size:15px;line-height:1.6;color:#3f3f46;">
            ${d.motivo ?? "Confira o CNPJ cadastrado no iFood e solicite a conexão de novo."}
          </td></tr>
        </table>
        <p style="margin:0 0 14px;">É só corrigir e pedir de novo: abra a loja no painel e clique em <strong>Solicitar de novo</strong>. Nada do que você já cadastrou se perdeu.</p>`,
      cta: { texto: "Abrir o painel", url: `${SITE}/unidades` },
      ps: "Se o CNPJ estiver certo e mesmo assim não conectar, me responde aqui que eu vejo caso a caso.",
    }),
  }
}

/**
 * "Pedi a conexão no iFood — agora falta você aprovar".
 *
 * A solicitação de verdade é feita à mão no Portal do Desenvolvedor do iFood,
 * um CNPJ por vez. Depois disso a bola é do cliente: ele precisa aceitar o app
 * Delivery OS no Portal do Parceiro DELE, e enquanto não aceitar não entra
 * nada — nem faturamento, nem avaliação.
 *
 * Sem este e-mail, ele só descobre que tem algo pra fazer se entrar no sistema
 * e ler a faixa. Quem está esperando a conexão funcionar não entra: fica
 * achando que estamos processando. Foi assim que uma solicitação ficou parada
 * em 'solicitada' por dias.
 *
 * O CTA aponta pro PORTAL DO IFOOD e não pro nosso painel: o clique que
 * resolve é lá. O link do nosso painel vai no rodapé, pra quem quiser conferir
 * o estado — inverter a ordem faria a pessoa passear pelo nosso sistema sem
 * chegar no botão que importa.
 */
export function conexaoSolicitada(d: {
  nome: string | null
  loja: string | null
  cnpj: string
}) {
  const cnpjFmt =
    d.cnpj.length === 14
      ? `${d.cnpj.slice(0, 2)}.${d.cnpj.slice(2, 5)}.${d.cnpj.slice(5, 8)}/${d.cnpj.slice(8, 12)}-${d.cnpj.slice(12)}`
      : d.cnpj
  const daLoja = d.loja ? ` da <strong>${d.loja}</strong>` : ""
  return {
    assunto: `Falta você aprovar no iFood${d.loja ? ` — ${d.loja}` : ""}`,
    html: layout({
      titulo: "Pedi a conexão no iFood. Agora falta você aprovar.",
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} Solicitei ao iFood a conexão${daLoja} com o CNPJ <strong style="white-space:nowrap;">${cnpjFmt}</strong>. O último passo é seu — e leva menos de um minuto.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;">
          <tr><td style="background:#eff6ff;border-left:4px solid #2563eb;border-radius:0 8px 8px 0;padding:16px 18px;font-size:15px;line-height:1.6;color:#3f3f46;">
            No <strong>Portal do Parceiro do iFood</strong>, vá em <strong>Aplicativos</strong> e autorize o <strong>Delivery OS</strong>.<br>
            Precisa estar logado com o usuário <strong>Proprietário</strong> da loja — outros perfis não enxergam essa tela.
          </td></tr>
        </table>
        <p style="margin:0 0 14px;">Assim que você aprovar, o faturamento e as avaliações passam a entrar sozinhos, todo dia, sem planilha. O histórico vem junto.</p>
        <p style="margin:0 0 14px;font-size:14px;color:#71717a;">Não apareceu nada pra aprovar? Me responde aqui que eu confiro o CNPJ e solicito de novo.</p>`,
      cta: { texto: "Abrir o Portal do Parceiro", url: "https://portal.ifood.com.br/apps" },
      ps: `Depois de aprovar, acompanhe por aqui: ${SITE}/unidades`,
    }),
  }
}

/**
 * Fechamento do mês com dias faltando (só planilha).
 *
 * O assunto e a primeira linha falam de DINHEIRO, não de tarefa. "Faltam 4
 * dias" não faz ninguém parar o que está fazendo; "seu resultado está
 * subestimado em R$ 12 mil" faz. O número é estimativa e o e-mail diz isso com
 * todas as letras — número inventado que parece exato é pior que nenhum.
 */
export function fechamentoIncompleto(d: {
  nome: string | null
  mesLabel: string
  lojas: {
    loja: string
    plataforma: string
    ultimoDia: string
    diasFaltando: number
    valorEstimado: number
  }[]
  totalEstimado: number
}) {
  const NOMES: Record<string, string> = {
    ifood: "iFood",
    "99food": "99 Food",
    keeta: "Keeta",
  }
  const dia = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7)
  const n = d.lojas.length

  const linhas = d.lojas
    .map(
      (l) => `
      <tr>
        <td style="padding:9px 0;border-bottom:1px solid ${LINHA};font-size:14px;color:${TINTA};">
          <strong>${l.loja}</strong>
          <span style="color:${SUAVE};font-size:12px;"> · ${NOMES[l.plataforma] ?? l.plataforma}</span>
          <br/>
          <span style="font-size:12px;color:${TEXTO};">último dia importado: ${dia(l.ultimoDia)} — faltam ${l.diasFaltando} dias</span>
        </td>
        <td style="padding:9px 0;border-bottom:1px solid ${LINHA};text-align:right;font-size:14px;font-weight:700;color:${TINTA};white-space:nowrap;">
          ~${brl(l.valorEstimado)}
        </td>
      </tr>`,
    )
    .join("")

  return {
    assunto: `${d.mesLabel} fechou com dias faltando — cerca de ${brl(d.totalEstimado)} fora da conta`,
    html: layout({
      titulo: `Seu resultado de ${d.mesLabel} está incompleto`,
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} ${n === 1 ? "Uma loja" : `${n} lojas`} ${n === 1 ? "ficou" : "ficaram"} com dias sem importar em ${d.mesLabel}. Enquanto isso não entra, o faturamento aparece menor do que foi — e a margem e o CMV% saem calculados sobre uma base menor que a real.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 6px;">
          ${linhas}
          <tr>
            <td style="padding:12px 0 0;font-size:14px;font-weight:700;color:${TINTA};">Fora da conta, no total</td>
            <td style="padding:12px 0 0;text-align:right;font-size:18px;font-weight:700;color:${LARANJA};white-space:nowrap;">~${brl(d.totalEstimado)}</td>
          </tr>
        </table>
        <p style="margin:14px 0 0;font-size:13px;color:${SUAVE};">Os valores são estimativa: usamos a média diária de cada loja nos dias que já estão no sistema. O número real só aparece quando o relatório entrar.</p>`,
      cta: { texto: "Importar agora", url: `${SITE}/importacao` },
      ps: "Se alguma dessas lojas não vendeu nesses dias, é só ignorar — nada fica pendente.",
    }),
  }
}
