/**
 * Textos da régua de e-mails.
 *
 * Voz: direta, sem corporativês, escrita como o Marcus fala com o cliente —
 * "seu delivery", "sua loja", não "sua operação de food service". Cada e-mail
 * tem UM pedido só; e-mail com três botões não é lido, é fechado.
 *
 * HTML inline e sem imagem externa: Gmail e Outlook derrubam <style> no head e
 * bloqueiam imagem por padrão. O que precisa ser lido tem que estar no texto.
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://delivery.cozinafoods.com"

/** Moldura comum. `cta` é opcional — nem todo e-mail pede clique. */
function layout(opts: {
  titulo: string
  corpo: string
  cta?: { texto: string; url: string }
  ps?: string
}): string {
  return `
<div style="margin:0;padding:24px 12px;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px 28px;">
    <p style="margin:0 0 24px;font-size:13px;font-weight:600;letter-spacing:.5px;color:#ea580c;text-transform:uppercase;">DeliveryOS</p>
    <h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;color:#18181b;font-weight:600;">${opts.titulo}</h1>
    <div style="font-size:15px;line-height:1.6;color:#3f3f46;">${opts.corpo}</div>
    ${
      opts.cta
        ? `<div style="margin:28px 0 8px;"><a href="${opts.cta.url}" style="display:inline-block;background:#ea580c;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:8px;font-size:15px;font-weight:600;">${opts.cta.texto}</a></div>`
        : ""
    }
    ${opts.ps ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#71717a;">${opts.ps}</p>` : ""}
    <hr style="border:none;border-top:1px solid #e4e4e7;margin:28px 0 16px;" />
    <p style="margin:0;font-size:12px;line-height:1.6;color:#a1a1aa;">
      É só responder este e-mail que eu leio — <a href="mailto:suporte@deliveryos.food" style="color:#71717a;">suporte@deliveryos.food</a>
    </p>
  </div>
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
      cta: {
        texto: d.temLoja ? "Importar meus relatórios" : "Cadastrar minha loja",
        url: d.temLoja ? `${SITE}/importacao` : `${SITE}/unidades`,
      },
      ps: "Se travar em algo, me chama. Prefiro resolver em dois minutos agora do que você desistir achando que é complicado.",
    }),
  }
}

/** 2. Faltando 3 dias. Pergunta de verdade + relembra o que ele talvez não viu. */
export function trial3Dias(d: DadosEmail) {
  return {
    assunto: `Faltam ${d.diasRestantes ?? 3} dias do seu teste — o que você achou?`,
    html: layout({
      titulo: `Faltam ${d.diasRestantes ?? 3} dias do seu teste`,
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} Queria saber, honestamente: <strong>o que você está achando?</strong></p>
        <p style="margin:0 0 14px;">Pergunto porque tem coisa aqui que passa batido nos primeiros dias, e seria uma pena você decidir sem ter visto:</p>
        <ul style="margin:0 0 14px;padding-left:20px;">
          <li style="margin-bottom:8px;"><strong>Quanto sobra de verdade</strong> — o líquido depois de comissão, entrega e taxas, por loja e por plataforma</li>
          <li style="margin-bottom:8px;"><strong>Quanto some em cancelamento</strong> — com o motivo e de quem foi a culpa</li>
          <li style="margin-bottom:8px;"><strong>Nino AI</strong> — pergunte "por que caiu meu faturamento?" e ele responde com os seus números</li>
          <li style="margin-bottom:8px;"><strong>Conexão com o iFood</strong> — depois de ligada, o financeiro e as avaliações entram sozinhos, sem planilha</li>
        </ul>
        <p style="margin:0 0 14px;">Se faltou alguma coisa, me responde dizendo o quê. Isso me ajuda mais do que você imagina.</p>`,
      cta: { texto: "Voltar pro sistema", url: SITE },
    }),
  }
}

/** 3. Terminou o teste. Aqui sim o pedido é pagar. */
export function trialTerminou(d: DadosEmail) {
  const valor = d.valorMensal ? ` Pelo seu tamanho hoje, fica em <strong>${brl(d.valorMensal)}/mês</strong>.` : ""
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
 */
export function recuperacao(n: 1 | 2 | 3 | 4, d: DadosEmail) {
  const variantes = {
    1: {
      assunto: "Uma pergunta rápida sobre o DeliveryOS",
      titulo: "Posso te fazer uma pergunta?",
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} Você testou o DeliveryOS e não seguiu — e eu queria entender por quê.</p>
        <p style="margin:0 0 14px;">Não é e-mail automático pedindo pra voltar. É pergunta mesmo: <strong>faltou alguma coisa? ficou confuso? o preço não fechou?</strong></p>
        <p style="margin:0 0 14px;">Uma linha de resposta já me ajuda a melhorar o produto.</p>`,
      cta: undefined,
    },
    2: {
      assunto: "O número que quase todo delivery erra",
      titulo: "O número que quase todo delivery erra",
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} Uma coisa que a gente vê em quase toda loja que entra:</p>
        <p style="margin:0 0 14px;">O dono sabe quanto <em>faturou</em>. Poucos sabem quanto <strong>sobrou</strong> — depois da comissão, da entrega, das promoções e dos cancelamentos.</p>
        <p style="margin:0 0 14px;">Nas redes que acompanhamos, a diferença entre os dois costuma passar de <strong>40%</strong>. É dinheiro que sai todo mês sem aparecer em lugar nenhum.</p>
        <p style="margin:0 0 14px;">Sua conta continua aqui, com o que você já tinha importado.</p>`,
      cta: { texto: "Ver meus números", url: SITE },
    },
    3: {
      assunto: "Agora o iFood entra sozinho",
      titulo: "Novidade: o iFood entra sozinho",
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} Desde que você testou, mudou uma coisa que talvez resolva o que te travou:</p>
        <p style="margin:0 0 14px;">Agora dá pra <strong>conectar o iFood direto</strong>. Depois de autorizado, o financeiro e as avaliações entram automaticamente todo dia — <strong>sem baixar planilha nenhuma</strong>.</p>
        <p style="margin:0 0 14px;">Se o trabalho de importar arquivo foi o motivo de você parar, esse motivo não existe mais.</p>`,
      cta: { texto: "Ver como funciona", url: SITE },
    },
    4: {
      assunto: "Último e-mail meu",
      titulo: "Este é o último e-mail que te mando",
      corpo: `
        <p style="margin:0 0 14px;">${oi(d.nome)} Não quero virar aquele e-mail que a pessoa arrasta pro lixo sem abrir, então este é o último.</p>
        <p style="margin:0 0 14px;">Sua conta do ${d.empresa} continua aqui, com os dados que você importou. Se um dia fizer sentido, é só entrar.</p>
        <p style="margin:0 0 14px;">E se quiser conversar — sobre o produto, sobre preço, ou só pra dizer o que não funcionou — a porta fica aberta.</p>
        <p style="margin:0 0 14px;">Boas vendas.</p>`,
      cta: undefined,
    },
  } as const

  const v = variantes[n]
  return {
    assunto: v.assunto,
    html: layout({
      titulo: v.titulo,
      corpo: v.corpo,
      cta: v.cta,
    }),
  }
}

/** Aviso de fatura chegando (3 dias antes). */
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
export function faturaVencida(d: DadosEmail & { vencimento: string; suspendeEm?: string }) {
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
