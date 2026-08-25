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


/**
 * Passo a passo de começo — numerado, curto, com verbo no começo.
 *
 * Lista numerada e não parágrafo: quem abre um e-mail de boas-vindas está
 * decidindo se vale gastar dez minutos, e uma parede de texto responde "não".
 */
function passoAPasso(): string {
  const passos = [
    [
      "Cadastre sua loja",
      "Nome, cidade e as plataformas em que ela vende. Um minuto.",
    ],
    [
      "Traga os números",
      "Conecte o iFood pela API (o dado entra sozinho, todo dia) ou suba os relatórios do iFood, 99 Food e Keeta em .xlsx.",
    ],
    [
      "Veja o que sobra",
      "O painel abre com faturamento, taxas e o que de fato entra na sua conta — por loja e por plataforma.",
    ],
    [
      "Lance seu CMV",
      "Sem o custo da mercadoria a margem fica pela metade. É um campo por loja, por mês.",
    ],
  ]
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:22px 0 4px;">
    ${passos
      .map(
        ([titulo, texto], i) => `
      <tr>
        <td width="30" valign="top" style="padding:0 0 16px;">
          <div style="width:24px;height:24px;border-radius:999px;background:${LARANJA};color:#fff;font-size:13px;font-weight:700;text-align:center;line-height:24px;">${i + 1}</div>
        </td>
        <td valign="top" style="padding:0 0 16px 12px;">
          <p style="margin:0 0 2px;font-size:15px;font-weight:700;color:${TINTA};">${titulo}</p>
          <p style="margin:0;font-size:14px;line-height:1.55;color:${TEXTO};">${texto}</p>
        </td>
      </tr>`,
      )
      .join("")}
  </table>`
}

/**
 * Como deixar o sistema como app no celular.
 *
 * Não existe app na loja: é o próprio site que instala (PWA). Sem explicar
 * isso, quem procura "DeliveryOS" na App Store não acha nada e conclui que não
 * tem app — quando na verdade tem, e é o que faz o aviso de prazo de avaliação
 * chegar como notificação.
 *
 * O passo é DIFERENTE nos dois sistemas, e no iPhone só funciona no Safari.
 * Descrever "adicione à tela de início" sem dizer isso gera o suporte que este
 * bloco existe pra evitar.
 */
function instalarNoCelular(): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0 0;">
    <tr>
      <td style="background:#fafafa;border:1px solid ${LINHA};border-radius:12px;padding:20px 22px;">
        <p style="margin:0 0 4px;font-size:16px;font-weight:700;color:${TINTA};">Deixe no celular como app</p>
        <p style="margin:0 0 14px;font-size:14px;line-height:1.55;color:${TEXTO};">
          Não precisa baixar nada de loja nenhuma — o próprio site vira app, com ícone na tela de início. É assim que os avisos chegam como notificação (o prazo pra responder avaliação, por exemplo).
        </p>
        <p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:${TEXTO};">
          <strong>Android</strong> — abra o site no Chrome, toque nos três pontinhos e escolha <strong>“Instalar app”</strong> (ou “Adicionar à tela inicial”).
        </p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:${TEXTO};">
          <strong>iPhone</strong> — abra <strong>no Safari</strong> (no Chrome não aparece), toque no botão de compartilhar e escolha <strong>“Adicionar à Tela de Início”</strong>.
        </p>
      </td>
    </tr>
  </table>`
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
        }</p>
        ${passoAPasso()}
        ${instalarNoCelular()}`,
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

/**
 * Aviso de fatura a vencer. UM template, TRÊS momentos: 5 dias, 2 dias e no dia.
 *
 * O tom muda com a urgência de propósito — o de 5 dias é informativo e o do
 * dia diz o que acontece se não pagar. Três textos iguais chegando em uma
 * semana ensinam a pessoa a ignorar o remetente.
 *
 * Transacional: sem print, sem venda.
 */
export function faturaVencendo(
  d: DadosEmail & {
    vencimento: string
    /** 5, 2 ou 0. */
    diasRestantes: number
    /** Quando o acesso é suspenso se não pagar. */
    suspendeEm?: string
  },
) {
  const hoje = d.diasRestantes <= 0
  const valor = d.valorMensal ? ` de <strong>${brl(d.valorMensal)}</strong>` : ""
  const assunto = hoje
    ? `Sua mensalidade do DeliveryOS vence hoje`
    : `Sua mensalidade do DeliveryOS vence em ${d.diasRestantes} dias`
  const titulo = hoje
    ? "Sua mensalidade vence hoje"
    : `Sua mensalidade vence em ${d.diasRestantes} dias`

  return {
    assunto,
    html: layout({
      titulo,
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} A mensalidade do ${d.empresa}${valor} ${
          hoje ? "vence <strong>hoje</strong>" : `vence em <strong>${d.vencimento}</strong>`
        }.</p>
        ${
          hoje && d.suspendeEm
            ? `<p style="margin:0 0 14px;">Se o pagamento não entrar, o acesso é suspenso em <strong>${d.suspendeEm}</strong> — os dados continuam guardados e voltam assim que você regularizar.</p>`
            : ""
        }
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
 * Recuperação de senha.
 *
 * Sai por AQUI e não pelo template do Supabase. O deles chegava em inglês
 * ("Reset your password"), sem logo e sem nenhuma marca — parecia phishing
 * justamente no e-mail em que a pessoa está prestes a digitar uma senha nova.
 *
 * Trocar o template no painel do Supabase resolveria a aparência, mas o HTML
 * ficaria fora do repositório: ninguém saberia que existe, e mudar a marca aqui
 * deixaria aquele para trás. Gerando o link com `generateLink` e mandando pelo
 * nosso `enviarEmail`, o e-mail vira igual aos outros e fica versionado junto.
 * O padrão já existia: a régua faz isso com o magic link.
 *
 * SEM NOME, de propósito. A tela de "esqueci a senha" responde "enviado" mesmo
 * pra e-mail que não existe, pra não revelar quem tem conta — e um "Oi,
 * Fulano!" aqui entregaria pelo lado de dentro o que a tela esconde.
 */
export function recuperarSenha(d: { link: string }) {
  return {
    assunto: "Redefinir sua senha — Delivery OS",
    html: layout({
      titulo: "Vamos redefinir sua senha",
      corpo: `
        <p style="margin:0 0 14px;">Você pediu para trocar a senha do Delivery OS. É só clicar no botão abaixo e escolher uma nova.</p>
        <p style="margin:0 0 14px;font-size:14px;color:${SUAVE};">O link vale por <strong>1 hora</strong> e só pode ser usado uma vez.</p>
        <p style="margin:0 0 14px;">Se não foi você que pediu, pode ignorar este e-mail — sua senha continua a mesma, e ninguém consegue trocá-la sem este link.</p>`,
      cta: { texto: "Escolher nova senha", url: d.link },
      ps: "Se o botão não abrir, copie e cole no navegador: " + d.link,
    }),
  }
}

/**
 * "Está conectado — olha o que já entrou." Serve as três plataformas.
 *
 * Fecha o ciclo COM NÚMERO, não com "tudo certo!". Quem autorizou no portal
 * voltou pro seu dia sem confirmação nenhuma de que funcionou, e o primeiro
 * dado só aparece na madrugada seguinte. Mostrar faturamento, período e
 * pedidos é o que transforma "acho que deu certo" em "deu".
 *
 * O bloco de pendências existe porque a conexão do iFood nasce pela metade com
 * facilidade: são dois apps no Portal do Parceiro e nada avisa quando só um
 * foi aprovado. Dizer "as avaliações ainda não estão entrando, falta autorizar
 * o segundo app" é a única chance do cliente perceber sozinho.
 *
 * É o ÚLTIMO e-mail de integração. Depois dele o cliente só recebe o aviso
 * semanal de saúde — e-mail que continua chegando vira ruído, e ruído faz
 * parar de ler o aviso que importa.
 */
/**
 * "Pedimos a conexão e nada chegou" — cobrança de confirmação ao cliente.
 *
 * Nasceu do caso da Tech Assessoria (ago/26): três lojas solicitadas, nenhum
 * dado entrando, e a descoberta veio de o Marcus ir olhar por conta própria.
 * O cliente ficou dias com a tela vazia sem ninguém dizer nada — e do lado
 * dele parecia que o sistema não funcionava.
 *
 * PEDE UMA RESPOSTA, e uma só. Não manda o cliente "conferir configurações":
 * a pergunta é fechada — você aprovou ou não? Quem aprovou responde "aprovei"
 * e a bola passa pra nós (é caso de chamado com o iFood). Quem não aprovou
 * descobre o que falta. Sem a resposta, os dois lados ficam esperando o outro.
 *
 * NÃO afirma que o cliente não autorizou. Foi exatamente esse palpite que a
 * gente teve que remover das telas: "não chegou dado" e "você não autorizou"
 * são coisas diferentes, e tratá-las como a mesma faz cobrar de quem já fez.
 */
export function conexaoSemDado(d: {
  nome: string | null
  lojas: { nome: string; cnpj: string | null; desde: string }[]
}) {
  const lista = d.lojas
    .map(
      (l) =>
        `<tr>
           <td style="padding:8px 12px 8px 0;border-bottom:1px solid ${LINHA};">
             <strong>${l.nome}</strong>${l.cnpj ? `<br /><span style="font-size:13px;color:${SUAVE};">CNPJ ${l.cnpj}</span>` : ""}
           </td>
           <td style="padding:8px 0;border-bottom:1px solid ${LINHA};font-size:14px;color:${SUAVE};white-space:nowrap;">
             pedida em ${l.desde}
           </td>
         </tr>`,
    )
    .join("")

  const uma = d.lojas.length === 1

  return {
    assunto: uma
      ? "Sua loja no iFood ainda não começou a trazer dados"
      : `Suas ${d.lojas.length} lojas no iFood ainda não começaram a trazer dados`,
    html: layout({
      titulo: uma
        ? "Ainda não chegou nada desta loja"
        : "Ainda não chegou nada destas lojas",
      corpo: `
        <p style="margin:0 0 14px;">${d.nome ? `Oi, ${d.nome}. ` : ""}Pedimos a conexão ${uma ? "desta loja" : "destas lojas"} no iFood, mas até agora nenhum dado entrou:</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:18px 0;font-size:15px;line-height:1.5;">
          ${lista}
        </table>
        <p style="margin:0 0 14px;"><strong>Você chegou a aprovar a conexão no Portal do Parceiro do iFood?</strong> É só responder este e-mail com um "sim" ou "ainda não" — com essa resposta a gente sabe de que lado continuar.</p>
        <p style="margin:0 0 14px;font-size:14px;color:${SUAVE};">Se <strong>já aprovou</strong>: o problema é do lado do iFood e a investigação é nossa — você não precisa fazer mais nada.</p>
        <p style="margin:0 0 14px;font-size:14px;color:${SUAVE};">Se <strong>ainda não</strong>: é no Portal do Parceiro, em Aplicativos. São <strong>dois</strong> aplicativos pra aprovar (um de faturamento e um de avaliações) e quem aprova precisa ser o usuário <strong>Proprietário</strong> da conta — essa é a causa mais comum de "não apareceu nada pra aprovar".</p>`,
      ps: "Assim que a aprovação entrar, a loja conecta sozinha em até 15 minutos e o histórico entra desde janeiro.",
    }),
  }
}

/**
 * "Respondemos seu chamado" — a resposta do suporte chegando por e-mail.
 *
 * Usa a moldura de CLIENTE, não a dos avisos internos. A primeira versão
 * reaproveitou `montarAvisoConexao`, que é a moldura que a gente usa pra falar
 * com a gente mesmo: barra azul, tabelinha de rótulo/valor, sem logo. Chegava
 * na caixa do cliente com cara de sistema, ao lado de e-mails nossos com outra
 * cara — e cliente que recebe dois e-mails da mesma marca com visuais
 * diferentes desconfia do segundo.
 *
 * A resposta vem no corpo, inteira. Um e-mail que só diz "você tem uma nova
 * mensagem" obriga a pessoa a abrir o sistema pra descobrir se era importante;
 * quem já leu decide na hora se precisa responder.
 */
export function suporteRespondido(d: { texto: string; url: string }) {
  // Quebra de linha do chat vira parágrafo: o texto foi escrito num campo de
  // conversa, e sem isso ele chega como um bloco só.
  const corpo = d.texto
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;">${p.replace(/\n/g, "<br />")}</p>`,
    )
    .join("")

  return {
    assunto: "Respondemos seu chamado — Delivery OS",
    html: layout({
      titulo: "Respondemos você",
      corpo: `
        ${corpo}
        <p style="margin:22px 0 0;font-size:14px;color:${SUAVE};">Pra continuar a conversa, é só abrir o chat no sistema — o histórico está todo lá.</p>`,
      cta: { texto: "Continuar a conversa", url: d.url },
    }),
  }
}

