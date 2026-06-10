/**
 * Parser do relatório financeiro do iFood (Conciliação).
 *
 * Aba "Relatório de Conciliação" — 32 colunas.
 * Granularidade máxima: 1 linha = 1 lançamento financeiro.
 *
 * Regras de agregação implementadas no `totals`:
 * - bruto: "Valor das vendas" do iFood = soma da cesta (valor dos itens) por
 *   pedido de Venda, exceto pedidos com cancelamento total (bate com a tela)
 * - comissaoIfood: soma das `Comissão*` em vendas (impacto SIM)
 * - taxaEntrega: soma de `Taxa entrega iFood` em vendas (impacto SIM)
 * - taxaTransacao: soma de `Taxa de transação*` em vendas (impacto SIM)
 * - taxaServicoCliente: `Taxa de serviço iFood cobrada do cliente` (vendas)
 * - promocaoLoja: soma de `Promoção custeada pela loja*`
 * - promocaoIfood: soma de `Promoção custeada pelo iFood`
 * - pacoteAnuncios: soma de `Pacote de anúncios`
 * - cancelamentoTotalQtd/cancelamentoParcialQtd: pedidos distintos
 * - liquido: soma de todos os valores com impacto_no_repasse=true
 */

import * as XLSX from "xlsx"

import type { ParsedFinanceiro, ParsedFinanceiroLancamento } from "./types"
import {
  parseCompetencia,
  parseDateOnlyMaybe,
  parseIsoDateMaybe,
  parseSimNao,
  toNumber,
  toNumberOrNull,
  toStringOrNull,
} from "./utils"

export function parseIfoodFinanceiro(workbook: XLSX.WorkBook): ParsedFinanceiro {
  const sheetName =
    workbook.SheetNames.find((n) => n === "Relatório de Conciliação") ??
    workbook.SheetNames.find((n) => n === "Relatorio de Conciliacao") ??
    // CSV exportado pelo iFood não traz a aba nomeada — vira "Página 1".
    // O detect já garantiu que é financeiro (colunas competencia/fato_gerador).
    workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error("Aba 'Relatório de Conciliação' não encontrada")
  }
  const sheet = workbook.Sheets[sheetName]

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
  })
  if (rows.length === 0) {
    throw new Error("Aba 'Relatório de Conciliação' está vazia")
  }

  // Identifica loja + competência a partir da primeira linha
  const first = rows[0]
  const storeId = String(
    first["loja_id_curto"] ?? first["loja_id_externo"] ?? "",
  ).trim()
  if (!storeId) {
    throw new Error("Coluna 'loja_id_curto' vazia — não conseguiu identificar a loja")
  }
  const storeCnpj = toStringOrNull(first["cnpj"])
  const competenciaRaw = String(first["competencia"] ?? "").trim()
  if (!competenciaRaw) {
    throw new Error("Coluna 'competencia' vazia na primeira linha")
  }
  const { year, month } = parseCompetencia(competenciaRaw)

  // Parseia todas as linhas (a competência deve ser a mesma em todas;
  // se houver mistura, mantemos por linha, mas usamos a primeira pro header)
  const lancamentos: ParsedFinanceiroLancamento[] = rows.map((row) => {
    const comp = String(row["competencia"] ?? competenciaRaw).trim()
    const parsed = parseCompetencia(comp)
    return {
      competencia: comp,
      refYear: parsed.year,
      refMonth: parsed.month,
      // O iFood mudou o layout: relatórios novos não trazem mais a coluna
      // "data_fato_gerador". Sem ela, a Cobertura e o Relatório Diário (que
      // contam por dia do fato gerador) zeravam o mês. Caímos na data de
      // criação do pedido (a data real da venda) e, em último caso, no
      // faturamento — ambos representam o dia do fato gerador da Venda.
      dataFatoGerador:
        parseIsoDateMaybe(row["data_fato_gerador"]) ??
        parseIsoDateMaybe(row["data_criacao_pedido_associado"]) ??
        parseIsoDateMaybe(row["data_faturamento"]),
      fatoGerador: toStringOrNull(row["fato_gerador"]),
      tipoLancamento: toStringOrNull(row["tipo_lancamento"]),
      descricaoLancamento: toStringOrNull(row["descricao_lancamento"]),
      valor: toNumber(row["valor"]),
      baseCalculo: toNumberOrNull(row["base_calculo"]),
      percentualTaxa: toNumberOrNull(row["percentual_taxa"]),
      valorTransacao: toNumberOrNull(row["valor_transacao"]),
      valorCestaInicial: toNumberOrNull(row["valor_cesta_inicial"]),
      valorCestaFinal: toNumberOrNull(row["valor_cesta_final"]),
      pedidoAssociadoIfood: toStringOrNull(row["pedido_associado_ifood"]),
      pedidoAssociadoIfoodCurto: toStringOrNull(
        row["pedido_associado_ifood_curto"],
      ),
      pedidoAssociadoExterno: toStringOrNull(row["pedido_associado_externo"]),
      motivoCancelamento: toStringOrNull(row["motivo_cancelamento"]),
      descricaoOcorrencia: toStringOrNull(row["descricao_ocorrencia"]),
      dataCriacaoPedido: parseIsoDateMaybe(row["data_criacao_pedido_associado"]),
      dataRepasseEsperada: parseDateOnlyMaybe(row["data_repasse_esperada"]),
      dataFaturamento: parseIsoDateMaybe(row["data_faturamento"]),
      dataApuracaoInicio: parseDateOnlyMaybe(row["data_apuracao_inicio"]),
      dataApuracaoFim: parseDateOnlyMaybe(row["data_apuracao_fim"]),
      responsavelTransacao: toStringOrNull(row["responsavel_transacao"]),
      canalVendas: toStringOrNull(row["canal_vendas"]),
      impactoNoRepasse: parseSimNao(row["impacto_no_repasse"]),
      parcelaPagamento: toStringOrNull(row["parcela_pagamento"]),
      idSaldo: toStringOrNull(row["id_saldo"]),
    }
  })

  const totals = computeTotals(lancamentos)

  return {
    reportType: "financeiro",
    storeId,
    storeCnpj,
    competencia: competenciaRaw,
    refYear: year,
    refMonth: month,
    lancamentos,
    totals,
  }
}

