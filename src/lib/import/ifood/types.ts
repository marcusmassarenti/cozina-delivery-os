/**
 * Tipos comuns pros parsers de relatórios do iFood.
 */

export type IfoodReportType =
  | "cardapio"
  | "financeiro"
  | "avaliacoes"
  | "pedidos" // relatório de pedidos (forma de pagamento / VR)
  | "vendas" // resumo de vendas (sem dado novo)
  | "qualidade" // "Qualidade da operação" (tempo online, chamados, ranqueamento…)
  | "promocoes" // "Promoções" (investimento + ROI por campanha)
  | "super" // "Super restaurante" (nível + plano de ação + sentimento)
  | "negociacoes" // "Negociações" (cancelamentos evitados + motivos + reembolsos)
  | "cancelamentos" // futuro
  | "unknown"

export type ParsedPeriod = {
  /** "27/05/2026" ou "21/05/2026 - 27/05/2026" — texto bruto */
  raw: string
  /** Data inicial */
  start: Date
  /** Data final (igual a start se for 1 dia só) */
  end: Date
  /** true se o período é 1 dia só */
  isDaily: boolean
}

// ─── Cardápio ────────────────────────────────────────────────────────

export type ParsedFunnel = {
  visitas: number
  visualizacoes: number
  sacola: number
  revisao: number
  concluidos: number
  conversaoPct: number | null
  visitasAnterior: number | null
  visualizacoesAnterior: number | null
  sacolaAnterior: number | null
  revisaoAnterior: number | null
  concluidosAnterior: number | null
  conversaoPctAnterior: number | null
}

export type ParsedItem = {
  categoria: string | null
  nomeItem: string
  visitas: number
  pedidos: number
  conversaoPct: number | null
  qtdVendida: number
  qtdComPromocao: number
  pedidosComPromocao: number
  valorTotal: number
}

export type ParsedComplemento = {
  classificacao: string | null
  nomeComplemento: string
  lojas: number | null
  pedidos: number
  qtdVendida: number
  valorTotal: number
}

export type ParsedCardapio = {
  reportType: "cardapio"
  period: ParsedPeriod
  /** true → 1 loja, vai pra ifood_daily_funnel/items/complementos.
   *  false → multi-loja agregado do período, vai pra ifood_cardapio_periodo. */
  isDaily: boolean
  /** Quando isDaily — campos da única loja (compatibilidade) */
  storeId: string
  storeName: string | null
  funnel: ParsedFunnel
  items: ParsedItem[]
  complementos: ParsedComplemento[]
  /** Quando NÃO é diário — funil POR LOJA da rede inteira */
  porLoja: Array<{
    storeId: string
    storeName: string | null
    funnel: ParsedFunnel
  }>
}

// ─── Financeiro ──────────────────────────────────────────────────────

export type ParsedFinanceiroLancamento = {
  competencia: string // '2026-05'
  refYear: number
  refMonth: number
  dataFatoGerador: Date | null
  fatoGerador: string | null
  tipoLancamento: string | null
  descricaoLancamento: string | null
  valor: number
  baseCalculo: number | null
  percentualTaxa: number | null
  valorTransacao: number | null
  valorCestaInicial: number | null
  valorCestaFinal: number | null
  pedidoAssociadoIfood: string | null
  pedidoAssociadoIfoodCurto: string | null
  pedidoAssociadoExterno: string | null
  motivoCancelamento: string | null
  descricaoOcorrencia: string | null
  dataCriacaoPedido: Date | null
  dataRepasseEsperada: Date | null
  dataFaturamento: Date | null
  dataApuracaoInicio: Date | null
  dataApuracaoFim: Date | null
  responsavelTransacao: string | null
  canalVendas: string | null
  impactoNoRepasse: boolean | null
  parcelaPagamento: string | null
  idSaldo: string | null
}

