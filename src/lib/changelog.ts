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