// ─── Agregação dos totais ────────────────────────────────────────────

function computeTotals(
  lancamentos: ParsedFinanceiroLancamento[],
): ParsedFinanceiro["totals"] {
  const t = {
    pedidosUnicos: 0,
    bruto: 0,
    comissaoIfood: 0,
    taxaEntrega: 0,
    taxaTransacao: 0,
    taxaServicoCliente: 0,
    promocaoLoja: 0,
    promocaoIfood: 0,
    pacoteAnuncios: 0,
    cancelamentoTotalQtd: 0,
    cancelamentoParcialQtd: 0,
    liquido: 0,
  }

  const pedidosUnicos = new Set<string>()
  const pedidosCancTotal = new Set<string>()
  const pedidosCancParcial = new Set<string>()
  // Cesta (valor dos itens) por pedido de Venda — vira o "bruto" depois do loop.
  const cestaVendaPorPedido = new Map<string, number>()

  for (const l of lancamentos) {
    const desc = l.descricaoLancamento ?? ""
    const fg = l.fatoGerador ?? ""
    const isVenda = fg === "Venda"
    const isCancelTotal = fg === "Cancelamento Total"
    const isCancelParcial = fg === "Cancelamento Parcial"

    // Pedidos únicos: qualquer pedido com fato_gerador relacionado a Venda
    if (l.pedidoAssociadoIfood && (isVenda || isCancelTotal || isCancelParcial)) {
      pedidosUnicos.add(l.pedidoAssociadoIfood)
    }

    // Cancelamentos: contar pedidos distintos
    if (isCancelTotal && l.pedidoAssociadoIfood) {
      pedidosCancTotal.add(l.pedidoAssociadoIfood)
    }
    if (isCancelParcial && l.pedidoAssociadoIfood) {
      pedidosCancParcial.add(l.pedidoAssociadoIfood)
    }

    // Líquido = tudo que impacta o repasse
    if (l.impactoNoRepasse === true) {
      t.liquido += l.valor
    }

    // Valor das vendas (bruto) = valor dos itens da cesta, por pedido de Venda.
    // O iFood mostra "Valor dos itens" na tela; guardamos a cesta por pedido
    // (1 valor por pedido) e somamos depois, fora os cancelados totais.
    if (isVenda && l.pedidoAssociadoIfood && l.valorCestaFinal != null) {
      cestaVendaPorPedido.set(l.pedidoAssociadoIfood, l.valorCestaFinal)
    }

    // Categorizações específicas (só em Vendas, pra não contar duplicado
    // em cancelamentos que estornam)
    if (isVenda) {
      if (
        desc === "Comissão do iFood (entrega iFood)" ||
        desc === "Comissão do iFood"
      )
        t.comissaoIfood += l.valor
      else if (desc === "Taxa entrega iFood") t.taxaEntrega += l.valor
      else if (
        desc === "Taxa de transação" ||
        desc === "Taxa de transação iFood beneficios"
      )
        t.taxaTransacao += l.valor
      else if (desc === "Taxa de serviço iFood cobrada do cliente")
        t.taxaServicoCliente += l.valor
      else if (desc === "Promoção custeada pelo iFood") t.promocaoIfood += l.valor
      else if (
        desc === "Promoção custeada pela loja" ||
        desc === "Promoção custeada pela loja no delivery"
      )
        t.promocaoLoja += l.valor
    }

    // Ocorrências (anúncios, multas) — todas as competências
    if (desc === "Pacote de anúncios") t.pacoteAnuncios += l.valor
  }

  // Bruto = "Valor das vendas" do iFood = soma da cesta (itens) por pedido de
  // Venda, exceto pedidos com cancelamento total. Bate no centavo com o
  // "Valor dos itens" da tela do iFood (≈ Valor das vendas — difere só pelo
  // pequeno ajuste de cancelamentos, que o relatório de conciliação não expõe).
  for (const [pedido, cesta] of cestaVendaPorPedido) {
    if (!pedidosCancTotal.has(pedido)) t.bruto += cesta
  }

  t.pedidosUnicos = pedidosUnicos.size
  t.cancelamentoTotalQtd = pedidosCancTotal.size
  t.cancelamentoParcialQtd = pedidosCancParcial.size

  // Arredondamento pra 2 casas (acumulação em float gera ruído)
  const round = (n: number) => Math.round(n * 100) / 100
  return {
    pedidosUnicos: t.pedidosUnicos,
    bruto: round(t.bruto),
    comissaoIfood: round(t.comissaoIfood),
    taxaEntrega: round(t.taxaEntrega),
    taxaTransacao: round(t.taxaTransacao),
    taxaServicoCliente: round(t.taxaServicoCliente),
    promocaoLoja: round(t.promocaoLoja),
    promocaoIfood: round(t.promocaoIfood),
    pacoteAnuncios: round(t.pacoteAnuncios),
    cancelamentoTotalQtd: t.cancelamentoTotalQtd,
    cancelamentoParcialQtd: t.cancelamentoParcialQtd,
    liquido: round(t.liquido),
  }
}
