/**
 * Parser do relatório "Dados do pedido" do 99 Food.
 *
 * Cada linha = 1 pedido. 1 XLSX pode trazer N lojas × N pedidos.
 * Agrupamos por storeId. Equivalente ao Avaliações do iFood.
 *
 * Diferenças vs outros relatórios:
 *  - Data vem em formato YYYYMMDD ("20260527"), não ISO
 *  - Horários vêm "2026-05-27 22:39:00" (sem timezone)
 *  - Booleanos vêm "Sim" / "Não"
 *  - Avaliação pode vir vazia (nem todo pedido tem nota)
 */

import * as XLSX from "xlsx"
import { readHeader } from "./detect"
import type {
  ParsedNinefoodDadosPedido,
  ParsedNinefoodPedido,
} from "./types"
import {
  parseCompactDate,
  parseCompactDateMaybe,
  parseSimNao,
  parseTimestampMaybe,
  toNumberOrNull,
  toStoreId,
  toStringOrNull,
} from "./utils"

const REQUIRED_COLS = [
  "Data",
  "Nome do estabelecimento",
  "ID do loja",
  "ID do pedido",
  "Horário do pedido",
] as const

// Colunas opcionais — usamos só se vieram (Marcus escolhe métricas no painel)
const COLS = {
  cidade: "Cidade",
  horarioConclusao: "Horário da conclusão",
  horarioCancelamento: "Horário do cancelamento",
  tempoPosVenda: "Tempo de pós-venda",
  receitaVendas: "Receita de vendas",
  precoOriginalItem: "Preço original do item",
  receitaRealLoja: "Receita real da loja",
  despesasOfertas: "Despesas de ofertas da loja",
  despesasComissao: "Despesas de comissão da loja",
  taxaCanalPagamento: "Taxa de canal de pagamento da loja",
  recompensasPlataforma: "Recompensas da plataforma",
  gorjeta: "Gorjeta",
  contagemItem: "Contagem do item",
  taxaEntregaOriginal: "Taxa de entrega original da loja",
  taxaEntregaNovosClientes: "Taxa de entrega paga por novos clientes",
  clienteId: "ID do cliente que fez o pedido",
  qtdPedidosAnteriores: "Quantidade de pedidos anteriores do cliente na loja",
  valorReembolso: "Valor do reembolso",
  custoLojaOfertaEntregaGratis:
    "Custo líquido da loja na oferta de entrega grátis",
  custosLogisticos: "Custos logísticos",
  tempoPreparoMin: "Tempo de preparo (minutos)",
  clicouProntoRetirada: "Clicou em “Pronto para ser retirado”?",
  formaPagamento: "Forma de pagamento",
  metodoEntrega: "Método de entrega",
  preparacaoAtrasada: "Preparação atrasada?",
  parteResponsavelCancelamento: "Parte responsável pelo cancelamento",
  motivosCancelamentoComerciante:
    "Motivos de cancelamentos por parte do comerciante",
  dataAvaliacao: "Data da avaliação",
  nivelAvaliacao: "Nível de avaliação do cliente",
  conteudoAvaliacao: "Conteúdo de avaliação do cliente",
  tagAvaliacao: "Tag de avaliação do cliente",
  tempoAceitacaoSeg: "Tempo para aceitação do pedido (segundos)",
  tempoFinalizacaoSeg: "Tempo de finalização do pedido (segundos)",
  duracaoEntregaSeg: "Duração da entrega (segundos)",
  tempoConfirmacaoEntregadorSeg:
    "Tempo para confirmação do entregador parceiro (segundos)",
  tempoEntregadorChegadaLojaSeg:
    "Tempo que o entregador parceiro levará para chegar à loja (segundos)",
  tempoPedidoProntoChegadaSeg:
    "Tempo entre o pedido ficar pronto e a chegada do entregador parceiro à loja (segundos)",
  tempoEsperaRetiradaSeg:
    "Tempo de espera da retirada pelo entregador parceiro (segundos)",
  tempoEntregadorClienteSeg:
    "Tempo que o entregador parceiro levará para ir até o cliente (segundos)",
  tempoEsperaClienteSeg:
    "Tempo de espera do entregador parceiro pelo cliente (segundos)",
} as const