export type ParsedFinanceiro = {
  reportType: "financeiro"
  storeId: string
  /** CNPJ da loja (vem em todas as linhas, pegamos da primeira) */
  storeCnpj: string | null
  competencia: string
  refYear: number
  refMonth: number
  lancamentos: ParsedFinanceiroLancamento[]
  /** Totais pré-calculados pra preview rápido */
  totals: {
    pedidosUnicos: number
    bruto: number
    comissaoIfood: number
    taxaEntrega: number
    taxaTransacao: number
    taxaServicoCliente: number
    promocaoLoja: number
    promocaoIfood: number
    pacoteAnuncios: number
    cancelamentoTotalQtd: number
    cancelamentoParcialQtd: number
    /** Cesta dos pedidos com cancelamento total (o portal soma no "Valor das
     * vendas"; bruto total exibido = bruto + isto). */
    cancelCestaValor: number
    liquido: number
  }
}

// ─── Avaliações ──────────────────────────────────────────────────────

export type ParsedAvaliacao = {
  pedidoIdCurto: string | null
  pedidoIdLongo: string | null
  dataPedido: Date | null
  statusPedido: string | null
  servicoLogistico: string | null
  dataAvaliacao: Date
  nota: number // 1-5
  comentario: string | null
  statusAvaliacao: string | null
  tagsPositivas: string[]
  tagsNegativas: string[]
}

export type ParsedAvaliacoes = {
  reportType: "avaliacoes"
  /** Agrupado por loja — o XLSX do iFood vem com todas as lojas da rede */
  porLoja: Array<{
    storeId: string
    storeName: string | null
    avaliacoes: ParsedAvaliacao[]
  }>
}

// ─── Pedidos (forma de pagamento / VR) ───────────────────────────────

export type ParsedPedidoIfood = {
  pedidoId: string
  pedidoIdCurto: string | null
  horario: Date | null
  turno: string | null
  statusFinal: string | null
  valorItens: number | null
  totalPagoCliente: number | null
  taxaEntregaCliente: number | null
  incentivoIfood: number | null
  incentivoLoja: number | null
  incentivoRede: number | null
  taxaServico: number | null
  taxasComissoes: number | null
  valorLiquido: number | null
  formaPagamento: string | null
  /** Grupo normalizado: Crédito/PIX/Carteira/Débito/Vale-Refeição/Outros */
  formaGrupo: string
  /** Quando VR: SODEXO/ALELO/VR/TICKET/IFOOD/OUTROS. Senão null. */
  bandeiraVr: string | null
  tipoEntrega: string | null
  produtoLogistico: string | null
  canalVenda: string | null
}

export type ParsedPedidos = {
  reportType: "pedidos"
  /** Agrupado por loja (1 arquivo costuma ser de 1 loja, mas é defensivo) */
  porLoja: Array<{
    storeId: string
    storeName: string | null
    pedidos: ParsedPedidoIfood[]
  }>
}

// ─── Resultado unificado ─────────────────────────────────────────────

/** Loja extraída do Relatório de Vendas (resumo agregado). */
export type ParsedVendasStore = {
  storeId: string
  storeName: string
  city: string | null
  /** Total de pedidos (Entrega + Retirada somados). */
  pedidos: number
  /** Valor total de vendas (R$). */
  valor: number
}

/**
 * Relatório de Vendas (resumo) — sem dado novo, é só agregação visual.
 * Mas vem com TODAS as lojas da rede; expomos a lista pra operador
 * conferir cobertura.
 */
export type ParsedVendasResumo = {
  reportType: "vendas"
  /** Ex.: "01/06/2026 - 16/06/2026" */
  period: string | null
  /** Lojas detectadas, ordenadas por valor de venda (maior → menor). */
  stores: ParsedVendasStore[]
}

// ─── Qualidade da operação ───────────────────────────────────────────

