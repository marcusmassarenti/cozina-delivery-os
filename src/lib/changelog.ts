/**
 * Changelog do sistema (Novidades & Atualizações).
 *
 * COMO REGISTRAR UMA ATUALIZAÇÃO: a cada deploy, adicione um novo objeto
 * Release NO TOPO do array CHANGELOG (a lista é da versão mais nova para a
 * mais antiga). Sem banco — é versionado junto com o código.
 *
 * `kind` de cada item: "novo" (recurso novo), "melhoria" (algo ficou melhor)
 * ou "correcao" (bug consertado). Use `antes`/`depois` quando fizer sentido
 * mostrar a comparação (vira um item expansível na tela).
 */

export type ChangeKind = "novo" | "melhoria" | "correcao"

export type ChangeItem = {
  kind: ChangeKind
  title: string
  /** texto curto (quando não precisa de antes/depois) */
  desc?: string
  antes?: string
  depois?: string
}

export type ChangeArea = {
  area: string
  items: ChangeItem[]
}

export type Release = {
  version: string
  date: string // ISO yyyy-mm-dd
  tag?: string // ex.: "Grande novidade", "Melhorias", "Correções"
  title: string
  summary?: string
  areas: ChangeArea[]
}

export const CHANGELOG: Release[] = [
  {
    version: "1.4.3",
    date: "2026-07-22",
    tag: "Melhorias",
    title: "DRE agora bate linha a linha com o Portal do iFood",
    summary:
      "As taxas mostravam um percentual maior que o real, e o Bruto parecia diferente do portal. Agora cada linha do DRE casa com a tela do iFood — e o Bruto explica a diferença no hover.",
    areas: [
      {
        area: "Financeiro da loja",
        items: [
          {
            kind: "melhoria",
            title: "Taxas reais separadas do dinheiro recebido na entrega",
            desc: "O que você recebe direto do cliente (PIX, dinheiro, maquininha) não é taxa — o iFood só desconta do repasse porque você já embolsou. Virou linha própria no DRE, e a linha de taxas passou a mostrar só as taxas de verdade.",
            antes: "Taxas das plataformas: 31% (com o recebido-direto embutido)",
            depois: "Taxas reais + linha “Recebido direto na entrega” separada",
          },
          {
            kind: "melhoria",
            title: "Bruto com explicação no hover",
            desc: "Passe o mouse no Bruto: ele é vendas menos cancelamentos. O “Valor das vendas” do portal iFood mostra antes de descontar os cancelados — por isso lá aparece um pouco maior.",
          },
          {
            kind: "novo",
            title: "“Confere com o Portal do iFood” no fim do DRE",
            desc: "O DRE agora mostra o “Total faturamento” e o “Total em repasses” na mesma nomenclatura do portal — os dois fecham ao centavo com a tela do iFood, sem precisar de calculadora.",
          },
        ],
      },
      {
        area: "Importação",
        items: [
          {
            kind: "melhoria",
            title: "Aviso sobre o portal logo no resultado da importação",
            desc: "Ao importar o Financeiro do iFood, o card de resultado já avisa: o “Valor das vendas” do portal inclui pedidos cancelados, e é o Líquido que bate ao centavo com o “Total em repasses”. Assim a comparação não vira susto.",
          },
        ],
      },
    ],
  },
  {
    version: "1.4.2",
    date: "2026-07-21",
    tag: "Melhorias",
    title: "Cancelamentos da Keeta agora agrupam por tema",
    summary:
      "A Keeta manda o texto que o cliente escreveu, não um motivo. O card virou um ranking de temas — dá pra ver o que mais faz cancelar, em vez de ler 5 reclamações soltas.",
    areas: [
      {
        area: "Dashboard",
        items: [
          {
            kind: "melhoria",
            title: "Top cancelamentos da Keeta agrupado por tema",
            desc: "Cada reclamação é classificada em Item faltando, Item errado, Embalagem/derramou, Qualidade, Atraso, Corpo estranho e outros. Assim o card responde onde está o problema.",
            antes: "153 cancelamentos = 153 “motivos”, cada um aparecendo 1×",
            depois: "Item faltando 7× · Item errado 5× · Sem descrição 3×",
          },
          {
            kind: "correcao",
            title: "Link de foto vazava no card",
            desc: "A Keeta cola os endereços das fotos no fim do texto da reclamação, e isso ia direto pra tela. Agora é removido antes de exibir.",
          },
        ],
      },
    ],
  },
  {
    version: "1.4.1",
    date: "2026-07-21",
    tag: "Correções",
    title: "Cancelamentos do 99 Food: perda real e motivo em português",
    summary:
      "O card de cancelamentos do 99 mostrava perda R$ 0,00 e escondia a maioria dos casos. Agora mostra o valor de verdade que você deixou de faturar, em português.",
    areas: [
      {
        area: "Dashboard",
        items: [
          {
            kind: "correcao",
            title: "A perda do 99 aparecia zerada",
            desc: "Pedido cancelado no 99 vem com a receita zerada (a venda não aconteceu), e era esse campo que somávamos. Agora usamos o valor original do pedido — o que você de fato deixou de faturar.",
            antes: "Perda no mês: R$ 0,00",
            depois: "Perda no mês: −R$ 1.298,93 (julho, rede)",
          },
          {
            kind: "correcao",
            title: "A maioria dos cancelamentos não aparecia",
            desc: "O ranking agrupava só por motivo, e o 99 só preenche motivo quando o cancelamento é do comerciante. Todo o resto sumia da lista. Agora, sem motivo, entra a parte responsável.",
            antes: "7 cancelamentos no ranking",
            depois: "18 cancelamentos no ranking",
          },
          {
            kind: "melhoria",
            title: "Motivo de cancelamento em português",
            desc: "Os códigos crus do 99 viraram texto legível: “B/P/C/D duty” agora é Loja, Plataforma, Cliente ou Entregador, e motivos como “Shop-Item sold out” viraram “Item esgotado”.",
          },
        ],
      },
    ],
  },
  {
    version: "1.4.0",
    date: "2026-07-18",
    tag: "Melhorias",
    title: "Nino AI mais inteligente: taxas, cancelamentos e reputação",
    summary:
      "O Nino agora enxerga dados que já estavam no sistema mas ele não usava — pra onde vai sua taxa, por que cancelam (e quanto você perde) e o que os clientes reclamam.",
    areas: [
      {
        area: "Nino AI",
        items: [
          {
            kind: "novo",
            title: "Pra onde vai a taxa do iFood",
            desc: "Pergunte 'pra onde vai minha taxa' e o Nino abre o desconto do iFood do mês: comissão, entrega, serviços e promoções que você custeou.",
          },
          {
            kind: "novo",
            title: "Por que cancelam e quanto você perde",
            desc: "Os motivos de cancelamento com a perda em R$ de cada um — dá pra ver o gargalo (atraso, item errado, cliente não localizado) e agir onde dói no bolso.",
          },
          {
            kind: "novo",
            title: "Reputação e o que os clientes reclamam",
            desc: "Nota por plataforma (iFood/99/Keeta), qual loja está com a pior nota, e os comentários negativos reais agrupados por tema — pra atacar a causa.",
          },
        ],
      },
    ],
  },
  {
    version: "1.3.0",
    date: "2026-07-18",
    tag: "Grande novidade",
    title: "Nino AI: pesquisa de mercado + resposta ao vivo",
    summary:
      "O Nino agora pesquisa fora do sistema pra responder sobre o mercado do delivery, responde palavra por palavra e mostra as respostas bem mais bonitas.",
    areas: [
      {
        area: "Nino AI",
        items: [
          {
            kind: "novo",
            title: "Análise de mercado (pesquisa na web)",
            antes:
              "O Nino só conhecia os números da sua conta — perguntas sobre o mercado ou o setor ele não sabia responder.",
            depois:
              "Pergunte sobre tendências do delivery, o mercado de carnes, concorrência, sazonalidade — ele pesquisa dados atuais na web e ainda cruza com os seus números, separando o que é visão de mercado do que é seu.",
          },
          {
            kind: "melhoria",
            title: "Resposta ao vivo, palavra por palavra",
            antes:
              "Você esperava a resposta inteira ficar pronta pra ela aparecer de uma vez.",
            depois:
              "A resposta vai aparecendo enquanto o Nino escreve, e quando ele está pesquisando na web ele avisa na hora — igual conversar com o Claude.",
          },
          {
            kind: "melhoria",
            title: "Respostas mais fáceis de ler",
            antes:
              "Textos longos vinham corridos, sem destaque.",
            depois:
              "Títulos de seção em negrito, divisórias entre blocos e listas — as análises ficam organizadas e fáceis de bater o olho.",
          },
        ],
      },
    ],
  },
  {
    version: "1.2.0",
    date: "2026-06-09",
    tag: "Grande novidade",
    title: "Cobrança por loja na plataforma",
    summary:
      "Agora dá pra cobrar uma licença base + um adicional por loja — e acompanhar tudo (pagamentos e lojas).",
    areas: [
      {
        area: "Clientes da plataforma",
        items: [
          {
            kind: "novo",
            title: "Cobrança: base + valor por loja",
            antes:
              "A mensalidade era um valor fixo por cliente, ajustado na mão sempre que mudava o número de lojas.",
            depois:
              "Defina valor base + valor por loja extra + quantas lojas já vêm inclusas. O total e o MRR sobem sozinhos quando o cliente ganha uma loja.",
          },
          {
            kind: "novo",
            title: "Histórico de pagamentos",
            desc: "Registre cada pagamento recebido (data, valor, forma) e veja o histórico do cliente num lugar só.",
          },
          {
            kind: "novo",
            title: "Ver as lojas do cliente",
            desc: "Clique no número de lojas pra ver quais são — nome, cidade e se está ativa.",
          },
          {
            kind: "melhoria",
            title: "Valores sempre com centavos",
            antes: "O campo de valor mostrava só '99'.",
            depois: "Agora formata pra 'R$ 99,00' automaticamente ao sair do campo.",
          },
        ],
      },
    ],
  },
  {
    version: "1.1.0",
    date: "2026-06-09",
    tag: "Grande novidade",
    title: "Fluxo de Caixa multi-loja",
    summary:
      "O caixa agora separa por loja: o franqueador vê tudo e compara, o franqueado vê só a dele.",
    areas: [
      {
        area: "Fluxo de Caixa",
        items: [
          {
            kind: "novo",
            title: "Seletor de loja",
            desc: "Um seletor no topo: 'Consolidado' mostra a rede inteira; escolha uma loja pra ver só ela.",
          },
          {
            kind: "novo",
            title: "Loja no lançamento",
            antes: "Os lançamentos não sabiam a que loja pertenciam.",
            depois:
              "Cada lançamento nasce carimbado numa loja, puxada automaticamente da conta escolhida.",
          },
          {
            kind: "novo",
            title: "Comparativo das lojas",
            desc: "No Consolidado, uma tabela compara as lojas lado a lado: saldo, a pagar, a receber e resultado.",
          },
          {
            kind: "melhoria",
            title: "Acesso do franqueado",
            depois: "O franqueado entra e vê/lança só o caixa da loja dele.",
            antes: "Sem separação de acesso por loja no caixa.",
          },
        ],
      },
    ],
  },
  {
    version: "1.0.0",
    date: "2026-06-09",
    tag: "Grande novidade",
    title: "Novo módulo: Fluxo de Caixa",
    summary: "Um módulo financeiro completo pra controlar contas a pagar e a receber.",
    areas: [
      {
        area: "Fluxo de Caixa",
        items: [
          {
            kind: "novo",
            title: "Contas, cartões e categorias",
            desc: "Cadastre contas bancárias (com logo do banco), cartões de crédito e categorias com ícones.",
          },
          {
            kind: "novo",
            title: "Lançamentos com fatura de cartão",
            desc: "Despesas, receitas e transferências. Compras no cartão entram na fatura e parcelam entre faturas.",
          },
          {
            kind: "novo",
            title: "Cadastros de clientes e fornecedores",
            desc: "Com busca de CEP e consulta de CNPJ automáticas.",
          },
          {
            kind: "novo",
            title: "Dashboard financeiro",
            desc: "Saldos, vencimentos, maiores gastos/receitas e top clientes/fornecedores.",
          },
        ],
      },
    ],
  },
]
