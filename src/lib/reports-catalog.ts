/**
 * Catálogo único dos relatórios das 3 plataformas (iFood / 99 Food / Keeta).
 *
 * Fonte da verdade pra: tela "Relatórios" em Minha conta (habilitar/desabilitar),
 * guia de importação, matriz de cobertura e a seção "não integrado" do
 * Diagnóstico. Cada relatório tem uma `key` estável usada em todo o app.
 *
 * `essential: true` = ligado por padrão numa operação nova. Os avançados
 * (diagnóstico) começam desligados pra não confundir quem só quer o básico.
 */

export type ReportPlatform = "ifood" | "99food" | "keeta"

export type ReportKey =
  | "ifood_financeiro"
  | "ifood_pedidos"
  | "ifood_cardapio"
  | "ifood_avaliacoes"
  | "ifood_qualidade"
  | "ifood_promocoes"
  | "ifood_super"
  | "ifood_negociacoes"
  | "99food_loja"
  | "99food_item"
  | "99food_pedido"
  | "keeta_loja"
  | "keeta_item"
  | "keeta_pedido"
  | "keeta_pedido_recente"
  | "keeta_promocao"
  | "keeta_fatura"

export type ReportDef = {
  key: ReportKey
  platform: ReportPlatform
  name: string
  /** O que o relatório É (1 frase). */
  whatIs: string
  /** Como ele AJUDA na operação (1 frase). */
  helps: string
  /** Ligado por padrão (operação nova). */
  essential: boolean
  /**
   * A API da plataforma traz este relatório sozinha?
   *
   * ⚠️ EXISTE PORQUE O E-MAIL DE CONEXÃO MENTIA. Ele fechava com "daqui pra
   * frente entra sozinho, todo dia, sem planilha — você não precisa fazer
   * mais nada", em qualquer plataforma. Não é verdade em nenhuma das duas:
   * no iFood a API traz financeiro, pedidos e avaliações, e deixa cardápio,
   * qualidade, promoções, Super e negociações de fora; na 99 ela traz
   * financeiro e cardápio, e não traz nota, aceitação nem tempo de preparo.
   *
   * O cliente que lê "não precisa fazer mais nada" e para de subir planilha
   * perde metade do sistema sem ser avisado — e a culpa parece nossa, com
   * razão.
   */
  viaApi: boolean
  /**
   * O que a API NÃO traz mesmo em relatório marcado como `viaApi`. Frase
   * curta, na voz do lojista, pra entrar no e-mail depois de "menos".
   */
  apiNaoCobre?: string
}