export function parseNinefoodDadosPedido(
  workbook: XLSX.WorkBook,
): ParsedNinefoodDadosPedido {
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error("XLSX sem abas.")
  const sheet = workbook.Sheets[sheetName]
  const headers = readHeader(sheet)

  for (const col of REQUIRED_COLS) {
    if (!headers.includes(col)) {
      throw new Error(
        `Coluna obrigatória "${col}" não encontrada. Confirma "Dados do pedido" no painel do 99 Food.`,
      )
    }
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  })

  if (rows.length === 0) {
    throw new Error("Relatório vazio (sem linhas).")
  }

  const has = (col: string) => headers.includes(col)
  const optStr = (r: Record<string, unknown>, col: string) =>
    has(col) ? toStringOrNull(r[col]) : null
  const optNum = (r: Record<string, unknown>, col: string) =>
    has(col) ? toNumberOrNull(r[col]) : null
  const optInt = (r: Record<string, unknown>, col: string) => {
    if (!has(col)) return null
    const n = toNumberOrNull(r[col])
    return n != null ? Math.round(n) : null
  }
  const optBool = (r: Record<string, unknown>, col: string) =>
    has(col) ? parseSimNao(r[col]) : null
  const optTs = (r: Record<string, unknown>, col: string) =>
    has(col) ? parseTimestampMaybe(r[col]) : null
  const optDate = (r: Record<string, unknown>, col: string) =>
    has(col) ? parseCompactDateMaybe(r[col]) : null

  type Bucket = {
    storeId: string
    storeName: string | null
    cidade: string | null
    pedidos: ParsedNinefoodPedido[]
  }
  const buckets = new Map<string, Bucket>()

  for (const r of rows) {
    const storeId = toStoreId(r["ID do loja"])
    if (!storeId) continue
    const pedidoId = toStoreId(r["ID do pedido"])
    if (!pedidoId) continue

    let data: Date
    try {
      data = parseCompactDate(r["Data"])
    } catch (e) {
      throw new Error(
        `Linha com data inválida (loja ${storeId}, pedido ${pedidoId}): ${e instanceof Error ? e.message : String(e)}`,
      )
    }

    // Nível de avaliação: o 99 Food armazena em escala 0-500 (100 por estrela).
    // Convertemos pra 1-5. 0 ou vazio = sem avaliação.
    let nivel: number | null = null
    if (has(COLS.nivelAvaliacao)) {
      const raw = r[COLS.nivelAvaliacao]
      const n = toNumberOrNull(raw)
      if (n != null && n > 0) {
        // Se vier 100/200/300/400/500 → dividir por 100
        // Se vier 1/2/3/4/5 → manter (defensivo se mudarem a API)
        const star = n >= 100 ? Math.round(n / 100) : Math.round(n)
        if (star >= 1 && star <= 5) nivel = star
      }
    }

    const pedido: ParsedNinefoodPedido = {
      pedidoId,
      data,
      horarioPedido: parseTimestampMaybe(r["Horário do pedido"]),
      horarioConclusao: optTs(r, COLS.horarioConclusao),
      horarioCancelamento: optTs(r, COLS.horarioCancelamento),
      tempoPosVenda: optStr(r, COLS.tempoPosVenda),

      receitaVendas: optNum(r, COLS.receitaVendas),
      precoOriginalItem: optNum(r, COLS.precoOriginalItem),
      receitaRealLoja: optNum(r, COLS.receitaRealLoja),
      despesasOfertas: optNum(r, COLS.despesasOfertas),
      despesasComissao: optNum(r, COLS.despesasComissao),
      taxaCanalPagamento: optNum(r, COLS.taxaCanalPagamento),
      recompensasPlataforma: optNum(r, COLS.recompensasPlataforma),
      gorjeta: optNum(r, COLS.gorjeta),
      contagemItem: optInt(r, COLS.contagemItem),
      taxaEntregaOriginal: optNum(r, COLS.taxaEntregaOriginal),
      taxaEntregaNovosClientes: optNum(r, COLS.taxaEntregaNovosClientes),

      clienteId: optStr(r, COLS.clienteId),
      qtdPedidosAnterioresCliente: optInt(r, COLS.qtdPedidosAnteriores),

      valorReembolso: optNum(r, COLS.valorReembolso),
      custoLojaOfertaEntregaGratis: optNum(r, COLS.custoLojaOfertaEntregaGratis),
      custosLogisticos: optNum(r, COLS.custosLogisticos),
      parteResponsavelCancelamento: optStr(r, COLS.parteResponsavelCancelamento),
      motivosCancelamentoComerciante: optStr(
        r,
        COLS.motivosCancelamentoComerciante,
      ),

      tempoPreparoMin: optNum(r, COLS.tempoPreparoMin),
      clicouProntoRetirada: optBool(r, COLS.clicouProntoRetirada),
      formaPagamento: optStr(r, COLS.formaPagamento),
      metodoEntrega: optStr(r, COLS.metodoEntrega),
      preparacaoAtrasada: optBool(r, COLS.preparacaoAtrasada),

      tempoAceitacaoSeg: optInt(r, COLS.tempoAceitacaoSeg),
      tempoFinalizacaoSeg: optInt(r, COLS.tempoFinalizacaoSeg),
      duracaoEntregaSeg: optInt(r, COLS.duracaoEntregaSeg),
      tempoConfirmacaoEntregadorSeg: optInt(
        r,
        COLS.tempoConfirmacaoEntregadorSeg,
      ),
      tempoEntregadorChegadaLojaSeg: optInt(
        r,
        COLS.tempoEntregadorChegadaLojaSeg,
      ),
      tempoPedidoProntoChegadaSeg: optInt(r, COLS.tempoPedidoProntoChegadaSeg),
      tempoEsperaRetiradaSeg: optInt(r, COLS.tempoEsperaRetiradaSeg),
      tempoEntregadorClienteSeg: optInt(r, COLS.tempoEntregadorClienteSeg),
      tempoEsperaClienteSeg: optInt(r, COLS.tempoEsperaClienteSeg),

      dataAvaliacao: optDate(r, COLS.dataAvaliacao),
      nivelAvaliacao: nivel,
      conteudoAvaliacao: optStr(r, COLS.conteudoAvaliacao),
      tagAvaliacao: optStr(r, COLS.tagAvaliacao),
    }

    let bucket = buckets.get(storeId)
    if (!bucket) {
      bucket = {
        storeId,
        storeName: toStringOrNull(r["Nome do estabelecimento"]),
        cidade: toStringOrNull(r["Cidade"]),
        pedidos: [],
      }
      buckets.set(storeId, bucket)
    }
    bucket.pedidos.push(pedido)
  }

  if (buckets.size === 0) {
    throw new Error("Nenhuma linha válida no relatório.")
  }

  return {
    reportType: "dados_pedido",
    porLoja: Array.from(buckets.values()),
  }
}

