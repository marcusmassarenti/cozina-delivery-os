/**
 * Tipos comuns pros parsers de relatórios do 99 Food.
 */

export type NinefoodReportType =
  | "dados_loja" // Financeiro diário agregado
  | "dados_item" // Cardápio diário (1 linha por item por dia)
  | "dados_pedido" // Lista de pedidos (avaliações, cliente, logística, taxas)
  | "unknown"

// ─── "Dados da loja" (financeiro agregado por dia) ───────────────────

export type ParsedNinefoodLojaDia = {
  storeId: string
  storeName: string | null
  cidade: string | null
  data: Date
  // Vendas
  pedidos: number
  bruto: number
  liquido: number
  ticketMedio: number
  // Taxas
  comissaoRs: number
  taxaCanalPagamentoRs: number
  promocoesRs: number
  // Qualidade (podem vir null)
  avaliacaoLoja: number | null
  taxaAceitacaoPct: number | null
  cancelamentosQtd: number | null
  tempoMedioPreparoMin: number | null
}

export type ParsedNinefoodDadosLoja = {
  reportType: "dados_loja"
  /** Dados agrupados por loja (XLSX pode trazer N lojas, N dias). */
  porLoja: Array<{
    storeId: string
    storeName: string | null
    dias: ParsedNinefoodLojaDia[]
  }>
}

// ─── "Dados do item" (cardápio diário) ───────────────────────────────

export type ParsedNinefoodItemDia = {
  data: Date
  nomeItem: string
  receita: number
  qtdVendida: number
  precoMedio: number
  alcance: number
  addCarrinho: number
  conversaoPct: number | null
}

export type ParsedNinefoodDadosItem = {
  reportType: "dados_item"
  porLoja: Array<{
    storeId: string
    storeName: string | null
    cidade: string | null
    itens: ParsedNinefoodItemDia[]
  }>
}

// ─── "Dados do pedido" (1 linha = 1 pedido) ─────────────────────────

export type ParsedNinefoodPedido = {
  pedidoId: string
  data: Date // YYYYMMDD parseado

  horarioPedido: Date | null
  horarioConclusao: Date | null
  horarioCancelamento: Date | null
  tempoPosVenda: string | null

  // Valores
  receitaVendas: number | null
  precoOriginalItem: number | null
  receitaRealLoja: number | null
  despesasOfertas: number | null
  despesasComissao: number | null
  taxaCanalPagamento: number | null
  recompensasPlataforma: number | null
  gorjeta: number | null
  contagemItem: number | null
  taxaEntregaOriginal: number | null
  taxaEntregaNovosClientes: number | null

  // Cliente
  clienteId: string | null
  qtdPedidosAnterioresCliente: number | null

  // Cancelamento
  valorReembolso: number | null
  custoLojaOfertaEntregaGratis: number | null
  custosLogisticos: number | null
  parteResponsavelCancelamento: string | null
  motivosCancelamentoComerciante: string | null

  // Operação
  tempoPreparoMin: number | null
  clicouProntoRetirada: boolean | null
  formaPagamento: string | null
  metodoEntrega: string | null
  preparacaoAtrasada: boolean | null

  // Tempos (segundos)
  tempoAceitacaoSeg: number | null
  tempoFinalizacaoSeg: number | null
  duracaoEntregaSeg: number | null
  tempoConfirmacaoEntregadorSeg: number | null
  tempoEntregadorChegadaLojaSeg: number | null
  tempoPedidoProntoChegadaSeg: number | null
  tempoEsperaRetiradaSeg: number | null
  tempoEntregadorClienteSeg: number | null
  tempoEsperaClienteSeg: number | null

  // Avaliação
  dataAvaliacao: Date | null
  nivelAvaliacao: number | null // 1..5
  conteudoAvaliacao: string | null
  tagAvaliacao: string | null
}

export type ParsedNinefoodDadosPedido = {
  reportType: "dados_pedido"
  /** Agrupado por loja (XLSX pode vir multi-loja igual avaliações iFood). */
  porLoja: Array<{
    storeId: string
    storeName: string | null
    cidade: string | null
    pedidos: ParsedNinefoodPedido[]
  }>
}

// ─── Resultado unificado ─────────────────────────────────────────────

export type NinefoodParseResult =
  | ParsedNinefoodDadosLoja
  | ParsedNinefoodDadosItem
  | ParsedNinefoodDadosPedido
  | { reportType: "unknown"; error: string }