export const REPORTS_CATALOG: ReportDef[] = [
  // ─── iFood ───────────────────────────────────────────────────────
  {
    key: "ifood_financeiro",
    platform: "ifood",
    name: "Financeiro / Conciliação",
    whatIs: "A base financeira oficial: faturamento bruto/líquido, quebra de taxas e cancelamentos.",
    helps: "Fecha o quanto entrou de verdade e alimenta a DRE e o resultado da loja. É o coração do sistema.",
    essential: true,
    viaApi: true,
  },
  {
    key: "ifood_cardapio",
    platform: "ifood",
    name: "Cardápio",
    whatIs: "Funil de conversão (visitas → pedido), top itens vendidos e complementos.",
    helps: "Mostra onde você perde cliente no caminho e quais itens puxam a venda — base pra melhorar conversão.",
    essential: true,
    viaApi: false,
  },
  {
    key: "ifood_avaliacoes",
    platform: "ifood",
    name: "Avaliações",
    whatIs: "Notas e comentários dos clientes, com data e pedido.",
    helps: "Acompanha a reputação e revela os motivos de elogio e reclamação pra agir na cozinha.",
    essential: true,
    viaApi: true,
  },
  {
    key: "ifood_pedidos",
    platform: "ifood",
    name: "Pedidos (VR / pagamento)",
    whatIs: "Forma de pagamento por pedido e Vale-Refeição por bandeira.",
    helps: "Detalha como o cliente paga e quanto entra por VR — útil pra conciliar o caixa físico.",
    essential: true,
    viaApi: true,
  },
  {
    key: "ifood_qualidade",
    platform: "ifood",
    name: "Qualidade da operação",
    whatIs: "Tempo online, chamados, cancelamentos, tempo de preparo, atrasos e nível Super.",
    helps: "Os indicadores que o iFood usa pra te ranquear. Fora da meta = menos visibilidade e recompra.",
    essential: false,
    viaApi: false,
  },
  {
    key: "ifood_promocoes",
    platform: "ifood",
    name: "Promoções",
    whatIs: "Investimento e retorno (ROI) de cada campanha, por loja.",
    helps: "Diz quanto você gasta pra vender e quais campanhas dão retorno — pra cortar as de baixo ROAS.",
    essential: false,
    viaApi: false,
  },
  {
    key: "ifood_super",
    platform: "ifood",
    name: "Super Restaurante",
    whatIs: "Nível no programa Super, plano de ação do iFood e tags de sentimento das avaliações.",
    helps: "Mostra seu ranqueamento e o que o iFood recomenda ajustar pra subir de nível.",
    essential: false,
    viaApi: false,
  },
  {
    key: "ifood_negociacoes",
    platform: "ifood",
    name: "Negociações e chamados",
    whatIs: "Negociações com clientes: cancelamentos evitados, motivos, reembolsos e cupons.",
    helps: "Quanto você recupera negociando em vez de reembolsar — e os motivos que mais geram problema.",
    essential: false,
    viaApi: false,
  },

  // ─── 99 Food ─────────────────────────────────────────────────────
  {
    key: "99food_loja",
    platform: "99food",
    name: "Dados da loja",
    whatIs: "Faturamento, comissão, avaliação, taxa de aceitação e tempo de preparo.",
    helps: "A base financeira e operacional da 99 — o equivalente ao Financeiro do iFood.",
    essential: true,
    viaApi: true,
    apiNaoCobre: "a nota da loja, a taxa de aceitação e o tempo de preparo",
  },
  {
    key: "99food_item",
    platform: "99food",
    name: "Dados do item",
    whatIs: "Itens vendidos no período, com quantidade e valor.",
    helps: "Mostra o que mais vende na 99 pra ajustar cardápio e destaques.",
    essential: true,
    viaApi: false,
  },
  {
    key: "99food_pedido",
    platform: "99food",
    name: "Dados do pedido",
    whatIs: "Pedidos com forma de pagamento e detalhe operacional.",
    helps: "Detalhe pedido a pedido pra conciliar e entender o mix de pagamento.",
    essential: true,
    viaApi: true,
    apiNaoCobre: "os tempos de preparo e entrega, cliente novo × recorrente e a avaliação de cada pedido",
  },

  // ─── Keeta ───────────────────────────────────────────────────────
  {
    key: "keeta_loja",
    platform: "keeta",
    name: "Dados da loja",
    whatIs: "Agregado diário: faturamento, funil e indicadores operacionais.",
    helps: "A base financeira e de conversão da Keeta — o equivalente ao Financeiro + Cardápio.",
    essential: true,
    viaApi: false,
  },
  {
    key: "keeta_item",
    platform: "keeta",
    name: "Dados do item",
    whatIs: "Itens vendidos no período na Keeta.",
    helps: "O que mais vende na Keeta pra ajustar cardápio.",
    essential: true,
    viaApi: false,
  },
  {
    key: "keeta_pedido",
    platform: "keeta",
    name: "Pedidos",
    whatIs: "Pedidos com pagamento e operação do período.",
    helps: "Detalhe pedido a pedido pra conciliar o caixa.",
    essential: true,
    viaApi: false,
  },
  {
    key: "keeta_pedido_recente",
    platform: "keeta",
    name: "Pedidos recentes",
    whatIs: "Detalhe pedido a pedido: taxas granulares, subsídio Keeta×loja e campanha.",
    helps: "Abre o subsídio Keeta×loja e as taxas por pedido — base do ROI e do repasse real.",
    essential: true,
    viaApi: false,
  },
  {
    key: "keeta_promocao",
    platform: "keeta",
    name: "Promoções",
    whatIs: "Campanhas da Keeta com investimento e retorno (ROI).",
    helps: "Quanto rende cada promoção na Keeta pra decidir onde investir.",
    essential: true,
    viaApi: false,
  },
  {
    key: "keeta_fatura",
    platform: "keeta",
    name: "Fatura (repasse)",
    whatIs: "A fatura consolidada: repasse por loja e por dia, com o ciclo e a data de liquidação.",
    helps: "Mostra quanto e QUANDO cai o dinheiro de cada loja — o calendário de recebíveis.",
    essential: true,
    viaApi: false,
  },
]

export const PLATFORM_LABEL: Record<ReportPlatform, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
}

/** Keys ligadas por padrão (operação nova) — os essenciais. */
export const DEFAULT_ENABLED_REPORTS: ReportKey[] = REPORTS_CATALOG.filter(
  (r) => r.essential,
).map((r) => r.key)

export const ALL_REPORT_KEYS: ReportKey[] = REPORTS_CATALOG.map((r) => r.key)

export function reportsByPlatform(
  platform: ReportPlatform,
): ReportDef[] {
  return REPORTS_CATALOG.filter((r) => r.platform === platform)
}

/** Relatórios de uma plataforma que a API NÃO traz — continuam por planilha. */
export function relatoriosSoPorPlanilha(
  plataforma: ReportPlatform,
  habilitados?: Set<ReportKey>,
): ReportDef[] {
  return REPORTS_CATALOG.filter(
    (r) =>
      r.platform === plataforma &&
      !r.viaApi &&
      (!habilitados || habilitados.has(r.key)),
  )
}

/** Relatórios que a API traz, mas com buraco declarado. */
export function relatoriosComBuracoNaApi(
  plataforma: ReportPlatform,
  habilitados?: Set<ReportKey>,
): ReportDef[] {
  return REPORTS_CATALOG.filter(
    (r) =>
      r.platform === plataforma &&
      r.viaApi &&
      !!r.apiNaoCobre &&
      (!habilitados || habilitados.has(r.key)),
  )
}
