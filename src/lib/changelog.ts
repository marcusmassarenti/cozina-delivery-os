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
  /**
   * Força o pop-up numa versão que só tem correção. Use quando o conserto
   * mudou um número que a pessoa já tinha visto e ela PRECISA saber.
   */
  destaque?: boolean
  areas: ChangeArea[]
}

export const CHANGELOG: Release[] = [
  {
    version: "1.17.2",
    date: "2026-08-12",
    tag: "Correções",
    title: "Mês fechado não perde mais uma plataforma em silêncio",
    areas: [
      {
        area: "Faturamento",
        items: [
          {
            kind: "correcao",
            title: "Falha de consulta não fica mais guardada como resultado",
            antes:
              "Se a apuração de um mês já encerrado falhasse uma única vez, a falha era guardada por 24 horas como se fosse a resposta — e a plataforma inteira sumia do mês. O número apenas ficava menor, sem nenhum aviso. Em julho, a Pinheiros apareceu com R$ 39.277 no lugar de R$ 46.863: faltava o iFood do mês.",
            depois:
              "A falha não entra mais no cache. Quando a consulta erra, a próxima abertura da tela tenta de novo — o estrago vira um clique, não um dia. Vale para iFood, 99 Food, Keeta e Relatório Diário.",
          },
        ],
      },
    ],
  },
  {
    version: "1.17.1",
    date: "2026-08-12",
    tag: "Melhorias",
    title: "Trocar de mês virou um clique",
    areas: [
      {
        area: "Filtro de período",
        items: [
          {
            kind: "melhoria",
            title: "Setas de mês anterior / próximo mês",
            antes:
              "Pra ver o mês passado numa loja você abria o calendário, achava o mês e clicava no primeiro e no último dia.",
            depois:
              "Duas setas ao lado do filtro pulam um mês inteiro de uma vez, em todas as telas. A seta da direita trava no mês corrente — mês futuro não tem dado. O calendário continua ali pra quando você quiser um período solto.",
          },
        ],
      },
    ],
  },
  {
    version: "1.17.0",
    date: "2026-08-10",
    tag: "Grande novidade",
    title: "O caminho para o Super, o mapa da semana e a resposta ao cliente",
    summary:
      "Dois relatórios novos no Hub — quanto falta pra cada loja virar Super Restaurante e em que dia da semana ela ganha ou perde dinheiro — mais dados que já estavam guardados e nenhuma tela mostrava.",
    areas: [
      {
        area: "Relatórios",
        items: [
          {
            kind: "novo",
            title: "Super Restaurante: quanto falta pra chegar lá",
            antes:
              "Pra saber se a loja ia manter o selo, alguém entrava no portal do iFood loja por loja — e só descobria que tinha perdido depois do dia 10.",
            depois:
              "O relatório mostra os cinco critérios de cada loja, o que falta em cada um e quem está prestes a perder o selo. Com filtro por loja, plano de ação e exportação em PDF.",
          },
          {
            kind: "novo",
            title: "Desempenho por dia da semana",
            antes:
              "O mês fechava em “vendeu tanto”. Que a sexta faz um terço a mais que a terça ninguém via — e a escala era montada no achismo.",
            depois:
              "Melhor e pior dia de cada loja, mapa da semana e quem foge do padrão da rede. Dá pra filtrar por plataforma; na 99 Food e na Keeta a leitura é por pedidos, porque elas não mandam o valor.",
          },
          {
            kind: "melhoria",
            title: "Comentários negativos: quem ainda não foi respondido",
            desc:
              "Um card novo conta quantos clientes reclamaram e ficaram sem resposta.",
          },
        ],
      },
      {
        area: "Avaliações",
        items: [
          {
            kind: "novo",
            title: "Esperando resposta: o que vence antes de você perceber",
            antes:
              "Numa rede, ninguém abre loja por loja todo dia. A reclamação passava dos 5 dias e o iFood publicava sem a resposta — o cliente nunca lia.",
            depois:
              "Uma linha no topo de Avaliações diz quantas faltam, em quantas lojas e quantas estão no último dia. Clicou, abre a lista inteira da rede, ordenada por quem vence primeiro. Fora do filtro de mês, porque o prazo não liga pra virada do mês.",
          },
          {
            kind: "novo",
            title: "Aviso no celular quando o prazo está acabando",
            desc:
              "Todo dia de manhã, quem tem avaliação com 1 dia ou menos pra responder recebe um push. Um só por conta, com o total — não um por avaliação.",
          },
          {
            kind: "novo",
            title: "O Nino escreve o rascunho da resposta",
            desc:
              "Ele lê a nota, o comentário e as tags e propõe um texto específico — você lê, ajusta e envia. Faz parte do plano DeliveryOS AI.",
          },
          {
            kind: "novo",
            title: "Responder a avaliação do iFood pelo painel",
            antes:
              "Responder um cliente exigia abrir o Portal do Parceiro, achar a avaliação e escrever por lá.",
            depois:
              "O botão Responder está na própria avaliação, na loja e no relatório de negativos, com o aviso de quanto falta do prazo de 5 dias que o iFood dá.",
          },
          {
            kind: "novo",
            title: "A resposta da loja agora aparece",
            desc:
              "iFood e Keeta mandam o texto do que a loja respondeu — a Keeta manda desde sempre, e nenhuma tela mostrava. Agora vem logo abaixo do comentário do cliente.",
          },
        ],
      },
      {
        area: "Sua conta",
        items: [
          {
            kind: "novo",
            title: "Loja compartilhada entre empresas",
            desc:
              "Uma loja que já está conectada em outra conta pode ser compartilhada com você em modo acompanhamento: você vê tudo — faturamento, taxas, avaliações, Super — e quem edita continua sendo a empresa dona dela.",
          },
        ],
      },
      {
        area: "Operação",
        items: [
          {
            kind: "melhoria",
            title: "Cancelamento de item errado separado do pedido inteiro",
            desc:
              "No painel e no relatório de cancelamentos, dá pra ver quantos foram cancelamento parcial — cliente que recebeu o pedido, só com item errado.",
          },
          {
            kind: "melhoria",
            title: "Tempo do entregador até o cliente (99 Food)",
            desc: "Mais um tempo na régua da 99, que já vinha no arquivo.",
          },
          {
            kind: "novo",
            title: "Tempo de loja aberta no iFood",
            antes:
              "A gente sabia quanto a loja vendeu, nunca quanto tempo ela ficou aberta pra vender.",
            depois:
              "Horas programadas por semana, quanto desse tempo a loja esteve mesmo online, tempo de preparo e atraso médio, e quais lojas não abrem todo dia. O horário vem da API e se atualiza sozinho — mudou no Portal do Parceiro, mudou aqui.",
          },
          {
            kind: "melhoria",
            title: "Tempo de loja aberta (Keeta)",
            desc:
              "Quantas horas por dia a loja ficou aberta, em média — dado que a Keeta manda e ninguém via.",
          },
        ],
      },
    ],
  },
  {
    version: "1.16.0",
    date: "2026-08-08",
    tag: "Grande novidade",
    title: "Suba a nota do fornecedor e o custo do insumo se atualiza sozinho",
    summary:
      "Notas & insumos: o XML da NF-e vira catálogo de insumos com custo real, atualizado a cada compra. É o primeiro passo do CMV por produto.",
    areas: [
      {
        area: "Financeiro",
        items: [
          {
            kind: "novo",
            title: "Importação de nota fiscal (XML)",
            antes:
              "O custo dos insumos vivia em planilha, atualizado à mão quando alguém lembrava. Descobrir que a carne subiu 8% dependia de conferir nota por nota.",
            depois:
              "Suba o XML da NF-e e pronto: a nota é conferida, os itens entram e o custo de cada insumo se atualiza. A mesma nota não entra duas vezes — a chave de acesso barra.",
          },
          {
            kind: "novo",
            title: "A nota descobre sozinha de qual loja é",
            desc:
              "Pelo CNPJ do destinatário. Na primeira nota de uma loja sem CNPJ cadastrado, o sistema pergunta uma vez e grava — da segunda em diante entra sozinha.",
          },
          {
            kind: "novo",
            title: "Fator de conversão: da caixa para a unidade",
            antes:
              "A nota diz “1 caixa de potes: R$ 614,40”. A ficha técnica precisa saber quanto custa UM pote — e essa conta ninguém fazia.",
            depois:
              "Você diz uma vez que a caixa tem 480 unidades e o sistema mostra R$ 1,28 por pote, recalculando a cada nota nova.",
          },
          {
            kind: "novo",
            title: "Regime fiscal por loja",
            desc:
              "No cadastro da unidade. No Simples o imposto da nota é custo; no Regime Normal ele vira crédito e sai do custo. Numa nota real de R$ 18.895,86 a diferença entre os dois foi de R$ 3.474 — 18%. O cálculo é item a item, porque a alíquota varia dentro da mesma nota.",
          },
        ],
      },
    ],
  },
  {
    version: "1.15.0",
    date: "2026-08-08",
    tag: "Melhorias",
    title: "Um aviso por semana quando alguma loja para de mandar dados",
    summary:
      "Toda segunda, ao entrar, você vê quantas lojas precisam de atenção e quantas plataformas do cadastro nunca trouxeram dado — com a pergunta que só você sabe responder.",
    areas: [
      {
        area: "Painel",
        items: [
          {
            kind: "novo",
            title: "Aviso semanal de saúde das lojas",
            antes:
              "O aviso de loja sem dado existia discreto, em cinza, dentro da faixa de cobertura. Fácil de não ver — e semanas passavam com o faturamento de uma loja fora dos relatórios sem ninguém notar.",
            depois:
              "Uma vez por semana, na segunda, um aviso mostra quantas lojas pararam de mandar dado e desde quando. Fechou, só volta na semana seguinte.",
          },
          {
            kind: "novo",
            title: "Separação entre “falta importar” e “cadastro errado”",
            desc:
              "Plataforma marcada no cadastro que nunca trouxe dado pode ser relatório que falta subir, ou plataforma em que a loja nunca vendeu. O sistema não tem como saber — então ele pergunta, em vez de chutar, e o botão “não vendo nessa plataforma” resolve num clique.",
          },
          {
            kind: "novo",
            title: "Lançamentos com cara de extrato",
            antes:
              "Uma lista corrida, com a data repetida em letra miúda em cada linha e a cor só no valor. Num extrato de dezenas de linhas quase todas positivas, achar as saídas exigia ler o sinal de uma por uma.",
            depois:
              "Agrupado por dia (com o saldo do dia), a linha inteira verde quando entra e vermelha quando sai, e fonte maior. A joia confirma o lançamento — verde e cheia quando confirmado. Nos três pontinhos: editar, duplicar para hoje, converter em transferência e excluir.",
          },
          {
            kind: "melhoria",
            title: "Comparativo por loja abre e fecha",
            antes:
              "A tabela das 16 lojas vinha sempre aberta e empurrava o resto da Visão Geral pra fora da tela. E só o nome da loja abria o detalhe — clicar na linha não fazia nada, apesar do “clique para abrir”.",
            depois:
              "Fechado, mostra só o total da rede. “Ver por loja” abre a lista, agora com o logo de cada unidade ao lado do nome, e a linha inteira é clicável.",
          },
          {
            kind: "novo",
            title: "“A receber” passa a contar o repasse das plataformas",
            antes:
              "A coluna lia só o que foi digitado no Caixa ou importado do extrato. Como extrato bancário é dinheiro que já mexeu, toda linha nascia paga — e a loja aparecia com R$ 0,00 a receber mesmo tendo repasse de delivery a caminho.",
            depois:
              "Cada loja mostra o que o iFood, a 99 e a Keeta ainda vão depositar. No comparativo o valor é consolidado; dentro da loja, o card “A receber” abre por plataforma. O total agora fecha com o Fluxo de Caixa.",
          },
          {
            kind: "correcao",
            title: "Fluxo de Caixa não conta mais repasse que já caiu",
            antes:
              "O filtro que separa o repasse pendente do já pago comparava o status letra por letra, e o relatório da Keeta escreve “Liquidado” com inicial maiúscula. Nenhum repasse era reconhecido como pago: tudo que a Keeta já tinha depositado voltava para a projeção como entrada de hoje.",
            depois:
              "Só entra o que ainda está para receber. Na rede Churrasco no Pote a previsão de 30 dias saiu de R$ 755 mil para R$ 269 mil — os R$ 486 mil de diferença já estavam na conta desde junho.",
          },
          {
            kind: "correcao",
            title: "O aviso do Fluxo de Caixa parou de se contradizer",
            antes:
              "Dava para ler “caixa positivo em todo o horizonte” e, na mesma frase, um menor saldo negativo — porque o mínimo considerava o saldo de agora, antes das entradas do próprio dia.",
            depois:
              "O mínimo é o menor saldo de fim de dia, o mesmo que o gráfico desenha. Caixa negativo hoje vira alerta de verdade, com a data.",
          },
          {
            kind: "melhoria",
            title: "O título do Financeiro diz de qual loja é o número",
            antes:
              "O nome da loja só aparecia no seletor, na outra ponta da tela. Num print, num PDF ou com duas abas abertas, o número ficava sem dono.",
            depois:
              "Escolheu a loja, o título vira “Financeiro — Hortolândia”. No consolidado continua só “Financeiro”.",
          },
          {
            kind: "correcao",
            title: "Contas e despesas da empresa voltaram a aparecer",
            antes:
              "Conta bancária ou despesa sem loja escolhida (as “da empresa”) sumia da tela e não aceitava lançamento nem importação de extrato — parecia que o financeiro estava vazio.",
            depois:
              "Aparecem normalmente para quem responde pela empresa. Franqueado ligado a lojas específicas continua vendo só o que é dele.",
          },
          {
            kind: "correcao",
            title: "Loja desativada não é mais sincronizada",
            antes:
              "Ao desativar uma loja no cadastro, a conexão com a plataforma continuava valendo — ninguém desvincula a loja no iFood ao fechar as portas. O sistema seguia buscando dados dela todo dia e ela aparecia como “sem dados há X dias”, como se fosse problema.",
            depois:
              "Loja desativada sai das rotinas automáticas na hora. Se reabrir, é só reativar no cadastro: a conexão continua guardada e o dado volta a entrar sozinho.",
          },
        ],
      },
    ],
  },
  {
    version: "1.14.1",
    date: "2026-08-08",
    tag: "Correções",
    title: "Loja recém-conectada não mostra mais R$ 0,00 esperando o iFood",
    summary:
      "Quem conecta a API do iFood passa a ver faturamento já no primeiro dia, com o aviso de que o extrato do mês ainda está a caminho.",
    areas: [
      {
        area: "Painel",
        items: [
          {
            kind: "correcao",
            title: "Faturamento aparece assim que os pedidos entram",
            antes:
              "O iFood entrega pedido e extrato por portas diferentes, e o extrato de uma loja nova pode demorar dias. Nesse meio-tempo o painel mostrava os pedidos e R$ 0,00 de faturamento — que se lê como loja que não vendeu.",
            depois:
              "Sem o extrato, o faturamento passa a ser a soma do que os clientes pagaram nos pedidos, com a etiqueta \"valor pago pelo cliente\". Quando o extrato chega, o número sobe: a cesta do extrato é contada antes das promoções, e por isso o aviso diz que elas ficam de fora.",
          },
          {
            kind: "correcao",
            title: "Taxa não é mais exibida como 100% quando falta o extrato",
            antes:
              "Sem repasse conhecido, a conta \"bruto menos repasse\" dava o faturamento inteiro, e a tela dizia que a plataforma tinha ficado com tudo — com margem R$ 0,00 logo abaixo, como se fosse resultado apurado.",
            depois:
              "Taxa, repasse, margem e resultado aparecem como “—” até o extrato chegar, dizendo por que estão vazios.",
          },
        ],
      },
    ],
  },
  {
    version: "1.14.0",
    date: "2026-08-05",
    tag: "Grande novidade",
    title: "O Nino aprendeu a operação inteira, e nasceu o Hub de Logística",
    summary:
      "O Nino AI passou a alcançar produtos, caixa, DRE, funil e integrações — antes ele só enxergava faturamento. E chegou um relatório novo: quantos pedidos saem em cada faixa de frete.",
    areas: [
      {
        area: "Nino AI",
        items: [
          {
            kind: "novo",
            title: "Ele agora busca o dado que a pergunta pedir",
            antes:
              "O Nino recebia um pacote fixo de números — faturamento, histórico, cancelamento e nota. Perguntas fora disso batiam em \"não tenho esse dado\", mesmo quando o sistema tinha.",
            depois:
              "Ele consulta sozinho sete fontes conforme a pergunta: produtos vendidos, caixa e contas a pagar, DRE e margem, funil e horário de pico, programas do iFood e repasses da Keeta, demanda de insumos e o status das integrações.",
          },
          {
            kind: "novo",
            title: "Marketing e retorno das promoções",
            desc:
              "Pergunte \"quanto investi em marketing\" ou \"qual meu ROAS\" e ele responde com o valor mês a mês e o retorno por real investido. O número existia, mas estava rotulado como taxa e ele não o reconhecia.",
          },
          {
            kind: "novo",
            title: "Ele sabe o que falta importar",
            desc:
              "\"Todas as lojas importaram?\" e \"quais lojas faltam trazer a planilha do 99?\" agora vêm respondidas com a lista de lojas, em vez de um convite a abrir outra tela.",
          },
          {
            kind: "correcao",
            title: "Respostas pararam de encolher quando a pergunta se repete",
            antes:
              "Perguntando a mesma coisa duas ou três vezes, a resposta ia ficando menor a cada vez — até virar uma linha só.",
            depois:
              "A mesma pergunta traz a mesma resposta completa. E ranking agora sempre vem com os cinco primeiros, não só o campeão.",
          },
          {
            kind: "correcao",
            title: "Os totais pararam de sair errados",
            antes:
              "Ele somava as listas de cabeça e escorregava — o mesmo top 5 chegou a aparecer com R$ 2 mil de diferença entre uma pergunta e outra.",
            depois:
              "As somas e percentuais vêm calculados do sistema. Onde antes vinha \"uma fatia significativa\", agora vem o percentual exato.",
          },
        ],
      },
      {
        area: "Hub de Relatórios",
        items: [
          {
            kind: "novo",
            title: "Nova categoria: Logística & Entrega",
            desc:
              "Com o relatório Faixas de frete: quantos pedidos saem em cada valor de taxa, quantos de graça, e o ticket médio de cada faixa — mostra se quem paga frete mais caro compra mais. Entrega por bairro entra em breve.",
          },
          {
            kind: "novo",
            title: "A cobertura aparece antes dos números",
            desc:
              "O relatório diz quantas lojas de cada plataforma têm taxa registrada, e avisa que loja sem taxa não é loja que não cobra frete — é relatório ainda não importado.",
          },
        ],
      },
      {
        area: "Dashboard",
        items: [
          {
            kind: "correcao",
            title: "Dia sem dado não conta mais como dia de venda zero",
            antes:
              "No começo do mês o painel mostrava quedas assustadoras. Em 5 de agosto acusou -30% no faturamento e -35% nos pedidos.",
            depois:
              "A comparação e a média por dia usam o último dia COM dado. A queda real era de 12%. O card agora mostra sobre quantos dias a média foi feita.",
          },
          {
            kind: "correcao",
            title: "O selo de cobertura conta só as lojas que usam a plataforma",
            antes:
              "Aparecia \"8/14 no 99 Food\", sugerindo seis lojas atrasadas — quando seis simplesmente não vendem no 99.",
            depois:
              "Agora é 8/8. O denominador passou a ser quem realmente usa cada plataforma.",
          },
          {
            kind: "melhoria",
            title: "Custo de entrega do 99 entra sozinho",
            desc:
              "Antes o custo do 99 só aparecia depois que alguém subia a planilha do mês — até lá o card mostrava zero, como se não houvesse gasto com entrega.",
          },
        ],
      },
      {
        area: "99 Food",
        items: [
          {
            kind: "novo",
            title: "Peça a conexão do 99 pela tela",
            desc:
              "A loja passa a pedir a conexão da API do 99 direto no cadastro da unidade, e acompanha o andamento — como já era no iFood.",
          },
        ],
      },
      {
        area: "Site (deliveryos.food)",
        items: [
          {
            kind: "novo",
            title: "A seção \"Quem já usa\" agora mostra quem já usa",
            antes:
              "Havia dois cartões de depoimento em branco, escritos \"[Depoimento real — a preencher]\", publicados no site.",
            depois:
              "No lugar deles entraram os números reais do que já passou pelo sistema — R$ 9,4 milhões em vendas, 164 mil pedidos, 83 lojas — e uma esteira com as marcas que rodam no Delivery OS.",
          },
        ],
      },
      {
        area: "Correções",
        items: [
          {
            kind: "correcao",
            title: "Top itens do Cardápio não repete mais o mesmo produto",
            antes:
              "Quando a loja exportava o relatório mais de uma vez no mês, o mesmo produto aparecia duas ou três vezes e o Top 10 virava Top 3 repetido.",
            depois:
              "Vale a exportação mais recente. No ranking da rede o efeito era pior: alguns produtos apareciam com até quatro vezes o faturamento real.",
          },
          {
            kind: "correcao",
            title: "Contagem de cancelados da Keeta",
            desc:
              "279 pedidos não entravam nem como concluídos nem como cancelados, e a soma não fechava com o total. O faturamento sempre esteve certo — só a contagem.",
          },
          {
            kind: "correcao",
            title: "Excluir uma unidade voltou a funcionar",
            desc:
              "A exclusão falhava com erro técnico. As conexões de API agora são apenas desvinculadas, não apagadas — assim ninguém precisa autorizar tudo de novo no portal.",
          },
        ],
      },
    ],
  },
  {
    version: "1.13.0",
    date: "2026-08-04",
    tag: "Melhorias",
    title: "Cardápio Web sincroniza sozinho, todo dia",
    summary:
      "A conexão com o Cardápio Web deixou de depender de alguém abrir a tela e clicar. E a venda feita no totem da loja voltou a contar como faturamento seu.",
    areas: [
      {
        area: "Cardápio Web",
        items: [
          {
            kind: "novo",
            title: "Os pedidos entram sozinhos, sem ninguém clicar",
            antes:
              "A loja conectada só trazia pedido novo quando alguém abria a tela de integração e clicava em sincronizar. Ficar dois dias sem abrir era ficar dois dias sem dado.",
            depois:
              "Uma rotina automática roda todo dia de manhã e traz os pedidos novos de todas as lojas conectadas.",
          },
          {
            kind: "melhoria",
            title: "O histórico agora vem desde janeiro",
            antes:
              "Ao conectar, o sistema buscava os últimos 6 meses. Quem conectava em agosto ficava sem janeiro e fevereiro.",
            depois:
              "O histórico volta até 1º de janeiro do ano, e chega aos poucos ao longo de algumas noites. Quem conecta agora também já vê o faturamento em minutos, sem esperar o dia seguinte.",
          },
          {
            kind: "correcao",
            title: "Venda no totem estava fora do seu faturamento",
            antes:
              "O pedido feito no totem de autoatendimento da loja era tratado como se fosse de marketplace: não entrava no Dashboard nem no DRE, e derrubava o seu percentual de canal próprio.",
            depois:
              "Totem é venda sua, sem comissão de ninguém. Passa a contar no faturamento e como canal próprio.",
          },
        ],
      },
    ],
  },
  {
    version: "1.12.0",
    date: "2026-08-03",
    tag: "Melhorias",
    title: '"Fica na loja" agora se chama assim em todas as telas',
    summary:
      "O mesmo número aparecia com quatro nomes diferentes pelo sistema. Agora é um só, com a explicação do que ele inclui.",
    destaque: true,
    areas: [
      {
        area: "Em todas as telas",
        items: [
          {
            kind: "melhoria",
            title: "Um nome só para o dinheiro que fica com você",
            antes:
              'O mesmo valor aparecia como "Líquido pra Você" no Dashboard, "Líquido (entra na conta)" no DRE Grupo, "Total líquido" nos Relatórios e "Fica na loja" na tela da loja. Olhando duas telas, não dava para saber se era o mesmo número ou dois conceitos diferentes.',
            depois:
              'Em todas as telas o nome é "Fica na loja", com a composição embaixo: repasse + venda direta. Passando o mouse, aparece a explicação completa.',
          },
          {
            kind: "correcao",
            title: "Resumo do Relatório do mês estava incompleto",
            antes:
              'O card "Líquido (recebido)" mostrava só o repasse das plataformas e deixava de fora a venda direta — discordando do DRE logo abaixo, na mesma página.',
            depois:
              "Agora mostra o total que fica com a loja, igual ao DRE e à tela da loja.",
          },
        ],
      },
    ],
  },
  {
    version: "1.11.3",
    date: "2026-08-03",
    tag: "Correções",
    title: "Visão Geral e Dashboard voltaram a abrir rápido",
    summary:
      "Duas telas estavam demorando a ponto de parecer travadas. O motivo era o mesmo nas duas, e foi corrigido.",
    areas: [
      {
        area: "Financeiro",
        items: [
          {
            kind: "correcao",
            title: "Visão Geral não abria",
            antes:
              "A tela ficava no carregamento sem terminar. Pra montar a projeção de caixa, ela baixava mais de 126 mil linhas de repasse — de mil em mil, uma consulta por vez — só pra somar 5 totais diários.",
            depois:
              "A soma passou a ser feita no banco: uma consulta, 5 linhas. A tela abre em menos de 1 segundo. Os valores são exatamente os mesmos, conferidos ao centavo.",
          },
        ],
      },
      {
        area: "Dashboard",
        items: [
          {
            kind: "melhoria",
            title: "Carregamento mais rápido",
            antes:
              "As setas de comparação com o mês passado esperavam todo o resto da página terminar pra só então começar a calcular.",
            depois:
              "Agora são calculadas junto com o resto. O tempo de abertura caiu para menos da metade.",
          },
        ],
      },
    ],
  },
  {
    version: "1.11.2",
    date: "2026-08-02",
    tag: "Melhorias",
    title: "A barra de cada plataforma agora separa a venda direta",
    summary:
      "Dava pra ver quanto ficava na loja, mas não quanto disso o cliente pagou na porta. Lido como repasse, dava a impressão de que a plataforma mandou mais do que mandou.",
    areas: [
      {
        area: "Dashboard",
        items: [
          {
            kind: "melhoria",
            title: "Três faixas em vez de duas, com legenda",
            antes:
              "A barra mostrava só duas cores: o que fica na loja e o que fica com a plataforma.",
            depois:
              "Agora são três — repasse da plataforma, venda direta (pago na loja) e o que fica com a plataforma — com legenda embaixo dizendo o que é cada cor.",
          },
          {
            kind: "melhoria",
            title: "Quanto da sua fatia veio da porta",
            desc: "Abaixo dos números aparece, por exemplo, “desses, 14,4% (R$ 25,3 mil) o cliente pagou direto na loja”.",
          },
          {
            kind: "correcao",
            title: "Textos que citavam vale-refeição",
            desc: "O “% que fica na loja” dizia “repasse + dinheiro na entrega + VR”. O vale saiu da conta na versão anterior (ele já vem dentro do repasse), e o texto ficou para trás. Corrigido.",
          },
        ],
      },
    ],
  },
  {
    version: "1.11.1",
    date: "2026-08-01",
    tag: "Correções",
    title: "O que fica na loja voltou a contar o dinheiro recebido na entrega",
    summary:
      "Ao olhar um mês que não é o atual, o dashboard deixava de fora o que o cliente paga direto na loja (dinheiro, PIX e maquininha na entrega) e o vale-refeição. Só o repasse do iFood era contado, e a margem aparecia bem menor do que a real.",
    // Mexeu num número que o cliente já tinha visto e usa pra julgar a
    // plataforma — ele precisa saber por que mudou.
    destaque: true,
    areas: [
      {
        area: "Dashboard",
        items: [
          {
            kind: "correcao",
            title: "Dinheiro recebido na entrega volta pra conta",
            antes:
              "Em julho, uma loja com R$ 52,5 mil de bruto aparecia com 66,9% ficando na loja — porque os R$ 4,5 mil pagos direto na entrega não entravam.",
            depois:
              "A mesma loja mostra 75,4%. O que o cliente paga na porta é da loja, não é taxa da plataforma, e agora aparece tanto no “% que fica na loja” quanto na barra de margem de cada plataforma.",
          },
          {
            kind: "correcao",
            title: "Vale-refeição também é do período escolhido",
            antes:
              "O VR mostrado era sempre o do mês corrente, qualquer que fosse o período no filtro. No dia 1º de cada mês ele aparecia praticamente zerado.",
            depois:
              "O VR passa a ser o do período que você escolheu no filtro.",
          },
        ],
      },
    ],
  },
  {
    version: "1.11.0",
    date: "2026-08-01",
    tag: "Grande novidade",
    title: "Conecte várias lojas ao iFood de uma vez",
    summary:
      "Antes a conexão era pedida loja por loja, dentro da página de cada unidade. Agora uma tela só lista todas as que faltam e pede a conexão de todas com um clique.",
    areas: [
      {
        area: "Conexão iFood",
        items: [
          {
            kind: "novo",
            title: "Uma tela com todas as lojas que faltam",
            antes:
              "Para conectar cada loja era preciso entrar na página dela e repetir o mesmo formulário. Com muitas lojas, isso virava dezenas de repetições — e na prática as lojas ficavam sem conectar.",
            depois:
              "A tela mostra todas as lojas que ainda dependem de planilha, já marcadas, e um botão só pede a conexão de todas. Se alguma tiver problema, as outras seguem e ela volta com o motivo escrito na própria linha.",
          },
          {
            kind: "novo",
            title: "Aviso na tela inicial",
            desc: "Uma faixa discreta mostra quantas lojas ainda dependem de planilha (\"8 de 49\") e leva direto para a tela de conexão. Quem já tem tudo conectado não vê nada.",
          },
          {
            kind: "melhoria",
            title: "Loja sem CNPJ resolve na mesma tela",
            antes:
              "Sem CNPJ a loja não conecta — e era preciso sair para o cadastro da unidade, preencher lá e voltar.",
            depois:
              "O campo de CNPJ fica na própria linha da loja, e a razão social aparece embaixo confirmando que é a empresa certa. O que você digitar aqui também fica salvo no cadastro da unidade.",
          },
          {
            kind: "melhoria",
            title: "Pedido recusado não repete o mesmo CNPJ",
            antes:
              "Uma loja recusada voltava para a lista com o mesmo CNPJ preenchido — clicar de novo trazia a mesma recusa.",
            depois:
              "O campo vem vazio, avisando qual número já foi tentado. Quase sempre o CNPJ está certo na Receita e o que difere é o cadastrado no iFood — o aviso indica olhar no Portal do Parceiro.",
          },
        ],
      },
    ],
  },
  {
    version: "1.10.0",
    date: "2026-07-31",
    tag: "Grande novidade",
    title: "Cadastro da unidade agora se preenche sozinho pelo CNPJ",
    summary:
      "A tela de unidade foi dividida em duas abas — os dados da loja de um lado, a operação do outro — e o CNPJ passou a puxar razão social, endereço completo e data de abertura direto da Receita.",
    areas: [
      {
        area: "Cadastro de unidade",
        items: [
          {
            kind: "novo",
            title: "Digite o CNPJ e o endereço aparece",
            antes:
              "Razão social, rua, número, bairro e CEP eram digitados um a um, e o CNPJ era opcional — muita loja ficava sem.",
            depois:
              "Ao sair do campo de CNPJ, o sistema consulta a Receita e preenche razão social, endereço completo, CEP, telefone e data de abertura. Se a empresa estiver com situação irregular, um aviso aparece na hora.",
          },
          {
            kind: "novo",
            title: "Tipo de cozinha sugerido pelo nome",
            desc: "Ao digitar o nome da loja, o sistema já marca o tipo de cozinha (pizzaria, hamburgueria, japonesa…). É só uma sugestão — troque no seletor quando não for.",
          },
          {
            kind: "melhoria",
            title: "Duas abas: Dados da unidade e Operação",
            antes:
              "Um formulário só, com o cadastro da loja misturado com plataforma, IDs e datas de inauguração.",
            depois:
              "Aba “Dados da unidade” para quem a loja é no papel; aba “Operação” para plataformas, quem entrega e se a unidade está ativa. Editar uma unidade abre exatamente a mesma tela de criar.",
          },
          {
            kind: "melhoria",
            title: "Quem entrega passou a ser uma informação do cadastro",
            desc: "Entrega própria muda a leitura do dinheiro: o frete cobrado do cliente entra no caixa da loja e a comissão do iFood aparece com outro nome no extrato. Agora o sistema sabe disso por unidade.",
          },
        ],
      },
    ],
  },
  {
    version: "1.9.6",
    date: "2026-07-29",
    tag: "Correções",
    title: "Faturamento de junho e julho recuperado",
    summary:
      "Lojas com muito movimento podiam ter o mês gravado pela metade na importação do iFood. Os meses afetados foram reimportados e a gravação foi refeita pra que isso não aconteça mais.",
    // Mexeu num número que a pessoa já tinha visto no painel — ela precisa
    // saber por que o faturamento mudou.
    destaque: true,
    areas: [
      {
        area: "Importação do iFood",
        items: [
          {
            kind: "correcao",
            title: "O mês não é mais apagado antes da carga nova entrar",
            antes:
              "A importação apagava o mês e só então gravava o novo. Se a gravação parasse no meio, o mês ficava pela metade e o histórico mesmo assim dizia “sucesso”.",
            depois:
              "A carga nova entra inteira, o sistema confere se tudo foi gravado, e só aí a antiga sai. Se falhar no meio, o mês anterior continua de pé e o histórico mostra o erro com o motivo.",
          },
          {
            kind: "correcao",
            title: "Junho e julho reimportados",
            desc: "As lojas afetadas tiveram os dois meses recarregados do iFood. O faturamento voltou ao valor correto.",
          },
        ],
      },
      {
        area: "Conexão iFood",
        items: [
          {
            kind: "melhoria",
            title: "CNPJ conferido na hora de pedir a conexão",
            antes:
              "Bastava ter 14 dígitos. Um número trocado passava e o pedido só era recusado dias depois.",
            depois:
              "O CNPJ é validado na hora. Se algum número estiver trocado, o aviso aparece na tela antes de enviar.",
          },
          {
            kind: "melhoria",
            title: "Recusa agora explica o motivo",
            desc: "Quando um pedido de conexão é recusado, você recebe um e-mail com o motivo e o aviso passa a aparecer também na tela inicial — antes ele só existia dentro da página daquela loja.",
          },
          {
            kind: "novo",
            title: "“Não apareceu pra aprovar”",
            antes:
              "Se uma loja não aparecia no seu Portal do Parceiro, o pedido ficava esperando pra sempre e não havia como avisar.",
            depois:
              "No aviso da loja tem “não apareceu pra aprovar”. Um clique devolve o pedido pra nossa fila e a solicitação é refeita.",
          },
        ],
      },
    ],
  },
  {
    version: "1.9.5",
    date: "2026-07-27",
    tag: "Grande novidade",
    title: "Sua loja conecta ao iFood sozinha",
    summary:
      "Depois que você aprova no Portal do Parceiro e avisa aqui, a conexão se fecha sozinha — e já traz financeiro e avaliações juntos.",
    areas: [
      {
        area: "Conexão iFood",
        items: [
          {
            kind: "novo",
            title: "Conexão automática depois do seu aviso",
            antes:
              "Você aprovava no Portal do Parceiro, clicava em \"Já aprovei no iFood\" e a conexão ficava esperando alguém da equipe abrir o painel e vincular a loja na mão.",
            depois:
              "O sistema procura sua loja no iFood sozinho e conclui a conexão. O aviso na tela inicial muda para \"sua loja foi conectada\" quando terminar.",
          },
          {
            kind: "correcao",
            title: "Loja conectada continuava pedindo planilha",
            antes:
              "A loja conectava e passava a puxar tudo pela API, mas a tela de importação seguia cobrando a Conciliação e as Avaliações como se nada tivesse sido conectado.",
            depois:
              "A conexão liga os dois de uma vez — financeiro e avaliações — e o que entra pela API sai da lista de pendências. Já corrigido em todas as lojas conectadas.",
          },
        ],
      },
    ],
  },
  {
    version: "1.9.4",
    date: "2026-07-25",
    tag: "Grande novidade",
    title: "Exportar em PDF — agora também o Dashboard",
    summary:
      "Todo relatório do Hub já sai em PDF, e o Dashboard inteiro virou um documento A4 pronto pra mandar por e-mail ou levar pra reunião.",
    areas: [
      {
        area: "Dashboard",
        items: [
          {
            kind: "novo",
            title: "Botão Exportar PDF no topo da tela",
            desc: "Gera um PDF A4 com o Dashboard inteiro, no mesmo layout que você vê na tela, em cerca de 3 páginas. Sai o que interessa: filtros, avisos de importação e a saudação ficam de fora.",
          },
          {
            kind: "novo",
            title: "No PDF as três plataformas aparecem juntas",
            antes:
              "Os cards com abas (funil, cancelamentos, produtos, avaliações) imprimiam só a plataforma que estava selecionada na tela — o resto do número sumia do documento.",
            depois:
              "No PDF cada card mostra iFood, 99 Food e Keeta empilhados e identificados, sem precisar imprimir três vezes.",
          },
        ],
      },
      {
        area: "Relatórios",
        items: [
          {
            kind: "novo",
            title: "PDF nos relatórios que ainda não tinham",
            desc: "Ranking de lojas e mais quatro relatórios do Hub ganharam o botão de exportar.",
          },
          {
            kind: "melhoria",
            title: "PDF em tema claro mesmo pra quem usa o escuro",
            antes:
              "Quem trabalha no tema escuro exportava selos e destaques com texto claro sobre papel branco — praticamente ilegíveis.",
            depois:
              "A exportação força o tema claro e volta ao escuro sozinha quando termina.",
          },
        ],
      },
    ],
  },
  {
    version: "1.9.3",
    date: "2026-07-25",
    tag: "Correções",
    title: "Cardápio Web nas telas que ainda faltavam",
    areas: [
      {
        area: "Relatórios",
        items: [
          {
            kind: "correcao",
            title: "Filtros e colunas que ignoravam a venda direta",
            desc: "Evolução e Comparativo ganharam a quarta opção no filtro de plataforma; Infos Diária Venda ganhou a coluna; e os gráficos do Financeiro e da aba Diagnóstico passaram a desenhar a linha do canal próprio.",
          },
          {
            kind: "correcao",
            title: "Lugares que mostravam o nome de outra plataforma",
            antes:
              "Em alguns pontos — card de avaliações, histórico de importações, aviso de sincronização — uma plataforma sem tratamento específico aparecia com o nome ou o logo de outra.",
            depois:
              "Todos passaram a usar o mesmo nome oficial da plataforma. Onde a informação não existe (como a data de sincronização do canal próprio, que entra continuamente), aparece um traço em vez de um dado emprestado.",
          },
        ],
      },
    ],
  },
  {
    version: "1.9.2",
    date: "2026-07-25",
    tag: "Correções",
    title: "Ajustes finos na entrada do Cardápio Web",
    areas: [
      {
        area: "Faturamento",
        items: [
          {
            kind: "correcao",
            title: "Loja de teste não soma mais no faturamento da rede",
            antes:
              "Uma loja conectada em ambiente de teste entrava no DRE e no Dashboard junto com as lojas de verdade — o consolidado mostrava um faturamento que não existia.",
            depois:
              "Só loja em produção entra no número da rede. A tela da própria integração continua mostrando tudo, inclusive o teste, que é onde você confere se a conexão está trazendo os pedidos.",
          },
          {
            kind: "correcao",
            title: "Cancelamentos do Cardápio Web agora chegam",
            antes:
              "A integração só buscava pedidos concluídos, então o cancelamento do canal próprio aparecia sempre zerado — parecia uma operação sem nenhum cancelamento.",
            depois:
              "Pedido cancelado entra junto com o concluído. Vale para o histórico novo; o que já tinha sido importado antes não volta sozinho.",
          },
        ],
      },
      {
        area: "Relatórios",
        items: [
          {
            kind: "correcao",
            title: "Meta do dia contava a venda direta a menos",
            antes:
              "O relatório de acompanhamento somava só os marketplaces. A loja podia ter batido a meta e a tela mostrava em vermelho uma falta que não existia.",
            depois:
              "A venda pelo canal próprio entra na conta da meta.",
          },
          {
            kind: "correcao",
            title: "Diagnóstico da loja distribuía errado a participação",
            desc: "A fatia de cada plataforma era calculada sobre um total que ignorava a venda direta, então o iFood aparecia com participação maior do que tem. Isso também alimentava a análise da IA.",
          },
          {
            kind: "correcao",
            title: "Gráfico de evolução do Dashboard não desenhava o canal próprio",
            desc: "A linha do Cardápio Web não aparecia na legenda nem no gráfico. Plataforma sem nenhum movimento no período agora some do gráfico em vez de virar uma linha reta no zero.",
          },
          {
            kind: "correcao",
            title: "'Todas plataformas' aparecia sobre um total parcial",
            antes:
              "Em Evolução e Comparativo, selecionar 3 das 4 plataformas ainda escrevia 'todas plataformas' embaixo dos números.",
            depois:
              "O texto só diz 'todas' quando são todas mesmo; caso contrário lista quais entraram na conta.",
          },
        ],
      },
    ],
  },
  {
    version: "1.9.1",
    date: "2026-07-25",
    tag: "Correções",
    title: "Ranking mostrava o dobro; DRE agora inclui o canal próprio",
    destaque: true,
    summary:
      "Se você olhou o Ranking de lojas hoje, confira de novo: os valores estavam dobrados por algumas horas. Já corrigido.",
    areas: [
      {
        area: "Relatórios",
        items: [
          {
            kind: "correcao",
            title: "Ranking de lojas estava com faturamento e pedidos em dobro",
            antes:
              "Depois da entrada do Cardápio Web, cada loja aparecia no Ranking com o dobro do faturamento e o dobro dos pedidos. Só o Ranking foi afetado — Dashboard, DRE e a tela da loja seguiram certos.",
            depois:
              "Os valores voltaram ao real. A soma do rodapé também passou a fechar com as linhas da tabela.",
          },
          {
            kind: "correcao",
            title: "Produtos mais vendidos do Cardápio Web mostrava itens da Keeta",
            desc: "Ao filtrar produtos por Cardápio Web, a lista trazia os produtos da Keeta com o título trocado. Agora fica vazia até existir o relatório próprio.",
          },
          {
            kind: "correcao",
            title: "Faturamento por plataforma tinha percentuais errados",
            antes:
              "O relatório dividia tudo por um total que não contava a venda direta, então a fatia do iFood e das outras aparecia maior do que realmente é.",
            depois:
              "O Cardápio Web virou o quarto card e entrou no total. Nele, o valor aparece como 'sem comissão' em vez de 'líquido' — não é um repasse que você negociou, é venda que não passou por marketplace.",
          },
        ],
      },
      {
        area: "Relatórios (cont.)",
        items: [
          {
            kind: "melhoria",
            title: "Cancelamentos, Ticket médio, Evolução e Comparativo",
            desc: "Os quatro passaram a contar a venda direta. Em Cancelamentos e Ticket médio o Cardápio Web virou coluna; em Evolução e Comparativo virou opção do filtro de plataforma. Loja que vende só pelo canal próprio deixou de sumir dessas telas.",
          },
          {
            kind: "novo",
            title: "Produtos mais vendidos do Cardápio Web",
            desc: "O relatório de Produtos agora abre o ranking do canal próprio. Sub-item de combo conta separado, igual à tela da integração — é o que amarra na ficha técnica.",
          },
        ],
      },
      {
        area: "DRE",
        items: [
          {
            kind: "melhoria",
            title: "Venda direta entra no DRE da rede",
            antes:
              "O DRE somava só os marketplaces. Uma loja que vendesse apenas pelo canal próprio não aparecia no relatório.",
            depois:
              "O Cardápio Web entra no faturamento e ganha uma linha em 'Taxas das plataformas' com R$ 0,00 — dá pra ver de imediato quanto da sua margem some em comissão e quanto fica quando a venda é direta.",
          },
        ],
      },
    ],
  },
  {
    version: "1.9.0",
    date: "2026-07-25",
    tag: "Grande novidade",
    title: "Cardápio Web entra no faturamento como plataforma",
    summary:
      "O que você vende pelo seu próprio site e cardápio digital agora soma no Dashboard, no faturamento da loja e no DRE — do lado do iFood, 99 Food e Keeta.",
    areas: [
      {
        area: "Faturamento",
        items: [
          {
            kind: "novo",
            title: "Venda direta aparece junto com os marketplaces",
            desc: "Bruto, pedidos, ticket médio e cancelamento da sua loja passam a incluir o Cardápio Web. Na Visão por plataforma ele aparece como um quarto card, e no filtro do Dashboard vira mais uma opção.",
          },
          {
            kind: "novo",
            title: "Dá pra ver quanto a margem melhora sem comissão",
            antes:
              "O faturamento do canal próprio ficava só na tela da integração, separado do resto. Não dava pra comparar com o que o marketplace deixa na loja.",
            depois:
              "O Cardápio Web mostra 100% de repasse e taxa zerada, ao lado dos marketplaces com a comissão deles. A diferença de margem entre vender direto e vender por aplicativo fica na mesma tela.",
          },
        ],
      },
    ],
  },
  {
    version: "1.8.2",
    date: "2026-07-25",
    tag: "Correções",
    title: "Cardápio Web: dá pra escolher a unidade depois de conectar",
    areas: [
      {
        area: "Cardápio Web",
        items: [
          {
            kind: "correcao",
            title: "Vínculo da loja com a unidade agora é editável",
            antes:
              "A unidade só podia ser escolhida no momento de conectar. Quem deixasse em 'escolher depois' não tinha como voltar atrás, e todo o histórico já importado ficava sem loja dona — invisível em qualquer visão por unidade.",
            depois:
              "O card da loja conectada tem um seletor de unidade. Ao salvar, os pedidos, o cardápio e os clientes já importados passam junto para a unidade escolhida.",
          },
          {
            kind: "correcao",
            title: "Cardápio Web aparece como canal da loja",
            desc: "Na tela de Unidades, o Cardápio Web entra ao lado de iFood, 99 Food e Keeta. Vincular a loja já marca o canal sozinho — não precisa lembrar de ir lá marcar na mão.",
          },
        ],
      },
    ],
  },
  {
    version: "1.8.1",
    date: "2026-07-25",
    tag: "Correções",
    title: "Número da loja não repete mais entre marcas",
    areas: [
      {
        area: "Unidades",
        items: [
          {
            kind: "correcao",
            title: "Cada loja nova ganha um número único na empresa inteira",
            antes:
              "A numeração era contada por marca. Se você tem mais de uma marca, duas lojas podiam receber o mesmo número — e abrir o card de uma levava para a outra, porque o endereço da tela usa esse número.",
            depois:
              "A contagem passou a considerar todas as marcas da empresa. Cada loja tem um número só dela, e o card sempre abre a loja certa.",
          },
        ],
      },
    ],
  },
  {
    version: "1.8.0",
    date: "2026-07-25",
    tag: "Grande novidade",
    title: "Verificação em duas etapas (2FA) para proteger sua conta",
    summary:
      "Agora dá para exigir um código do celular além da senha. Sua conta acessa faturamento e repasses — com o 2FA ligado, saber a senha não basta para entrar.",
    areas: [
      {
        area: "Segurança",
        items: [
          {
            kind: "novo",
            title: "Ative em Minha conta → Segurança",
            desc: "Você escaneia um QR Code com um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password, Authy) e digita o código de 6 dígitos para confirmar. A partir daí, todo login pede esse código.",
          },
          {
            kind: "novo",
            title: "Opcional e por pessoa",
            desc: "Cada usuário decide se quer ativar — quem não ativar continua entrando só com a senha. Desativar também exige um código válido, para que ninguém desligue a proteção usando uma tela que você deixou aberta.",
          },
          {
            kind: "novo",
            title: "8 códigos de recuperação para não depender de ninguém",
            desc: "Ao ativar a verificação, você recebe 8 códigos de uso único. Guarde-os fora do celular (num gerenciador de senhas ou impressos). Se perder o aparelho, entra com um deles — a verificação é desativada e você cadastra o celular novo. Dá para gerar códigos novos quando quiser, o que invalida os antigos.",
          },
          {
            kind: "novo",
            title: "Perdeu o celular e os códigos? O administrador resolve",
            desc: "Em Minha conta → Usuários, quem tem a verificação ativa aparece com um escudo verde, e o administrador pode desativá-la para essa pessoa. Ela volta a entrar só com e-mail e senha e cadastra um aparelho novo depois. Atenção: confirme por telefone ou pessoalmente quem está pedindo — esse é justamente o caminho que um golpista tentaria usar.",
          },
        ],
      },
    ],
  },
  {
    version: "1.7.0",
    date: "2026-07-25",
    tag: "Grande novidade",
    title: "Termos de Uso e Política de Privacidade reescritos",
    summary:
      "Os dois documentos foram refeitos do zero, bem mais completos e claros — incluindo quem responde pelos dados dos seus clientes finais, o que a inteligência artificial faz (e não faz) e as regras de cobrança, cancelamento e suporte.",
    areas: [
      {
        area: "Documentos legais",
        items: [
          {
            kind: "novo",
            title: "Ficou claro quem responde pelos dados dos seus clientes",
            antes:
              "A política dizia que o Delivery OS era o controlador de todos os dados, inclusive dos consumidores que compram na sua loja.",
            depois:
              "Agora está correto: sobre os dados dos seus clientes finais, quem decide é você (Controlador) e o Delivery OS apenas processa (Operador). Isso protege os dois lados e é o que a LGPD exige.",
          },
          {
            kind: "novo",
            title: "Tabela de dados, finalidade e base legal",
            desc: "A Política agora mostra numa tabela cada tipo de dado que tratamos, para que serve e qual a base legal da LGPD. Também detalha prazos de guarda, incidentes de segurança, cookies e como exercer seus direitos.",
          },
          {
            kind: "novo",
            title: "Regras de cobrança e cancelamento explícitas",
            desc: "Reajuste anual pelo IPCA, direito de arrependimento em 7 dias com devolução integral, 30 dias para exportar seus dados após o cancelamento e horário de suporte definido (e-mail e WhatsApp, dias úteis das 9h às 18h).",
          },
          {
            kind: "novo",
            title: "Limites da inteligência artificial declarados",
            desc: "Está escrito que a IA apoia a decisão e pode errar, que não substitui contador ou advogado, e que seus dados não são usados para treinar modelos.",
          },
        ],
      },
    ],
  },
  {
    version: "1.6.0",
    date: "2026-07-24",
    tag: "Grande novidade",
    title: "O último relatório do iFood também entra sozinho — acabou a importação manual do iFood",
    summary:
      "O “Relatório de pedidos (VR)”, que precisava ser baixado loja por loja todo mês, agora vem pela API. Com ele, os três relatórios do iFood (Conciliação, Pedidos e Avaliações) entram automaticamente.",
    areas: [
      {
        area: "iFood",
        items: [
          {
            kind: "novo",
            title: "Forma de pagamento e VR pela API",
            antes:
              "Todo mês alguém baixava o Relatório de pedidos no portal, um arquivo por loja, pra o sistema saber a forma de pagamento e o vale-refeição.",
            depois:
              "Isso entra sozinho na sincronização. Conferimos contra o arquivo manual de junho: o mix de pagamento bateu 99,8% e o VR por bandeira (Alelo, Sodexo, Ticket, VR) bateu exato.",
          },
          {
            kind: "melhoria",
            title: "Mais completo que a planilha",
            desc: "Na conferência de junho, a API trouxe 253 pedidos que faltavam no arquivo que tinha sido subido — dois dias do mês não tinham sido exportados. Além disso ela separa os vales do iFood por tipo, coisa que o relatório juntava tudo em “Outros”.",
          },
        ],
      },
      {
        area: "Importação",
        items: [
          {
            kind: "melhoria",
            title: "Conciliação e Pedidos marcados como “↻ API”",
            desc: "Na Saúde da importação, os relatórios cobertos pela API deixam de ser cobrados e aparecem como sincronizados. Do iFood, só o Cardápio ainda depende de planilha.",
          },
        ],
      },
    ],
  },
  {
    version: "1.5.1",
    date: "2026-07-24",
    tag: "Melhorias",
    title: "Avaliações pela API param de cobrar planilha — e a sincronização mostra loja a loja",
    summary:
      "Quando a loja tem o app de Avaliações habilitado, a Importação passa a marcar “↻ API” em vez de pedir o arquivo. E o resumo da sincronização ganhou uma visão por loja, com financeiro e avaliações lado a lado.",
    areas: [
      {
        area: "Importação",
        items: [
          {
            kind: "novo",
            title: "Avaliações do iFood marcadas como “↻ API”",
            antes:
              "A Saúde da importação cobrava o relatório de Avaliações mesmo nas lojas em que ele já entrava sozinho pela API.",
            depois:
              "Nessas lojas a linha aparece como “↻ API · sincronizado” — não precisa subir planilha. Se só parte das lojas está na API, mostra a proporção (ex.: 11/16 lojas).",
          },
        ],
      },
      {
        area: "iFood",
        items: [
          {
            kind: "novo",
            title: "Resumo da sincronização por loja",
            desc: "No popup do “Sincronizar iFood”, um botão alterna entre ver por situação (como era) e ver por loja — nessa, cada loja mostra numa linha só o que puxou de Financeiro e de Avaliações.",
          },
          {
            kind: "melhoria",
            title: "Extrato que o iFood não fechou não é mais “erro”",
            antes:
              "Quando o iFood não conseguia gerar o extrato da loja (comum no mês em aberto), a loja caía no vermelho “Com erro”, como se algo estivesse quebrado.",
            depois:
              "Vai para um aviso azul “o iFood ainda não fechou o extrato desta loja — tenta de novo mais tarde”, separado dos erros de verdade.",
          },
        ],
      },
    ],
  },
  {
    version: "1.5.0",
    date: "2026-07-24",
    tag: "Grande novidade",
    title: "Um botão só sincroniza o iFood inteiro — financeiro e avaliações",
    summary:
      "O “Sincronizar iFood” do painel agora traz, na mesma rodada, a conciliação financeira E as avaliações (com as etiquetas de elogio/reclamação). E, todo dia, isso acontece sozinho.",
    areas: [
      {
        area: "iFood",
        items: [
          {
            kind: "melhoria",
            title: "Sincronização financeiro + avaliações num clique só",
            antes:
              "Eram dois botões: “Sincronizar iFood” (financeiro) no painel e “Sincronizar avaliações” dentro da tela de Avaliações.",
            depois:
              "Um único botão “Sincronizar iFood” no painel puxa as duas coisas de uma vez e mostra o resultado em duas seções (Financeiro e Avaliações), loja a loja.",
          },
          {
            kind: "novo",
            title: "Avaliações trazem as etiquetas (elogios e reclamações)",
            desc: "Além de nota e comentário, a sincronização agora puxa as etiquetas que o cliente marcou — “Comida saborosa”, “Boa embalagem” e afins — separando elogios de reclamações, igual ao que vinha da planilha. A importação de avaliações por arquivo deixa de ser necessária.",
          },
          {
            kind: "novo",
            title: "Sincronização automática diária",
            desc: "Todo dia o sistema puxa sozinho as avaliações novas das lojas conectadas. Cada rodada fica registrada no Histórico de Importações, com a loja que atualizou.",
          },
        ],
      },
    ],
  },
  {
    version: "1.4.9",
    date: "2026-07-24",
    tag: "Grande novidade",
    title: "Avaliações do iFood entram sozinhas, pela API",
    summary:
      "O módulo de Avaliações do iFood foi aprovado. Agora, para a loja que autorizar o app no portal, as avaliações são puxadas direto pela API — nota, comentário e status — sem depender de importar planilha.",
    areas: [
      {
        area: "Avaliações",
        items: [
          {
            kind: "novo",
            title: "Botão “Sincronizar avaliações iFood”",
            desc: "Na tela de Avaliações, um clique puxa as avaliações via API das lojas com iFood conectado. O resumo mostra loja a loja: quantas trouxe, quais ainda precisam autorizar o app no portal, e eventuais erros. As avaliações caem na mesma base do import (sem duplicar) — a API vira a fonte da verdade dali pra frente.",
          },
        ],
      },
    ],
  },
  {
    version: "1.4.8",
    date: "2026-07-24",
    tag: "Melhorias",
    title: "“O que fica com a loja” consistente no sistema inteiro",
    summary:
      "Varredura em todo o painel pra que o dinheiro recebido na entrega (dinheiro/PIX/VR) apareça como da loja em TODA tela — e nunca mais como taxa da plataforma. Os números agora batem entre dashboard, tabela de lojas, unidade, Financeiro e DRE.",
    areas: [
      {
        area: "Dashboard",
        items: [
          {
            kind: "melhoria",
            title: "“Taxa de repasse” virou “% que fica na loja”",
            antes: "Taxa de repasse 51,2% (só o repasse das plataformas)",
            depois: "% que fica na loja 60,8% (repasse + dinheiro na entrega + VR)",
            desc: "O card mostrava só quanto a plataforma repassa, deixando de fora o dinheiro que o cliente paga na entrega (que já é seu). Agora é a versão em % do “Líquido pra Você”, com a mesma régua do resto do painel.",
          },
          {
            kind: "correcao",
            title: "Tabela de lojas e visão por plataforma na régua certa",
            desc: "A coluna “% Loja”, a barra por plataforma e o “Líquido pra loja” agora somam o recebido na entrega e não contam ele como taxa — igual ao detalhe de cada loja.",
          },
          {
            kind: "correcao",
            title: "“% que fica na loja” + “taxa” agora fecham 100%",
            antes: "60,8% que fica + 43% de taxa = 103,8% (passava de 100%)",
            depois: "58,5% que fica + 41,5% de taxa = 100%",
            desc: "O “% que fica na loja” dividia tudo (incluindo o VR, que é pago à parte) pelo faturamento bruto, e a taxa usava outra base — por isso a soma passava de 100%. Agora a base é todo o dinheiro que circulou (o que você recebeu + a taxa da plataforma): o que fica com a loja + a taxa dá 100% certinho.",
          },
        ],
      },
      {
        area: "Financeiro, DRE e Unidade",
        items: [
          {
            kind: "correcao",
            title: "KPIs do Financeiro batem com o DRE",
            antes: "Líquido (entra na conta) e taxas com o recebido na entrega no lado errado",
            depois: "Líquido inclui o recebido na entrega; taxa mostra só a taxa real",
            desc: "Os cards do Financeiro e do relatório de Resultado vinham de um cálculo que ignorava o recebido na entrega. Agora o “Líquido (entra na conta)”, as “Taxas das plataformas” e o “Resultado” batem no valor com o DRE da mesma tela.",
          },
          {
            kind: "correcao",
            title: "Card “Resultado” da unidade não fica menor que o DRE",
            desc: "No topo da unidade, o “Resultado” não somava o recebido na entrega e ficava abaixo do “Resultado total da loja” logo no DRE abaixo. Agora os dois batem.",
          },
        ],
      },
    ],
  },
  {
    version: "1.4.7",
    date: "2026-07-24",
    tag: "Melhorias",
    title: "“% que fica na loja” agora mostra o que você realmente embolsa",
    areas: [
      {
        area: "Dashboard",
        items: [
          {
            kind: "melhoria",
            title: "O % da loja soma o dinheiro recebido fora do repasse",
            antes: "63,7% — só o repasse das plataformas",
            depois: "63,7% incluindo os R$ recebidos direto (dinheiro/PIX na entrega + VR)",
            desc: "No detalhamento por unidade, o “% que fica na loja” mostrava só o líquido do repasse — como se o dinheiro que o cliente paga na entrega (PIX/maquininha) e o VR fossem taxa. Mas esse valor já está no seu bolso. Agora o número é o mesmo “Resultado total da loja” do DRE, com uma linha explicando o quanto veio fora do repasse. As barras por plataforma continuam mostrando o repasse de cada canal.",
          },
          {
            kind: "melhoria",
            title: "“Líquido pra Você” da rede também conta o recebido direto",
            desc: "O card de topo do dashboard (“Líquido pra Você · o que de fato entra”) seguia a mesma régua e agora soma o repasse + o recebido direto + o VR de toda a rede — igual à soma do que fica em cada loja.",
          },
          {
            kind: "correcao",
            title: "DRE da rede esquecia o dinheiro recebido na entrega",
            antes: "Resultado total da rede R$ 433,2 mil",
            depois: "Resultado total da rede R$ 480,9 mil",
            desc: "No DRE Grupo e no Financeiro, o consolidado da rede não somava o “recebido direto” (dinheiro/PIX na entrega) que o DRE de cada loja já contava — subestimava o resultado em ~R$ 47,7 mil. De quebra, a taxa por plataforma ficou correta: o recebido direto não é mais contado como se fosse taxa do iFood.",
          },
          {
            kind: "correcao",
            title: "Card “Taxas das plataformas” não infla mais a taxa do iFood",
            antes: "iFood R$ 209,2 mil · total R$ 427,6 mil (49% do bruto)",
            depois: "iFood R$ 161,5 mil · total R$ 379,9 mil (43% do bruto)",
            desc: "O card de taxas do dashboard contava o recebido direto (dinheiro/PIX na entrega) como se fosse taxa do iFood. Agora mostra só a taxa real de cada plataforma, batendo com o DRE.",
          },
        ],
      },
    ],
  },
  {
    version: "1.4.6",
    date: "2026-07-23",
    tag: "Correções",
    title: "Relatório Diário e Nino agora batem com o resto do painel",
    summary:
      "Investigando uma diferença entre o Nino e o Relatório Diário, apareceram três causas — duas delas escondendo ou inventando faturamento no Relatório Diário. Todas corrigidas: as telas agora mostram o mesmo número.",
    areas: [
      {
        area: "Relatório Diário",
        items: [
          {
            kind: "correcao",
            title: "99 Food sumia da loja que ainda não subiu o relatório diário",
            antes: "Santana: R$ 0 de 99 Food (R$ 16.242 invisíveis)",
            depois: "Santana: R$ 62,7 mil no total, igual ao dashboard",
            desc: "A tela lia só o relatório diário do 99 em XLSX. Quem já tem o financeiro vindo direto da API da 99, mas ainda não importou a planilha, aparecia com zero — enquanto o dashboard e o DRE mostravam a receita certa. Agora a tela usa o mesmo caminho do resto do sistema.",
          },
          {
            kind: "correcao",
            title: "Pedido do iFood contado em dobro",
            antes: "JK: R$ 131.268 de iFood",
            depois: "JK: R$ 130.581 — o mesmo da página da unidade",
            desc: "Quando um pedido tinha mais de uma linha financeira na Conciliação (ajuste, reprocessamento), a tela somava as duas e criava faturamento que não existiu. Na JK eram R$ 686,82 em julho. Agora conta uma venda por pedido, como as demais telas já faziam.",
          },
        ],
      },
      {
        area: "Nino AI",
        items: [
          {
            kind: "correcao",
            title: "Nino responde o mesmo Bruto que a tela mostra",
            desc: "Quando o Bruto passou a ser o total COM os cancelados (o número do portal), o Nino ficou de fora e continuava respondendo cerca de 1% a menos. Agora ele segue a mesma régua no mês, no histórico do ano, nas quinzenas e em qualquer período que você pedir.",
          },
        ],
      },
    ],
  },
  {
    version: "1.4.5",
    date: "2026-07-23",
    tag: "Melhorias",
    title: "Nino AI responde qualquer período",
    summary:
      "Antes o Nino só sabia mês e quinzena — perguntar “a semana do dia 13 a 20” recebia um “não tenho esse recorte”. Agora ele pede o cálculo ao sistema e responde qualquer intervalo de datas, com o número exato.",
    areas: [
      {
        area: "Nino AI",
        items: [
          {
            kind: "novo",
            title: "Pergunte por semana, fim de semana ou um dia só",
            antes:
              "“Não tenho o recorte por semana isolada — só por quinzena.”",
            depois:
              "“Na semana de 13 a 20 de julho, JK foi a campeã com R$ 92.334,34, seguida por Brooklin e Jardins.”",
            desc: "Vale pra qualquer intervalo dentro de um mês: “de 13 a 20”, “semana passada”, “últimos 7 dias”, “no dia 15”, um fim de semana. O total sai do sistema, não de conta feita pela IA — então o número é o mesmo do painel. Enquanto ele consulta, a tela mostra “Somando o período pedido…”.",
          },
          {
            kind: "correcao",
            title: "Ranking sempre do maior pro menor",
            desc: "Num “top 5” de lojas o Nino chegou a listar uma loja de R$ 196 mil acima de uma de R$ 202 mil. Os valores estavam certos, a ordem não. Agora a lista já chega ordenada pelo faturamento, então o primeiro colocado é sempre o maior.",
          },
        ],
      },
    ],
  },
  {
    version: "1.4.4",
    date: "2026-07-23",
    tag: "Melhorias",
    title: "Bruto igual ao portal em todo o painel",
    summary:
      "O Bruto agora é o total COM os pedidos cancelados — o mesmo número do portal do iFood — em todas as telas: unidade, dashboard, DRE Grupo, Resultado, relatório do mês e importação. As margens e taxas continuam calculadas sobre a venda válida, como no DRE.",
    areas: [
      {
        area: "Todas as telas",
        items: [
          {
            kind: "melhoria",
            title: "Bruto total, com os cancelados ao lado dos pedidos",
            antes: "Bruto R$ 214.575 (sem cancelados) ≠ portal",
            depois:
              "Bruto R$ 216.280 · “3.334 pedidos · 30 cancelados” — igual ao “Valor das vendas” do portal",
            desc: "O número principal agora bate com a tela do iFood em toda parte: heros da unidade e do dashboard, tabela de lojas, visão por plataforma, DRE Grupo (que também abre em “Vendas totais − cancelados”), tela Resultado, relatório do mês e card de resultado da importação. O DRE mostra a subtração dos cancelados e todos os percentuais (margem, repasse, ticket) seguem na base válida.",
          },
          {
            kind: "melhoria",
            title: "Evolução: total do mês no gráfico",
            desc: "Ao passar o mouse no gráfico de evolução, além do valor por plataforma agora aparece o total do mês (Faturamento e Pedidos) ou a média ponderada (Ticket médio).",
          },
          {
            kind: "correcao",
            title: "Perda de cancelamento agora é a venda real",
            desc: "Os cards de cancelamento (Perda no mês, por motivo) usavam o lançamento de estorno da Conciliação, que é menor que o valor da venda cancelada. Agora usam o valor de venda real de cada pedido cancelado.",
          },
        ],
      },
      {
        area: "Custos da loja",
        items: [
          {
            kind: "correcao",
            title: "Total zerava no banco mas ficava na tela",
            desc: "Ao remover a última categoria de custo, o total antigo continuava aparecendo no card (só sumia recarregando). Agora limpa na hora.",
          },
        ],
      },
      {
        area: "Clientes da plataforma",
        items: [
          {
            kind: "novo",
            title: "Plano do cliente + upgrade + Nino “por conta da casa”",
            desc: "No detalhe do cliente agora dá pra ver e DEFINIR o plano (Essencial/Pro/DeliveryOS AI) — antes ficava em branco pra quem paga manual. Mostra o upgrade sugerido num clique e, nos planos Essencial/Pro, um botão pra liberar 7 dias do Nino AI “por conta da casa” (cota enxuta de ~20 mensagens, sem virar plano AI). O cliente recebe um convite na tela pra abrir o Nino, e durante a cortesia o chat mostra um contador (ex.: “8 de 20 · até 28/07”) com atalho pra assinar o plano AI.",
          },
          {
            kind: "melhoria",
            title: "Coluna “Plano” na lista de clientes",
            desc: "A tabela de clientes ganhou uma coluna própria de Plano (colorida por tier), separada de Status e Pagamento. Cliente novo já nasce no Pro, e nenhum cliente fica sem plano.",
          },
          {
            kind: "novo",
            title: "Tela “Conexões de API” dentro de Clientes",
            desc: "Uma lista de todas as lojas de todos os clientes mostrando de qual cliente é cada uma, quais plataformas tem, e quais estão conectadas por API (iFood / 99). Com busca e filtros “Conectadas via API” / “Sem API”. O modal de lojas do cliente também ganhou os selos de plataforma e API por loja.",
          },
        ],
      },
      {
        area: "Integração iFood",
        items: [
          {
            kind: "novo",
            title: "Aviso de conexão iFood na tela inicial + “Já aprovei”",
            desc: "Quando você pede a conexão de uma loja com o iFood, a tela inicial passa a mostrar o andamento: “falta você aprovar no iFood” (com um botão que abre o Portal do Parceiro e um “Já aprovei no iFood” pra avisar a equipe), e quando fica pronta, um aviso “sua loja foi conectada ao iFood! 🎉”. Assim você sempre sabe em que pé está, sem precisar perguntar.",
          },
          {
            kind: "novo",
            title: "Aviso no Dashboard quando um cliente pede conexão iFood",
            desc: "Quando um cliente clica em “Pedir autorização” no cadastro da loja, aparece uma faixa no topo do seu Dashboard (só admin da plataforma) com a empresa e a loja, e um atalho pra revisar e solicitar no Portal do Desenvolvedor.",
          },
          {
            kind: "novo",
            title: "Loja nova se conecta e puxa o histórico sozinha",
            desc: "Assim que você aprova a loja no Portal do iFood, o sistema casa ela com o cadastro (pelo nome, entre as que pediram conexão) e vincula — no sync e no cron diário. O histórico do ano é puxado pelo cron. Sem mexer em nada manualmente; casos duvidosos ficam pra você confirmar num clique.",
          },
          {
            kind: "correcao",
            title: "Sincronizar não trava mais com “erro do servidor”",
            desc: "Em contas com loja recém-conectada, o Sincronizar tentava puxar o histórico inteiro na hora e às vezes estourava o tempo, mostrando um erro técnico feio. Agora o clique só vincula e sincroniza o período recente (rápido), o histórico vem pelo cron, e qualquer falha aparece com uma mensagem clara.",
          },
          {
            kind: "novo",
            title: "Botão “Sincronizar iFood” aparece com loja vinculada",
            desc: "Assim que a primeira loja da sua conta é conectada à API do iFood, o botão de sincronizar aparece no Dashboard — e some se nenhuma loja tiver vínculo. O mesmo vale pro botão do 99 Food.",
          },
          {
            kind: "melhoria",
            title: "Sync explica quais lojas ficaram de fora",
            desc: "O resultado da sincronização agora avisa quantas (e quais) lojas não entraram por ainda não terem a integração com o iFood — o financeiro delas segue via importação de planilha, e dá pra pedir a conexão em Editar unidade.",
          },
          {
            kind: "melhoria",
            title: "Aviso “mês em aberto” ao comparar com o portal",
            desc: "O portal do iFood mostra as vendas ao vivo; o sistema sincroniza a conciliação financeira, que fecha com algumas horas de defasagem. Agora a faixa de cobertura (dashboard e unidade) e o resultado do sync explicam isso — no mês fechado os números batem ao centavo.",
          },
        ],
      },
    ],
  },
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
            title: "DRE começa do “Valor das vendas” do portal",
            desc: "Em vez de só explicar a diferença, o DRE agora mostra a conta acontecendo: abre com as Vendas totais (o número que aparece no portal do iFood), desconta os pedidos cancelados na sua frente e chega no Faturamento bruto.",
            antes: "DRE começava direto no Faturamento bruto (sem cancelados)",
            depois:
              "Vendas totais → (−) Pedidos cancelados (19) → = Faturamento bruto",
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

/**
 * Uma versão só INTERROMPE o usuário com o pop-up quando traz mudança
 * estrutural — recurso novo ou melhoria. Versão só de correção entra na tela
 * de Novidades normalmente, mas não abre pop-up: conserto é manutenção, não
 * novidade, e avisar de tudo faz a pessoa parar de ler os avisos.
 *
 * `destaque: true` força o pop-up mesmo assim.
 */
function ehEstrutural(r: Release): boolean {
  if (r.destaque) return true
  return r.areas.some((a) => a.items.some((i) => i.kind !== "correcao"))
}

/**
 * Qual versão o pop-up deve anunciar pra quem já viu `lastSeenVersion`.
 * Null = não anuncia nada.
 *
 * A comparação é por POSIÇÃO na lista (que é da mais nova pra mais antiga),
 * não por igualdade: quem já dispensou uma versão mais NOVA que a anunciável
 * não pode ver o pop-up de novo. Isso acontece de verdade — basta a última
 * versão ser só de correção.
 */
export function anuncioPendente(lastSeenVersion: string | null): Release | null {
  const alvo = CHANGELOG.findIndex(ehEstrutural)
  if (alvo === -1) return null
  const visto = lastSeenVersion
    ? CHANGELOG.findIndex((r) => r.version === lastSeenVersion)
    : -1
  // Índice menor = mais recente. Versão desconhecida (-1) = nunca viu.
  if (visto !== -1 && visto <= alvo) return null
  return CHANGELOG[alvo]
}