export function conexaoAtivada(d: {
  nome: string | null
  loja: string | null
  plataforma: string
  linhas: { rotulo: string; valor: string }[]
  pendencias: string[]
  /** Falta a NÓS buscar — informação, não tarefa. Ver `aCaminho` no resumo. */
  aCaminho?: string[]
  /**
   * Quando este e-mail CORRIGE um que já foi. O texto entra no lugar da
   * abertura e o assunto avisa, pra pessoa ligar um no outro.
   *
   * Existe porque em 24/08/26 o e-mail de conexão da Barraz Caldos saiu com
   * R$ 35.031,80 no lugar de R$ 111.304: a consulta de julho falhou e o mês
   * foi somado como zero. Mandar o mesmo e-mail de novo, com outro número e
   * sem uma palavra sobre o primeiro, faria a pessoa duvidar dos dois.
   */
  correcao?: string
  /**
   * A frase de fecho, na régua da plataforma: o que a API traz de fato.
   *
   * ⚠️ ANTES ERA FIXA: "entra sozinho, todo dia, sem planilha — você não
   * precisa fazer mais nada". Falso nas duas plataformas. Quem lesse aquilo e
   * parasse de subir relatório perderia cardápio, qualidade, promoções e
   * avaliações sem nunca ser avisado, e concluiria — com razão — que o
   * sistema quebrou.
   */
  oQueEntraSozinho?: string
  /** O que continua vindo por planilha, com nome. Some quando não há nada. */
  aindaPorPlanilha?: string
}) {
  const emRota = d.aCaminho ?? []
  const daLoja = d.loja ? ` da <strong>${d.loja}</strong>` : ""
  const tabela = d.linhas
    .map(
      (l) =>
        `<tr><td style="padding:6px 16px 6px 0;color:${SUAVE};font-size:15px;">${l.rotulo}</td><td style="padding:6px 0;font-size:17px;font-weight:700;">${l.valor}</td></tr>`,
    )
    .join("")
  const avisos = d.pendencias.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;">
         <tr><td style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:16px 18px;font-size:15px;line-height:1.6;color:#3f3f46;">
           ${d.pendencias.map((p) => `<p style="margin:0 0 8px;">${p}</p>`).join("")}
         </td></tr>
       </table>`
    : ""
  // Caixa NEUTRA (azul), separada da de pendência (âmbar): aqui não há nada
  // pra pessoa fazer. Pintar espera normal de alerta é o caminho mais curto
  // pra ela parar de ler os alertas de verdade.
  const emRotaHtml = emRota.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;">
         <tr><td style="background:#eff6ff;border-left:4px solid #3b82f6;border-radius:0 8px 8px 0;padding:16px 18px;font-size:15px;line-height:1.6;color:#3f3f46;">
           ${emRota.map((p) => `<p style="margin:0 0 8px;">${p}</p>`).join("")}
         </td></tr>
       </table>`
    : ""
  return {
    assunto: d.correcao
      ? `Corrigindo o número — ${d.plataforma}${d.loja ? ` — ${d.loja}` : ""}`
      : `${d.plataforma} conectado${d.loja ? ` — ${d.loja}` : ""}`,
    html: layout({
      titulo: d.correcao
        ? `Corrigindo o número que te mandei.`
        : `Pronto: o ${d.plataforma} está conectado.`,
      corpo: `
        <p style="margin:0 0 14px;">${
          d.correcao
            ? `${oi(d.nome)} ${d.correcao}`
            : `${oi(d.nome)} Deu certo. O ${d.plataforma}${daLoja} já está trazendo os dados sozinho — e o histórico veio junto:`
        }</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">${tabela}</table>
        ${avisos}
        ${emRotaHtml}
        <p style="margin:0 0 14px;">${
          d.oQueEntraSozinho ??
          `Daqui pra frente entra sozinho, todo dia, sem planilha.`
        }${
          d.pendencias.length
            ? " Resolvendo o ponto acima, fica completo."
            : emRota.length
              ? " É só aguardar o que ainda está vindo."
              : ""
        }</p>
        ${
          d.aindaPorPlanilha
            ? `<p style="margin:0 0 14px;color:${SUAVE};font-size:15px;line-height:1.6;">${d.aindaPorPlanilha}</p>`
            : ""
        }`,
      cta: { texto: "Ver no painel", url: `${SITE}/inicio` },
      // O "último e-mail" só vale quando REALMENTE acabou. Despedir-se com
      // algo ainda em rota deixava o cliente sem nenhuma explicação futura
      // pra tela que ele ia abrir vazia.
      ps: d.correcao
        ? "O painel sempre mostrou o número certo — quem errou foi o e-mail. Desculpa o retrabalho de ler duas vezes."
        : emRota.length
          ? "Quando o que falta terminar de entrar, você não precisa conferir nada — já vai estar no painel. Se alguma loja parar de mandar dado, eu te aviso no resumo semanal."
          : "Esse é o último e-mail sobre a conexão. Se alguma loja parar de mandar dado, eu te aviso no resumo semanal.",
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
            No <strong>Portal do Parceiro do iFood</strong>, vá em <strong>Aplicativos</strong> e autorize <strong>os dois</strong>:
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 0;font-size:15px;line-height:1.7;">
              <tr><td style="padding-right:8px;">1.</td><td><strong>Financial</strong> — traz o faturamento</td></tr>
              <tr><td style="padding-right:8px;">2.</td><td><strong>Avaliações</strong> — traz as notas e os comentários</td></tr>
            </table>
            <p style="margin:10px 0 0;font-size:14px;">São aplicativos separados no iFood. Aprovar só um deixa a outra metade de fora.</p>
            <p style="margin:10px 0 0;font-size:14px;">Precisa estar logado com o usuário <strong>Proprietário</strong> da loja — outros perfis não enxergam essa tela.</p>
          </td></tr>
        </table>
        <p style="margin:0 0 14px;">Depois de aprovado, entra tudo sozinho, todo dia: o <strong>faturamento por volta das 6h</strong> e as <strong>avaliações por volta das 7h</strong>. O histórico vem junto na primeira vez — não é só daqui pra frente.</p>
        <p style="margin:0 0 14px;font-size:14px;color:#71717a;">Não apareceu nada pra aprovar? Me responde aqui que eu confiro o CNPJ e solicito de novo.</p>`,
      cta: { texto: "Abrir o Portal do Parceiro", url: "https://portal.ifood.com.br/apps" },
      ps: `Depois de aprovar, acompanhe por aqui: ${SITE}/unidades`,
    }),
  }
}

/**
 * "Falta você autorizar no 99" — irmã de `conexaoSolicitada`, do iFood.
 *
 * O passo do 99 é OUTRO e por isso o texto não podia ser reaproveitado: lá o
 * lojista aprova dois aplicativos no Portal do Parceiro; aqui ele autoriza o
 * Delivery OS uma vez no portal do 99. Descrever o passo errado faz a pessoa
 * procurar uma tela que não existe e concluir que o problema é nosso.
 *
 * Nasceu em 19/08/26: a Donna Tatta e a Açaí RG Estilo concluíram a esteira,
 * mas o `/v1/shop/list` do 99 seguia devolvendo só as 10 de sempre — sinal de
 * que a autorização nunca foi dada. Não havia como pedir sem sair do sistema.
 */
export function conexaoSolicitada99(d: {
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
    assunto: `Falta você autorizar no 99 Food${d.loja ? ` — ${d.loja}` : ""}`,
    html: layout({
      titulo: "Pedi a conexão no 99 Food. Agora falta você autorizar.",
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} Pedimos ao 99 Food a conexão${daLoja}, com o CNPJ <strong style="white-space:nowrap;">${cnpjFmt}</strong>. O último passo é seu — e leva menos de um minuto.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;">
          <tr><td style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:16px 18px;font-size:15px;line-height:1.6;color:#3f3f46;">
            No <strong>portal do 99 Food</strong>, autorize o aplicativo <strong>Delivery OS</strong> para esta loja.
            <p style="margin:10px 0 0;font-size:14px;">Precisa estar logado com o usuário <strong>dono da loja</strong> — outros perfis não enxergam essa tela.</p>
            <p style="margin:10px 0 0;font-size:14px;">É uma autorização <strong>por loja</strong>: autorizar numa não vale para as outras.</p>
          </td></tr>
        </table>
        <p style="margin:0 0 14px;">Autorizou? <strong>Volte aqui e clique em "Já autorizei"</strong> no aviso do topo da tela inicial. A gente confere no 99 na hora e, se já estiver lá, a loja conecta na mesma hora — o 99 não avisa a gente sozinho, então esse clique é o que fecha o ciclo.</p>
        <p style="margin:0 0 14px;">Conectada, o faturamento passa a entrar todo dia — com o histórico junto na primeira carga.</p>
        <p style="margin:0 0 14px;font-size:14px;color:#71717a;">Não achou onde autorizar? Me responde aqui que eu te mostro o caminho.</p>`,
      cta: { texto: "Abrir o Delivery OS", url: `${SITE}/inicio` },
      ps: `Depois de autorizar, acompanhe por aqui: ${SITE}/unidades`,
    }),
  }
}

