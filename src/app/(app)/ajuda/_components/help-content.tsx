import { Cable, Compass, Store, UserCog, Wallet } from "lucide-react"

import type { HelpSection } from "./help-center"

/**
 * Conteúdo da Central de Ajuda. Baseado no que cada tela realmente faz.
 * `tourParam` liga o botão "Ver o passo a passo" ao tour guiado da tela.
 */
export const HELP_SECTIONS: HelpSection[] = [
  {
    label: "Começando",
    icon: Compass,
    items: [
      {
        title: "Como o sistema funciona (visão geral)",
        oque: "O Delivery OS junta o que as suas lojas vendem no iFood, 99 Food e Keeta e transforma em relatórios, DRE e alertas. Você sobe os relatórios das plataformas (ou conecta), e o sistema consolida tudo por loja e pra rede inteira.",
        como: [
          "1) Personalize a conta (logo/nome). 2) Cadastre suas lojas. 3) Faça a primeira importação (sugestão: iFood).",
          "Depois disso, Dashboard, Relatórios e DRE já mostram seus números.",
        ],
      },
      {
        title: "Primeiros passos (onboarding)",
        oque: "No Dashboard aparece um cartão 'Primeiros passos' com o checklist inicial. Cada tela importante tem um botão 'Como funciona' que abre um passo a passo guiado por cima da própria tela.",
        como: [
          "Procure o botão 'Como funciona' no topo das telas pra rever o tour quando quiser.",
        ],
        href: "/",
        tourParam: "guia",
      },
      {
        title: "Dashboard",
        oque: "Visão da rede no período escolhido: faturamento, margem, comparativos e os principais indicadores consolidados de todas as lojas.",
        como: [
          "Use o seletor de período no topo pra mudar o intervalo.",
          "É a tela inicial — o resumo de tudo.",
        ],
        href: "/",
        tourParam: "guia",
      },
    ],
  },
  {
    label: "Operação",
    icon: Store,
    items: [
      {
        title: "Unidades",
        oque: "Lista das suas lojas. Clicando numa unidade você vê o detalhe do mês com abas: Financeiro (DRE da loja + custos), Cardápio e Avaliações.",
        como: [
          "Na aba Financeiro você lança os Custos da loja (CMV e operacionais) por categoria — a soma entra na DRE.",
          "Cadastre uma loja nova em 'Nova Unidade'.",
        ],
        href: "/unidades",
        tourParam: "guia",
      },
      {
        title: "Custos da loja (CMV e operacionais)",
        oque: "Dentro da unidade (aba Financeiro), cada loja tem categorias de custo: CMV (mercadoria: bebidas, descartáveis…) e operacionais (aluguel, folha…). Você cadastra as categorias uma vez por loja e preenche o valor a cada mês.",
        como: [
          "Fechado, mostra o total; clicando, abre as categorias pra editar.",
          "A soma alimenta a DRE — CMV e Custos operacionais aparecem lá, levando ao Resultado.",
        ],
        href: "/unidades",
      },
      {
        title: "Pedidos",
        oque: "Acompanhamento dos pedidos das lojas no período — volume e dados por loja, pra você ver movimento e cancelamentos.",
        href: "/pedidos",
      },
      {
        title: "Avaliações",
        oque: "As avaliações dos clientes (iFood/99/Keeta), por loja ou da rede toda. Ajuda a acompanhar a satisfação e responder onde precisa.",
        href: "/avaliacoes",
      },
    ],
  },
  {
    label: "Financeiro",
    icon: Wallet,
    items: [
      {
        title: "Hub de Relatórios",
        oque: "Relatórios da rede por categoria. Você escolhe lojas, plataformas e período dentro de cada relatório.",
        href: "/relatorios",
      },
      {
        title: "Relatório Diário",
        oque: "Acompanhamento dia a dia da rede — o desempenho por data no período escolhido.",
        href: "/relatorio-diario",
      },
      {
        title: "DRE Grupo",
        oque: "DRE consolidado da rede no período: faturamento bruto, taxas das plataformas, CMV, custos operacionais e o resultado — com as lojas somadas.",
        como: [
          "Resultado negativo aparece em vermelho.",
          "Dá pra exportar a DRE em PDF pelo botão no card.",
        ],
        href: "/financeiro",
      },
      {
        title: "Fluxo de Caixa",
        oque: "Visão de entradas e saídas de caixa da operação, pra acompanhar o dinheiro no tempo.",
        href: "/caixa",
      },
    ],
  },
  {
    label: "Integrações",
    icon: Cable,
    items: [
      {
        title: "Importação de relatórios",
        oque: "Sobe os XLSX do iFood (Cardápio / Financeiro / Avaliações), do 99 Food (Dados da loja / item / pedido) ou do Keeta (Loja diária / Itens / Pedidos) e o sistema converte em lançamentos.",
        como: [
          "Ao apertar Importar, um passo guiado mostra onde clicar.",
          "Loja nova aparece com botão 'Vincular' — vincule à sua unidade e o sistema passa a importar por ela.",
        ],
        href: "/importacao",
        tourParam: "guia",
      },
      {
        title: "Conexões",
        oque: "Integrações de entrada e saída do sistema (APIs das plataformas e do ERP). É onde as conexões automáticas ficam configuradas.",
        href: "/conexoes",
      },
      {
        title: "Ficha Técnica ERP",
        oque: "Converte o que as lojas vendem (itens) na demanda de insumos do ERP, no período escolhido — liga a venda ao consumo de matéria-prima.",
        href: "/ficha-tecnica",
      },
    ],
  },
  {
    label: "Minha conta",
    icon: UserCog,
    items: [
      {
        title: "Informações (dados cadastrais)",
        oque: "Os dados do titular (PF/PJ, CPF/CNPJ) e o endereço que vão na cobrança e na Nota Fiscal. Ficam salvos no sistema e sincronizam com o gateway de cobrança ao salvar.",
        como: ["Preencha o CEP que ele busca o endereço automático."],
        href: "/minha-conta/informacoes",
      },
      {
        title: "Personalização",
        oque: "Deixe o sistema com a cara da sua empresa — logo, nome e imagem de login.",
        href: "/minha-conta/personalizacao",
      },
      {
        title: "Assinatura",
        oque: "Seu plano atual: valor, próxima cobrança, forma de pagamento, histórico e cancelamento. Acompanhe e controle seus gastos aqui.",
        href: "/minha-conta/assinatura",
      },
      {
        title: "Usuários",
        oque: "Cadastre, gerencie e atribua permissões aos usuários do sistema (sua equipe e franqueados).",
        href: "/minha-conta/usuarios",
      },
      {
        title: "Permissões",
        oque: "Define o que cada perfil pode ver e fazer em cada módulo do sistema.",
        href: "/minha-conta/permissoes",
      },
    ],
  },
]
