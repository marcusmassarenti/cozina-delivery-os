"use client"

import {
  ClipboardList,
  Handshake,
  LayoutDashboard,
  ListChecks,
  PiggyBank,
  Store,
  Trophy,
  UsersRound,
} from "lucide-react"

import type { CoachStep } from "@/components/onboarding/coach-tour"

/**
 * Os tours "Como funciona" da seção Carteira.
 *
 * Num arquivo só porque as oito telas contam UMA história e o texto de cada
 * uma precisa saber o que a anterior disse — a loja é vendida (Comercial),
 * alinhada (Onboarding), entregue a um gestor (Gestores), trabalhada
 * (Atendimentos) e cobrada (Financeiro da agência). Espalhar os textos pelas
 * telas garantiria que um dia um deles descrevesse um fluxo que os outros
 * não descrevem mais.
 *
 * `selector` que não existe na tela não quebra: o balão centraliza. É o que
 * permite usar o mesmo passo quando um bloco só aparece com dado.
 */

/** O painel inteiro — vive na Visão, que é a porta de entrada. */
export const TOUR_CARTEIRA: CoachStep[] = [
  {
    selector: '[data-tour="menu-carteira"]',
    title: "O painel da Carteira",
    body:
      "Estas oito telas acompanham a loja do dia em que ela é vendida até a mensalidade cair na conta. Cada uma responde UMA pergunta, e elas se ligam em ordem — este tour percorre essa ordem.",
    icon: <LayoutDashboard className="size-5" />,
  },
  {
    selector: '[data-tour="menu-carteira"]',
    title: "1. Comercial vende",
    body:
      "Em Comercial você vê quem fechou quanto de mensalidade no mês, com pódio e ranking. A venda em si (vendedor, data e valor) é registrada na tela de Onboarding, no cartão da loja.",
    icon: <Trophy className="size-5" />,
  },
  {
    selector: '[data-tour="menu-carteira"]',
    title: "2. Onboarding alinha",
    body:
      "Um quadro de colunas que você mesmo cria. A loja entra vendida e caminha até a coluna marcada como final. Enquanto ela estiver aqui, o cliente já paga e ainda não é atendido — por isso o cartão fica âmbar depois de 15 dias.",
    icon: <Handshake className="size-5" />,
  },
  {
    selector: '[data-tour="menu-carteira"]',
    title: "3. Gestor recebe",
    body:
      "Concluído o onboarding, a loja é encaminhada a um gestor na aba Semana dela. A tela de Gestores ranqueia cada carteira por faturamento e mostra quantas semanas ficaram sem comentário — o que mede o trabalho, não só o resultado.",
    icon: <UsersRound className="size-5" />,
  },
  {
    selector: '[data-tour="menu-carteira"]',
    title: "4. A operação do dia a dia",
    body:
      "Lojas lista a carteira por etapa e Atendimentos guarda cada passo feito em cada loja — sem apagar, para quando o lojista perguntar o que foi feito em julho.",
    icon: <ClipboardList className="size-5" />,
  },
  {
    selector: '[data-tour="visao-agencia"]',
    title: "5. E o dinheiro da agência",
    body:
      "Esta faixa é o SEU dinheiro, não o do lojista: mensalidade recorrente, o que entrou, o que atrasou e o que sobrou depois das despesas. Os lançamentos ficam em Financeiro da agência.",
    icon: <PiggyBank className="size-5" />,
  },
  {
    selector: '[data-tour="visao-carteira"]',
    title: "A carteira que você administra",
    body:
      "Aqui é o dinheiro dos clientes, sempre comparado com o período anterior de mesmo tamanho. Número sem comparação não diz nada: R$ 1 milhão é bom ou ruim?",
  },
  {
    selector: '[data-tour="visao-concentracao"]',
    title: "Concentração — a pergunta de risco",
    body:
      "Quanto do faturamento depende das cinco maiores lojas. Acima de 60% aparece o selo “risco”: se a maior sair, o tombo é grande. É a conta que ninguém faz até acontecer.",
  },
  {
    selector: '[data-tour="visao-atencao"]',
    title: "Precisa de atenção",
    body:
      "Lojas que caíram mais de 15% ou pararam de vender, ordenadas pela perda EM REAIS — uma queda de 16% numa loja grande dói mais que 40% numa pequena. Clique para abrir a loja.",
  },
]