/**
 * "Não achei sua loja no portal do iFood."
 *
 * ── POR QUE (Marcus, 20/08/26) ───────────────────────────────────────────
 * Pra conectar, a gente lança o CNPJ no Portal do Desenvolvedor. Às vezes a
 * loja simplesmente NÃO ESTÁ lá — CNPJ novo em processo de abertura, loja
 * ainda não publicada, ou cadastrada no iFood sob outro CNPJ. Não é recusa
 * nossa e não é erro do cliente; é uma pendência que só ele resolve, e sem
 * avisar a solicitação ficava parada com cara de esquecimento.
 *
 * O texto NÃO acusa. Diz o que aconteceu, lista as três causas prováveis em
 * ordem de probabilidade e pede a informação que destrava — sem essa lista, a
 * resposta típica é "mas está tudo certo aqui", e o assunto morre.
 */
export function lojaNaoEncontradaIfood(d: {
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
    assunto: `Não achei sua loja no iFood${d.loja ? ` — ${d.loja}` : ""}`,
    html: layout({
      titulo: "Não encontrei essa loja no portal do iFood",
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} Fui cadastrar a conexão${daLoja} com o CNPJ <strong style="white-space:nowrap;">${cnpjFmt}</strong> e o portal do iFood não devolveu nenhuma loja com esse CNPJ.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;">
          <tr><td style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:16px 18px;font-size:15px;line-height:1.6;color:#3f3f46;">
            Costuma ser um destes três:
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 0;font-size:15px;line-height:1.7;">
              <tr><td style="padding-right:8px;">1.</td><td>a loja <strong>ainda está em abertura</strong> no iFood e não foi publicada;</td></tr>
              <tr><td style="padding-right:8px;">2.</td><td>ela está no iFood sob <strong>outro CNPJ</strong> (o da matriz, por exemplo);</td></tr>
              <tr><td style="padding-right:8px;">3.</td><td>houve troca recente de titularidade e o cadastro antigo ainda consta.</td></tr>
            </table>
          </td></tr>
        </table>
        <p style="margin:0 0 14px;">Quando a loja estiver publicada — ou se o CNPJ dela no iFood for outro — <strong>peça a conexão de novo</strong> na tela da unidade, com o CNPJ certo. Eu cadastro na hora.</p>
        <p style="margin:0 0 14px;font-size:14px;color:#71717a;">Não precisa fazer mais nada agora: este pedido saiu da fila pra não ficar preso esperando algo que ainda não existe. O resto da sua operação segue normal.</p>`,
      cta: { texto: "Pedir a conexão de novo", url: `${SITE}/unidades` },
      ps: `Qualquer dúvida, é só responder este e-mail.`,
    }),
  }
}

/** Lista de lojas para os e-mails em lote: "02 · Gravataí — 63.415.846/0001-02". */
function listaDeLojas(lojas: { nome: string; cnpj: string }[]): string {
  return lojas
    .map((l) => {
      const c = l.cnpj.replace(/\D/g, "")
      const fmt =
        c.length === 14
          ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`
          : l.cnpj
      return `<tr><td style="padding:6px 14px 6px 0;border-bottom:1px solid #f4f4f5;">${l.nome}</td><td style="padding:6px 0;border-bottom:1px solid #f4f4f5;white-space:nowrap;color:#71717a;font-size:14px;">${fmt}</td></tr>`
    })
    .join("")
}

