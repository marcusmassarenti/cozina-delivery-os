/**
 * Tipos dos parsers de relatórios do Keeta.
 *
 * Keeta exporta 1 sheet ("0") com `!ref` quebrado (declara só a coluna A,
 * mas há ~30 colunas). O detect recalcula o range real antes de ler.
 */

export type KeetaReportType =
  | "loja" // "Loja diária" — agregado operacional + funil
  | "item" // "Itens diário" — 1 linha por item por dia
  | "pedido" // "Pedidos" — 1 linha por pedido (financeiro + cancel + avaliação)
  | "pedido_recente" // "Pedidos recentes" — 1 linha por pedido (promoção Keeta×loja + taxas granulares + campanha)
  | "promocao" // "Dados da promoção" — 1 linha por campanha × loja × dia (ROI da promoção)
  | "unknown"

// ─── Loja diária ─────────────────────────────────────────────────────

export type ParsedKeetaLojaDia = {
  data: Date
  vendasItens: number // bruto
  pedidosValidos: number
  totalPedidos: number
  pedidosCancelados: number
  valorMedioPedido: number
  alcanceClientes: number | null
  visitantes: number | null
  addCarrinho: number | null
  clientesFinalizados: number | null
  taxaConvExposicaoVisita: number | null
  taxaConvVisitaCarrinho: number | null
  vendasPromocao: number | null
  numCampanhas: number | null
  despesaUnidade: number | null
  tempoAbertoH: number | null
  tempoPreparoMin: number | null
}

export type ParsedKeetaLoja = {
  reportType: "loja"
  porLoja: Array<{
    storeId: string
    storeName: string | null
    dias: ParsedKeetaLojaDia[]
  }>
}

// ─── Itens diário ────────────────────────────────────────────────────

export type ParsedKeetaItemDia = {
  data: Date
  itemId: string | null
  nomeItem: string
  qtdVendida: number
  precoMedio: number
  alcance: number | null
  addCarrinho: number | null
  carrinhoPct: number | null
}

export type ParsedKeetaItem = {
  reportType: "item"
  porLoja: Array<{
    storeId: string
    storeName: string | null
    itens: ParsedKeetaItemDia[]
  }>
}

// ─── Pedidos ─────────────────────────────────────────────────────────

export type ParsedKeetaPedido = {
  pedidoId: string
  data: Date
  tipoPedido: string | null
  horarioPedido: Date | null
  horarioConclusao: Date | null
  statusPedido: string | null
  tipoCancelamento: string | null
  motivoCancelamento: string | null

  ganhosLiquidos: number | null
  vendasItens: number | null
  outrosGanhos: number | null
  despesa: number | null
  despesasPlataforma: number | null
  comissao: number | null
  outrasDespesas: number | null
  taxaEntrega: number | null

  detalheItem: string | null
  tempoPreparoMin: number | null

  dataAvaliacao: Date | null
  pontuacaoAvaliacao: number | null // 1..5
  conteudoAvaliacao: string | null
  respostaAvaliacao: string | null
}

export type ParsedKeetaPedidos = {
  reportType: "pedido"
  porLoja: Array<{
    storeId: string
    storeName: string | null
    pedidos: ParsedKeetaPedido[]
  }>
}

// ─── Pedidos recentes ────────────────────────────────────────────────

export type ParsedKeetaPedidoRecente = {
  numeroPedido: string
  numeroPedidoCurto: string | null
  data: Date
  horarioPedido: Date | null
  horarioConclusao: Date | null
  horarioCancelamento: Date | null
  turno: string | null

  statusPedido: string | null
  tipoReembolso: string | null
  motivoCancelamento: string | null
  quemCancelou: string | null
  responsabilidade: string | null
  motivoDecisao: string | null

  itens: string | null
  tipoCampanha: string | null

  ganhos: number | null
  valorPagoCliente: number | null
  precoOriginal: number | null
  ressarcimentoPlataforma: number | null

  comissaoBasica: number | null
  taxaDistancia: number | null
  taxaSaqueAntecipado: number | null
  taxaPagamentoOnline: number | null
  diferencaPaga: number | null

  descontoKeeta: number | null
  promoKeeta: number | null
  promoLoja: number | null
}

export type ParsedKeetaPedidosRecentes = {
  reportType: "pedido_recente"
  porLoja: Array<{
    storeId: string
    storeName: string | null
    pedidos: ParsedKeetaPedidoRecente[]
  }>
}

// ─── Dados da promoção ───────────────────────────────────────────────

export type ParsedKeetaPromocaoLinha = {
  data: Date
  atoId: string
  regraDesconto: string | null
  pedidosCampanha: number | null
  pedidosValidos: number | null
  vendasPromoItens: number | null
  vendasItens: number | null
  despesaCampanha: number | null
  despesa: number | null
  despesaMediaCampanha: number | null
  despesaUnidade: number | null
}

export type ParsedKeetaPromocoes = {
  reportType: "promocao"
  porLoja: Array<{
    storeId: string
    storeName: string | null
    promocoes: ParsedKeetaPromocaoLinha[]
  }>
}

export type KeetaParseResult =
  | ParsedKeetaLoja
  | ParsedKeetaItem
  | ParsedKeetaPedidos
  | ParsedKeetaPedidosRecentes
  | ParsedKeetaPromocoes
  | { reportType: "unknown"; error: string }