/** Indicadores de operação de UMA loja, já agregados do período. */
export type ParsedQualidadeLoja = {
  storeId: string
  storeName: string | null
  periodStart: string // YYYY-MM-DD
  periodEnd: string // YYYY-MM-DD
  periodLabel: string // "09/06/2026 - 08/07/2026"
  nivelSuper: string | null
  pedidosTotais: number
  cancelamentoValor: number
  negociacoes: number
  pctNegociacoes: number | null
  pctRespostasNegociacoes: number | null
  cancelamentos: number
  pctCancelamento: number | null
  pedidosAtrasados: number
  pctAtrasados: number | null
  tempoMedioAtrasoMin: number | null
  tempoMedioPreparoMin: number | null
  pctEntregadorAguardo5: number | null
  pctEntregadorAguardo15: number | null
  qtdAvaliacoes: number
  mediaAvaliacoes: number | null
  pctTempoOnline: number | null
  mediaTempoOnlineDia: number | null
  tempoPausasMin: number
  varCancelamentos: number | null
  varChamados: number | null
  varAvaliacoes: number | null
  varTempoOnline: number | null
  topMotivosCancelamento: string | null
  topMotivosChamados: string | null
}

export type ParsedQualidade = {
  reportType: "qualidade"
  /** 1 linha por (loja, dia) no XLSX → agregado por loja aqui. */
  porLoja: ParsedQualidadeLoja[]
}

// ─── Promoções ───────────────────────────────────────────────────────

/** Promoções de UMA loja, já somadas do período (1 linha/campanha no XLSX). */
export type ParsedPromocoesLoja = {
  storeId: string
  storeName: string | null
  periodStart: string // YYYY-MM-DD
  periodEnd: string // YYYY-MM-DD
  periodLabel: string
  nCampanhas: number
  pedidos: number // pode duplicar em combos
  valorItens: number
  investimentoTotal: number
  investimentoLojas: number
  investimentoRede: number
  investimentoIfood: number
  investimentoIndustria: number
  roasLojas: number | null // valor_itens / investimento_lojas
}

export type ParsedPromocoes = {
  reportType: "promocoes"
  porLoja: ParsedPromocoesLoja[]
}

// ─── Super restaurante ───────────────────────────────────────────────

export type ParsedSuperLoja = {
  storeId: string
  storeName: string | null
  periodStart: string // YYYY-MM-DD
  periodEnd: string // YYYY-MM-DD
  periodLabel: string
  status: string | null
  eSuper: boolean | null
  eElegivel: boolean | null
  totalPedidos: number
  pedidosAvaliados: number
  mediaAvaliacoes: number | null
  pctCancelamento: number | null
  pctChamados: number | null
  totalChamados: number
  chamadosAtraso: number
  chamadosPosEntrega: number
  chamadosItemErrado: number
  planoDeAcao: string | null
  /** { dimensão: contagem } — ex.: { "bem temperada": 37 } */
  tagsPos: Record<string, number>
  tagsNeg: Record<string, number>
}

export type ParsedSuper = {
  reportType: "super"
  porLoja: ParsedSuperLoja[]
}

// ─── Negociações ─────────────────────────────────────────────────────

export type ParsedNegociacoesLoja = {
  storeId: string
  storeName: string | null
  periodStart: string // YYYY-MM-DD
  periodEnd: string // YYYY-MM-DD
  periodLabel: string
  totalNegociacoes: number
  cancelamentosEvitados: number
  valorEvitado: number
  reembolsoTotal: number
  cupomTotal: number
  respondidas: number
  pctRespondidas: number | null
  impactouSuper: number
  topMotivos: Record<string, number>
}

export type ParsedNegociacoes = {
  reportType: "negociacoes"
  porLoja: ParsedNegociacoesLoja[]
}

// ─── Resultado unificado ─────────────────────────────────────────────

export type ParseResult =
  | ParsedCardapio
  | ParsedFinanceiro
  | ParsedAvaliacoes
  | ParsedPedidos
  | ParsedVendasResumo
  | ParsedQualidade
  | ParsedPromocoes
  | ParsedSuper
  | ParsedNegociacoes
  | { reportType: "unknown"; error: string }