/**
 * "Falta você aprovar ESTAS lojas no iFood" — versão de várias de uma vez.
 *
 * ── POR QUE (Marcus, 20/08/26) ───────────────────────────────────────────
 * Uma rede que conecta 15 lojas recebia 15 e-mails iguais, cada um com um
 * CNPJ diferente. Quinze avisos idênticos não são quinze lembretes: a pessoa
 * lê o primeiro, entende que tem trabalho a fazer, e os outros catorze viram
 * ruído — ou pior, ela aprova uma e acha que resolveu tudo.
 *
 * Num e-mail só, a lista É a lista de trabalho dela: dá pra ir riscando.
 */
export function conexaoSolicitadaLote(d: {
  nome: string | null
  lojas: { nome: string; cnpj: string }[]
}) {
  const n = d.lojas.length
  return {
    assunto: `Falta você aprovar ${n} lojas no iFood`,
    html: layout({
      titulo: `Pedi a conexão de ${n} lojas no iFood. Agora falta você aprovar.`,
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} Solicitei ao iFood a conexão das lojas abaixo. O último passo é seu — e é o mesmo para todas.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;font-size:15px;">
          ${listaDeLojas(d.lojas)}
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;">
          <tr><td style="background:#eff6ff;border-left:4px solid #2563eb;border-radius:0 8px 8px 0;padding:16px 18px;font-size:15px;line-height:1.6;color:#3f3f46;">
            No <strong>Portal do Parceiro do iFood</strong>, vá em <strong>Aplicativos</strong> e autorize <strong>os dois</strong>:
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 0;font-size:15px;line-height:1.7;">
              <tr><td style="padding-right:8px;">1.</td><td><strong>Financial</strong> — traz o faturamento</td></tr>
              <tr><td style="padding-right:8px;">2.</td><td><strong>Avaliações</strong> — traz as notas e os comentários</td></tr>
            </table>
            <p style="margin:10px 0 0;font-size:14px;">É <strong>uma autorização por loja</strong> — precisa repetir em cada uma da lista, com o usuário <strong>Proprietário</strong>.</p>
          </td></tr>
        </table>
        <p style="margin:0 0 14px;">Conforme você for aprovando, cada loja conecta sozinha (conferimos a cada 15 min) e o histórico entra junto na primeira carga.</p>`,
      cta: { texto: "Abrir o Portal do Parceiro", url: "https://portal.ifood.com.br/apps" },
      ps: `Acompanhe o andamento em ${SITE}/unidades`,
    }),
  }
}

/** "Não achei estas lojas no portal do iFood" — várias de uma vez. */
export function lojaNaoEncontradaLote(d: {
  nome: string | null
  lojas: { nome: string; cnpj: string }[]
}) {
  const n = d.lojas.length
  return {
    assunto: `Não achei ${n} lojas no iFood`,
    html: layout({
      titulo: `Não encontrei ${n} lojas no portal do iFood`,
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} Fui cadastrar a conexão das lojas abaixo e o portal do iFood não devolveu nenhuma loja com esses CNPJs.</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;font-size:15px;">
          ${listaDeLojas(d.lojas)}
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;">
          <tr><td style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:16px 18px;font-size:15px;line-height:1.6;color:#3f3f46;">
            Costuma ser um destes três:
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 0;font-size:15px;line-height:1.7;">
              <tr><td style="padding-right:8px;">1.</td><td>a loja <strong>ainda está em abertura</strong> no iFood e não foi publicada;</td></tr>
              <tr><td style="padding-right:8px;">2.</td><td>ela está no iFood sob <strong>outro CNPJ</strong> (o da matriz, por exemplo);</td></tr>
              <tr><td style="padding-right:8px;">3.</td><td>houve troca recente de titularidade e o cadastro antigo ainda consta.</td></tr>
            </table>
          </td></tr>
        </table>
        <p style="margin:0 0 14px;">Conforme cada loja for publicada — ou se o CNPJ dela no iFood for outro — <strong>peça a conexão de novo</strong> na tela da unidade, com o CNPJ certo. Não precisa esperar todas: pode ir pedindo uma a uma.</p>
        <p style="margin:0 0 14px;font-size:14px;color:#71717a;">Estes pedidos saíram da fila pra não ficarem presos esperando algo que ainda não existe. Vale só para as lojas desta lista — o resto da sua operação segue normal.</p>`,
      cta: { texto: "Pedir a conexão de novo", url: `${SITE}/unidades` },
      ps: `Qualquer dúvida, é só responder este e-mail.`,
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

/** Bloco de novidade: título curto + o que mudou. */
function novidade(titulo: string, texto: string, etiqueta?: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 22px;">
    <tr>
      <td style="border-left:3px solid ${LINHA};padding:2px 0 2px 16px;">
        <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:${TINTA};">${titulo}${
          etiqueta
            ? ` <span style="display:inline-block;background:#fff7ed;color:${LARANJA};font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;vertical-align:middle;">${etiqueta}</span>`
            : ""
        }</p>
        <p style="margin:0;font-size:15px;line-height:1.6;color:${TEXTO};">${texto}</p>
      </td>
    </tr>
  </table>`
}

/**
 * Novidades de agosto/26 — campanha avulsa, não faz parte da régua.
 *
 * Uma novidade tem PRAZO (a resposta à avaliação morre em 5 dias), então ela
 * abre o e-mail e leva o CTA. As outras três entram como lista curta: e-mail
 * de novidade que vira release notes não é lido até o fim.
 *
 * Sem print de tela de propósito: os que temos são da conta demo, anterior a
 * essas telas, e print de cliente real vazaria número de terceiro.
 */
export function novidadesAgosto26(d: { nome: string | null }) {
  return {
    assunto: "Agora dá pra responder as avaliações do iFood pelo DeliveryOS",
    html: layout({
      titulo: "Quatro novidades no seu painel — uma delas tem prazo",
      corpo: `
        <p style="margin:0 0 20px;">${oi(d.nome)} Foi uma semana grande por aqui. Resumo do que entrou:</p>

        ${novidade(
          "Responder avaliação do iFood sem sair do painel",
          "Você lê a crítica e responde ali mesmo — não precisa mais abrir o Portal do Parceiro. A resposta da loja também passa a aparecer junto do comentário, no iFood e na Keeta.",
        )}

        ${destaque(
          "5 dias",
          "é o prazo que o iFood dá pra responder. Depois disso a avaliação é publicada sem a sua resposta e o cliente nunca a vê. Por isso o painel agora mostra o que está pra vencer — e avisa no seu celular quando estiver no último dia.",
        )}

        ${novidade(
          "O Nino escreve o rascunho da resposta",
          "Ele lê a nota, o comentário e as tags e propõe um texto específico pra aquele cliente. Você lê, ajusta e envia — ele nunca publica sozinho.",
          "plano AI",
        )}

        ${novidade(
          "O caminho para o Super Restaurante",
          "Relatório novo no Hub: os cinco critérios de cada loja, quanto falta em cada um pra bater a meta, e quem está prestes a perder o selo. Antes isso só existia entrando no portal do iFood, loja por loja.",
        )}

        ${novidade(
          "Desempenho por dia da semana",
          "Qual dia cada loja fatura mais e qual afunda, com o mapa da semana e quem foge do padrão da rede. É o que decide escala de equipe e onde colocar promoção — o fechamento mensal esconde isso.",
        )}

        ${novidade(
          "Três dados que já estavam lá e nenhuma tela mostrava",
          "Cancelamento parcial separado do cancelamento total (o pedido chegou, só veio item errado), o tempo do entregador até o cliente na 99 Food, e quantas horas por dia a loja ficou aberta na Keeta.",
        )}

        <p style="margin:26px 0 0;">Tudo isso já está no ar na sua conta. Não precisa fazer nada.</p>`,
      cta: { texto: "Ver o que está esperando resposta", url: `${SITE}/avaliacoes` },
      ps: "Responder avaliação vale pras lojas com o iFood conectado por API. Se a sua ainda não está, me responde que eu conecto.",
    }),
  }
}

/**
 * "Uma loja foi compartilhada com você."
 *
 * Não é o e-mail de conexão: ninguém conectou nada agora, a loja já vinha
 * sendo sincronizada pela empresa dona. Dizer "sua loja foi conectada" seria
 * falso e ainda daria a entender que ele controla a integração — que é
 * justamente o que ele NÃO faz nessa loja.
 *
 * Leva os números junto porque a boa notícia é o histórico: ele abre e vê o
 * ano inteiro, sem esperar autorização de ninguém.
 */
export function lojaCompartilhada(d: {
  nome: string | null
  loja: string
  dona: string
  linhas: { rotulo: string; valor: string }[]
  /** De onde vem o faturamento. Sem isto o total parece ser só do iFood. */
  plataformas?: { nome: string; valor: string; pct: number }[]
}) {
  const numeros = d.linhas.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:22px 0 0;border-top:1px solid ${LINHA};">
        ${d.linhas
          .map(
            (l) => `<tr>
              <td style="padding:9px 0;font-size:14px;color:${TEXTO};">${l.rotulo}</td>
              <td style="padding:9px 0;text-align:right;font-size:15px;font-weight:700;color:${TINTA};white-space:nowrap;">${l.valor}</td>
            </tr>`,
          )
          .join("")}
      </table>`
    : ""

  return {
    assunto: `${d.loja} está disponível na sua conta do DeliveryOS`,
    html: layout({
      titulo: `A ${d.loja} agora aparece no seu painel`,
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} A <strong>${d.loja}</strong> foi compartilhada com você por <strong>${d.dona}</strong>. Ela já estava conectada e sincronizando, então você não precisa conectar nem importar nada: abra o painel e o histórico está lá — <strong>das três plataformas juntas</strong>.</p>
        ${numeros}
        ${
          (d.plataformas ?? []).length > 1
            ? `<p style="margin:18px 0 8px;font-size:13px;font-weight:700;color:${TINTA};">De onde vem esse faturamento</p>
               <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                 ${d.plataformas!
                   .map(
                     (p) => `<tr>
                       <td style="padding:6px 0;font-size:14px;color:${TEXTO};">${p.nome}</td>
                       <td style="padding:6px 0;text-align:right;font-size:14px;color:${TINTA};white-space:nowrap;">${p.valor} <span style="color:${SUAVE};">· ${p.pct}%</span></td>
                     </tr>`,
                   )
                   .join("")}
               </table>
               <p style="margin:10px 0 0;font-size:13px;line-height:1.55;color:${SUAVE};">O painel soma as três num lugar só — e continua somando conforme os relatórios entram.</p>`
            : ""
        }
        ${instalarNoCelular()}`,
      cta: { texto: "Ver a loja no painel", url: `${SITE}/unidades` },
      ps: "Qualquer dúvida sobre os números dessa loja, é só responder este e-mail.",
    }),
  }
}

/**
 * Manutenção programada do iFood — 13/ago/26, 6h às 8h.
 *
 * Aviso curto e sem alarme: o efeito prático pro cliente é o número do iFood
 * chegar ~2h30 mais tarde num dia. Escrito pra quem abre o painel às 7h e
 * pensa "cadê o dado de ontem" — e pra ninguém confundir atraso com erro.
 *
 * NÃO promete que nada vai falhar: a janela é estimada pelo próprio iFood, e
 * prometer horário que não é nosso é o caminho pra um segundo e-mail pedindo
 * desculpa.
 */
export function manutencaoIfood(d: { nome: string | null }) {
  return {
    assunto: "Amanhã cedo o número do iFood chega mais tarde (manutenção deles)",
    html: layout({
      titulo: "O iFood faz manutenção amanhã de manhã",
      corpo: `
        <p style="margin:0 0 18px;">${oi(d.nome)} Um aviso rápido, e sem susto.</p>

        <p style="margin:0 0 18px;">
          O iFood comunicou uma <b>manutenção programada nas APIs financeiras
          na quinta, 13 de agosto, das 6h às 8h</b> (horário estimado por eles).
          Nesse período a conexão pode ficar instável.
        </p>

        <p style="margin:0 0 18px;">
          <b>O que muda pra você:</b> a sincronização diária do iFood, que
          normalmente roda às 6h, foi remarcada para <b>8h30</b> — depois da
          janela. Ou seja, se você abrir o painel entre 6h e 8h30, o iFood ainda
          vai estar mostrando o número de ontem. A partir das 8h30 tudo entra
          normalmente, incluindo o movimento do dia anterior inteiro.
        </p>

        <p style="margin:0 0 18px;">
          <b>Você não precisa fazer nada.</b> Nada se perde: o que não entrar no
          horário é recuperado na mesma sincronização. 99 Food, Keeta e Cardápio
          Web seguem no horário de sempre — a manutenção é só do iFood.
        </p>

        <p style="margin:0 0 8px;">
          Se depois das 9h algum número parecer parado, me chama que eu olho.
        </p>
      `,
      ps: "Esse aviso é só sobre a quinta-feira. Na sexta o horário volta ao normal, às 6h.",
    }),
  }
}

/**
 * Comprovante do aceite eletrônico da proposta.
 *
 * ⚠️ O CORPO É A PROVA, não um aviso de que existe prova em outro lugar.
 * Nome, CPF, data, IP e hash vão escritos no e-mail — é o que faz o
 * comprovante continuar valendo se um dia o cliente sair do sistema. E-mail
 * que diz "acesse o painel para ver os detalhes" não serve de nada num
 * desentendimento.
 *
 * A MESMA função gera as duas versões: o texto muda de destinatário
 * (`interno`), mas os dados são idênticos, e é isso que garante que a cópia
 * do Marcus e a do cliente não divirjam.
 */
export function propostaAceita(d: {
  numero: string
  cliente: string
  nome: string
  cargo: string
  doc: string
  email: string
  ip: string
  hash: string
  quando: string
  interno: boolean
}) {
  const linha = (rot: string, val: string) => `
    <tr>
      <td style="padding:5px 12px 5px 0;font-size:13px;color:${SUAVE};white-space:nowrap;vertical-align:top;">${rot}</td>
      <td style="padding:5px 0;font-size:13px;color:${TINTA};vertical-align:top;">${val || "—"}</td>
    </tr>`

  const comprovante = `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:22px 0;">
    <tr>
      <td style="background:#fafafa;border:1px solid ${LINHA};border-radius:12px;padding:20px 22px;">
        <p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${TINTA};">Comprovante de aceite</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          ${linha("Proposta", `nº ${d.numero}`)}
          ${linha("Cliente", d.cliente)}
          ${linha("Aceito por", d.cargo ? `${d.nome} · ${d.cargo}` : d.nome)}
          ${linha("CPF/CNPJ", d.doc)}
          ${linha("E-mail", d.email)}
          ${linha("Data e hora", `${d.quando} (horário de Brasília)`)}
          ${linha("Endereço IP", d.ip)}
        </table>
        <p style="margin:12px 0 4px;font-size:12px;color:${SUAVE};">Hash do documento (SHA-256)</p>
        <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:1.5;color:${TEXTO};word-break:break-all;">${d.hash}</p>
      </td>
    </tr>
  </table>`

  if (d.interno) {
    return {
      assunto: `✅ ${d.cliente} aceitou a proposta ${d.numero}`,
      html: layout({
        titulo: "Proposta aceita",
        corpo: `
          <p style="margin:0 0 14px;"><strong>${d.cliente}</strong> aceitou a proposta nº ${d.numero}.</p>
          ${comprovante}
          <p style="margin:0;font-size:14px;color:${SUAVE};">O comprovante também foi enviado para ${d.email}.</p>`,
      }),
    }
  }

  return {
    assunto: `Comprovante de aceite — proposta ${d.numero} · Delivery OS`,
    html: layout({
      titulo: "Recebemos seu aceite",
      corpo: `
        <p style="margin:0 0 14px;">Olá, ${d.nome.split(" ")[0]}. Registramos o aceite da proposta nº ${d.numero}. Guarde este e-mail: ele é o seu comprovante.</p>
        ${comprovante}
        <p style="margin:0 0 12px;font-size:14px;line-height:1.6;">O aceite eletrônico foi registrado nos termos do art. 4º, I, da Lei nº 14.063/2020. O hash acima identifica de forma única o conteúdo da proposta que você aceitou — qualquer alteração no documento produz um hash diferente.</p>
        <p style="margin:0;font-size:14px;line-height:1.6;">As condições contratuais completas estão em <a href="${SITE}/contrato" style="color:${LARANJA};">deliveryos.food/contrato</a>. A partir daqui é com a gente: seu acesso é liberado e a gente avisa você.</p>`,
      ps: "Não foi você que aceitou esta proposta? Responda este e-mail agora — a gente cancela na hora.",
    }),
  }
}

/**
 * Aviso INTERNO: o cliente terminou a parte dele e a bola está com a gente.
 *
 * Usa o mesmo layout dos e-mails que vão pro cliente de propósito. Era HTML
 * cru montado na mão dentro da action — chegava sem cabeçalho, sem botão e sem
 * assinatura, parecendo aviso de sistema quebrado no meio da caixa de entrada.
 * O e-mail que manda VOCÊ trabalhar é justamente o que não pode ser ignorável.
 */
export function conexaoEsperando(d: {
  /** De QUEM é a loja. Sem isso o aviso não diz com quem falar. */
  cliente: string | null
  lojaCode: string
  lojaNome: string
  /** O que falta, já em português: { plataforma, acao }. */
  pendentes: readonly { plataforma: string; acao: string }[]
  /** Plataformas que se resolveram sozinhas. */
  prontas: readonly string[]
}): { assunto: string; html: string } {
  const itens = d.pendentes
    .map(
      (p) =>
        `<tr>
           <td style="padding:14px 16px;border-bottom:1px solid ${LINHA};">
             <div style="font-size:15px;font-weight:700;color:${TINTA};">${p.plataforma}</div>
             <div style="margin-top:3px;font-size:14px;line-height:1.5;color:${TEXTO};">${p.acao}</div>
           </td>
         </tr>`,
    )
    .join("")

  const corpo =
    `<p style="margin:0 0 18px;">${
      d.cliente ? `<b>${d.cliente}</b> concluiu` : "O cliente concluiu"
    } a parte dele em <b>${d.lojaCode} · ${d.lojaNome}</b>. Falta a sua:</p>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${LINHA};border-radius:12px;overflow:hidden;">${itens}</table>` +
    (d.prontas.length > 0
      ? `<p style="margin:18px 0 0;font-size:14px;color:${SUAVE};">Já conectaram sozinhas: ${d.prontas.join(", ")}.</p>`
      : "")

  return {
    assunto: `Conexão esperando por você — ${
      d.cliente ? `${d.cliente} · ` : ""
    }${d.lojaCode} · ${d.lojaNome}`,
    html: layout({
      titulo: "Uma loja está esperando por você",
      corpo,
      cta: { texto: "Abrir as conexões", url: `${SITE}/conexoes` },
      ps: "Enquanto isso não acontece, a loja fica sem dado nenhum — e o cliente já fez a parte dele.",
    }),
  }
}

/**
 * Aviso INTERNO: entrou cliente novo pela porta da frente.
 *
 * Cadastro self-service é a única coisa que acontece na plataforma sem ninguém
 * da casa saber. O cliente entra, começa o teste de 7 dias e o relógio corre —
 * e quem podia ligar pra ele só descobre quando olha a lista por acaso. Este
 * e-mail existe pra encurtar isso: o teste é curto demais pra ser percebido
 * tarde.
 *
 * Traz o contato inteiro de propósito (e-mail e WhatsApp): a ação óbvia ao
 * ler é falar com a pessoa, e ir buscar o telefone noutra tela é o atrito que
 * faz não acontecer.
 */
export function novoClienteInterno(d: {
  empresa: string
  nome: string | null
  email: string
  whatsapp: string | null
  /** Cupom usado no cadastro, quando veio por indicação. */
  cupom: string | null
  /** Quem indicou, se o cupom for de alguém. */
  indicador: string | null
  diasDeTeste: number
}): { assunto: string; html: string } {
  const linha = (rotulo: string, valor: string) =>
    `<tr>
       <td style="padding:10px 16px;border-bottom:1px solid ${LINHA};font-size:13px;color:${SUAVE};width:34%;">${rotulo}</td>
       <td style="padding:10px 16px;border-bottom:1px solid ${LINHA};font-size:15px;color:${TINTA};font-weight:600;">${valor}</td>
     </tr>`

  const corpo =
    `<p style="margin:0 0 18px;">Alguém abriu conta agora e já está no teste de <b>${d.diasDeTeste} dias</b>.</p>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${LINHA};border-radius:12px;overflow:hidden;">` +
    linha("Empresa", d.empresa) +
    linha("Responsável", d.nome ?? "—") +
    linha("E-mail", `<a href="mailto:${d.email}" style="color:${LARANJA};text-decoration:none;">${d.email}</a>`) +
    linha(
      "WhatsApp",
      d.whatsapp
        ? `<a href="https://wa.me/55${d.whatsapp.replace(/\D/g, "")}" style="color:${LARANJA};text-decoration:none;">${d.whatsapp}</a>`
        : "não informado",
    ) +
    (d.cupom
      ? linha(
          "Indicação",
          `${d.cupom}${d.indicador ? ` · ${d.indicador}` : ""}`,
        )
      : "") +
    `</table>`

  return {
    assunto: `Cliente novo — ${d.empresa}`,
    html: layout({
      titulo: "Entrou um cliente novo",
      corpo,
      cta: { texto: "Ver na plataforma", url: `${SITE}/clientes` },
      ps: "O teste é curto: uma mensagem nos primeiros dias é o que costuma virar assinatura.",
    }),
  }
}

/**
 * O acesso foi cortado por falta de pagamento — pro CLIENTE.
 *
 * Chega no dia em que a suspensão de fato acontece, não antes: os avisos de
 * "vai vencer" e "está em atraso" já existem e são outra conversa. Este é o
 * que explica uma tela que mudou embaixo do pé dele.
 *
 * Diz explicitamente que o dado não some. É a primeira pergunta de quem é
 * suspenso, e a resposta boa ("está tudo aqui, volta no ato") é justamente o
 * que faz a pessoa pagar em vez de desistir.
 */
export function contaSuspensa(
  d: DadosEmail & { vencimento: string | null },
): { assunto: string; html: string } {
  return {
    assunto: `Acesso suspenso — ${d.empresa}`,
    html: layout({
      titulo: "Seu acesso está suspenso",
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} A mensalidade${
          d.valorMensal ? ` de <strong>${brl(d.valorMensal)}</strong>` : ""
        }${
          d.vencimento ? `, que venceu em <strong>${d.vencimento}</strong>,` : ""
        } não foi regularizada, e o acesso do ${
          d.empresa
        } ficou suspenso hoje.</p>
        <p style="margin:0 0 14px;"><strong>Seus dados continuam aqui.</strong> Nada foi apagado — histórico, relatórios e configurações estão intactos, e o acesso volta assim que o pagamento cair.</p>
        <p style="margin:0 0 14px;">O que para enquanto isso é a sincronização automática com as plataformas: os dias em que a conta ficar suspensa entram depois, mas não entram sozinhos.</p>
        <p style="margin:0 0 14px;">Se já pagou nos últimos dias, me responde que eu confirmo por aqui e libero na hora.</p>`,
      cta: { texto: "Regularizar e liberar o acesso", url: `${SITE}/assinatura` },
    }),
  }
}

/** O mesmo fato, pro nosso lado: quem caiu, de quanto era e desde quando. */
/**
 * "O backfill de comandas do 99 acabou." Interno, uma vez só.
 *
 * Backfill longo termina em silêncio: não tem tela, e ninguém fica de olho no
 * `restantes` de um cron. Sem este aviso, "acabou" vira suposição de quem
 * lembrar de conferir — e a diferença entre a fila ter drenado e a fila ter
 * TRAVADO é exatamente a que não dá pra adivinhar de longe.
 */
export function backfillComandasConcluido(d: {
  pedidos: number
  itens: number
  promoLoja: number
  lojas: number
  de: string | null
  ate: string | null
}): { assunto: string; html: string } {
  const periodo = d.de && d.ate ? ` · ${d.de} a ${d.ate}` : ""
  return {
    assunto: "Comandas do 99: histórico completo",
    html: layout({
      titulo: "O backfill de comandas do 99 terminou.",
      corpo: `
        <p style="margin:0 0 14px;">A fila zerou. Todo pedido do 99 que passou
        pelo extrato agora tem a comanda item a item — o que foi vendido, com
        que complemento e com quanto de promoção.</p>
        ${destaque(
          brl(d.promoLoja),
          `de promoção bancada pela loja, agora quebrada por prato`,
        )}
        <p style="margin:18px 0 8px;">O que entrou:</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">
          <tr><td style="padding:4px 16px 4px 0;color:#71717a;">Itens</td><td style="padding:4px 0;font-weight:600;">${d.itens.toLocaleString("pt-BR")}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;color:#71717a;">Pedidos</td><td style="padding:4px 0;font-weight:600;">${d.pedidos.toLocaleString("pt-BR")}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;color:#71717a;">Lojas</td><td style="padding:4px 0;font-weight:600;">${d.lojas}${periodo}</td></tr>
        </table>
        <p style="margin:0;color:#71717a;font-size:14px;">A fila continua rodando
        de 5 em 5 minutos: loja vinculada sem webhook segue produzindo pedido
        sem comanda, e ela recolhe. Este aviso sai uma vez só.</p>`,
      cta: { texto: "Ver no painel", url: `${SITE}/inicio` },
    }),
  }
}

export function clienteSuspensoInterno(d: {
  empresa: string
  valorMensal: number | null
  vencimento: string | null
  lojas: number
}): { assunto: string; html: string } {
  return {
    assunto: `Cliente suspenso — ${d.empresa}`,
    html: layout({
      titulo: "Um cliente foi suspenso",
      corpo: `
        <p style="margin:0 0 14px;"><b>${d.empresa}</b> perdeu o acesso hoje por falta de pagamento${
          d.vencimento ? ` — venceu em <b>${d.vencimento}</b>` : ""
        }.</p>
        ${destaque(
          d.valorMensal ? brl(d.valorMensal) : "—",
          `de mensalidade fora do caixa · ${d.lojas} loja${d.lojas === 1 ? "" : "s"}`,
        )}
        <p style="margin:18px 0 0;">Ele já recebeu o aviso com o link de regularização.</p>`,
      cta: { texto: "Abrir a ficha do cliente", url: `${SITE}/clientes` },
    }),
  }
}