export const TOUR_LOJAS: CoachStep[] = [
  {
    selector: '[data-tour="lojas-filtros"]',
    title: "Achar a loja",
    body:
      "A busca aceita nome e código, sem acento — “acai” encontra “Açaí”. Os filtros ao lado recortam por gestor, situação e plataforma.",
    icon: <ListChecks className="size-5" />,
  },
  {
    selector: '[data-tour="lojas-categorias"]',
    title: "Agrupado por etapa",
    body:
      "Lojas Novas ainda estão no fluxo de entrada (checklist e cardápio); Ativas já estão em gestão. A loja muda de grupo sozinha quando é encaminhada.",
  },
  {
    selector: '[data-tour="lojas-cartao"]',
    title: "O que o cartão diz",
    body:
      "Gestor, tempo de casa, promessa feita na venda e a média dos últimos 3 meses. Quando aparece “sem dado importado” não é R$ 0,00: é que a loja ainda não trouxe dado — não vendeu e não sabemos são coisas diferentes.",
  },
]

export const TOUR_GESTORES: CoachStep[] = [
  {
    selector: '[data-tour="gestores-kpis"]',
    title: "A carteira inteira primeiro",
    body:
      "Quanto a carteira toda fez no período, quantos gestores existem e quantas semanas estão sem comentário. Gestor ativo sem nenhuma loja acende em âmbar — ele existe na folha e não aparece em ranking nenhum.",
    icon: <UsersRound className="size-5" />,
  },
  {
    selector: '[data-tour="gestores-comparativo"]',
    title: "Comparativo e pódio",
    body:
      "As barras são proporcionais ao PRIMEIRO colocado, não ao total: com seis gestores, fatias do total viram tocos e deixam de comparar.",
  },
  {
    selector: '[data-tour="gestores-canceladas"]',
    title: "Incluir canceladas",
    body:
      "Ligado, o faturamento é a cesta que passou pelo balcão — a mesma régua do portal do iFood. Desligado, tira a perda por cancelamento, que só o iFood informa; o número das outras plataformas continua inteiro.",
  },
  {
    selector: '[data-tour="gestores-lista"]',
    title: "Atribuir lojas",
    body:
      "Abra “ver carteira” em qualquer gestor para adicionar ou tirar loja. Uma loja tem um gestor por vez, e loja sem gestor não entra em ranking nenhum.",
  },
]

export const TOUR_ONBOARDING: CoachStep[] = [
  {
    selector: '[data-tour="onb-acoes"]',
    title: "O quadro é seu",
    body:
      "As colunas são cadastro, não código: crie, renomeie, reordene e apague as etapas do SEU processo. Apagar uma coluna nunca apaga loja — elas voltam para “Sem etapa”.",
    icon: <Handshake className="size-5" />,
  },
  {
    selector: '[data-tour="onb-quadro"]',
    title: "Mover a loja",
    body:
      "Arraste o cartão entre as colunas, ou use o seletor dentro dele — o seletor existe porque arrastar não funciona no teclado nem no celular.",
  },
  {
    selector: '[data-tour="onb-quadro"]',
    title: "A ficha",
    body:
      "Clique no cartão para abrir a ficha: quem vendeu, por quanto, quem alinha, data da reunião e o link. “Encaminhar para gestor” só libera quando o checklist, o cardápio e o onboarding estiverem concluídos.",
  },
  {
    selector: '[data-tour="onb-quadro"]',
    title: "Uma coluna significa FIM",
    body:
      "Marque uma etapa como final em “Editar colunas”. É ela que diz que o onboarding acabou — e é por isso que ela é declarada, não deduzida da ordem.",
  },
]

