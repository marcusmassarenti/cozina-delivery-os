/**
 * Tipos comuns pros parsers de relatórios do iFood.
 */

export type IfoodReportType =
  | "cardapio"
  | "financeiro"
  | "avaliacoes"
  | "pedidos" // relatório de pedidos (forma de pagamento / VR)
  | "vendas" // futuro
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

export type ParseResult =
  | ParsedCardapio
  | ParsedFinanceiro
  | ParsedAvaliacoes
  | ParsedPedidos
  | { reportType: "unknown"; error: string }