export const TOUR_ATENDIMENTOS: CoachStep[] = [
  {
    selector: '[data-tour="at-abrir"]',
    title: "Registrar o que foi feito",
    body:
      "Abra um atendimento escolhendo a loja e o tipo (cardápio, promoção, contato…). O título é o que está sendo feito; os passos vêm depois.",
    icon: <ClipboardList className="size-5" />,
  },
  {
    selector: '[data-tour="at-lista"]',
    title: "O histórico não se apaga",
    body:
      "Cada passo fica gravado com autor e data, e não pode ser editado. Errou? Escreva um passo novo corrigindo. É isso que faz o registro valer quando o lojista pergunta o que foi feito três meses atrás.",
  },
  {
    selector: '[data-tour="at-lista"]',
    title: "Resolver e reabrir",
    body:
      "Resolver só carimba uma data — o histórico continua inteiro, e reabrir devolve o atendimento à lista sem perder nada. O contador aparece no cartão da loja em Lojas.",
  },
]

export const TOUR_COMERCIAL: CoachStep[] = [
  {
    selector: '[data-tour="com-kpis"]',
    title: "Aqui “faturamento” é mensalidade",
    body:
      "Todo valor desta tela é o que a AGÊNCIA passa a cobrar, não o que a loja vende. A loja fatura R$ 250 mil e paga R$ 990 — se as duas palavras fossem iguais, um dia alguém somaria.",
    icon: <Trophy className="size-5" />,
  },
  {
    selector: '[data-tour="com-ranking"]',
    title: "Pódio e ranking",
    body:
      "O ticket médio divide só pelas lojas com mensalidade preenchida, e a linha avisa quantas ficaram de fora — senão falta de cadastro passaria por venda menor.",
  },
  {
    selector: '[data-tour="com-evolucao"]',
    title: "De onde vêm os números",
    body:
      "Vendedor, data da venda e mensalidade são preenchidos na ficha da loja, em Onboarding. Sem eles, esta tela fica vazia — não é erro, é cadastro faltando.",
  },
]

export const TOUR_FINANCEIRO: CoachStep[] = [
  {
    selector: '[data-tour="fin-kpis"]',
    title: "Este não é o Financeiro das lojas",
    body:
      "O módulo Financeiro do menu responde “quanto sobrou pra LOJA depois das taxas da plataforma”. Esta tela responde “quanto sobrou pra AGÊNCIA depois das despesas dela”.",
    icon: <PiggyBank className="size-5" />,
  },
  {
    selector: '[data-tour="fin-kpis"]',
    title: "Projetado x realizado",
    body:
      "O projetado sai da mensalidade do cadastro; o recebido sai das cobranças lançadas. São coisas separadas de propósito: reconstruir um do outro dá um número que bate quase sempre e mente justamente nos meses com desconto ou atraso.",
  },
  {
    selector: '[data-tour="fin-listas"]',
    title: "Lançar e dar baixa",
    body:
      "Cobrança paga depois do vencimento conta como PAGA, não como atrasada. E toda baixa tem “desfazer” — baixa errada sem volta obriga a mexer no banco.",
  },
  {
    selector: '[data-tour="fin-sobra"]',
    title: "A sobra",
    body:
      "Recebido menos despesas PAGAS: só dinheiro que se moveu. Com o previsto, seria uma sobra que existe na planilha e não na conta.",
  },
]

export const TOUR_SEMANA: CoachStep[] = [
  {
    selector: '[data-tour="semana-fluxo"]',
    title: "A loja na carteira",
    body:
      "Gestor, data de entrada e tempo em gestão. Em loja nova aparecem as três etapas de entrada: checklist, cardápio e o encaminhamento para o gestor — que só libera com as duas primeiras feitas.",
    icon: <Store className="size-5" />,
  },
  {
    selector: '[data-tour="semana-grafico"]',
    title: "O ciclo semanal",
    body:
      "A semana vai de segunda a domingo e o relatório é entregue na quarta seguinte. O faturamento é calculado do que já entrou — você não digita número, escreve o comentário.",
  },
]
