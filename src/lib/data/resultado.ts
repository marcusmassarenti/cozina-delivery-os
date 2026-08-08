/**
 * Resultado (DRE consolidado) da rede.
 *
 * Junta duas fontes por unidade:
 *  - Importado (iFood + 99 Food + Keeta): faturamento bruto / líquido reais
 *    por plataforma. É o que alimenta o topo do DRE.
 *  - Lançamentos manuais (monthly_entries): custos (CMV Cozina/Loja) e VR.
 *    Quando não há lançamento, esses campos ficam zerados e a margem = líquido.
 *
 * O bruto/líquido vêm SEMPRE dos imports quando existem (fallback pro manual
 * da plataforma). Custos e VR vêm sempre do manual — não há equivalente
 * importado.
 */

import "server-only"

import { lerFinanceiro } from "@/lib/financeiro/regua"

import { getUnits } from "@/lib/data/units"
import {
  getCancelamentoCestaByUnits,
  getFinanceiroResumoByUnits,
} from "@/lib/data/ifood-imported"
import { getNinefoodResumoByUnits } from "@/lib/data/ninefood-imported"
import { getKeetaResumoByUnits } from "@/lib/data/keeta-imported"
import { getKeetaPedidoPorLoja } from "@/lib/data/keeta-pedidos"
import { getCardapioWebResumoByUnits } from "@/lib/data/cardapioweb-imported"
import {
  PLATAFORMAS,
  type MarketplaceId,
  type PlatformId,
} from "@/components/platform-logo"
import { getKeetaFaturaTaxasByUnits } from "@/lib/data/keeta-repasses"
import { getRealMonthlyForUnits } from "@/lib/data/lancamentos"
import { emptyMonthly, type UnitMonthly } from "@/lib/mock-monthly"

export type ResultadoUnitRow = {
  unitId: string
  unitCode: string
  unitName: string
  pedidos: number
  bruto: number
  /** Taxas retidas pelas plataformas = bruto − líquido das plataformas */
  taxasPlataforma: number
  /** Promoções/descontos que a LOJA bancou (já dentro das taxas — itemizado) */
  promocoesLoja: number
  /** O que a plataforma repassa pra loja (soma dos líquidos importados) */
  liquidoPlataformas: number
  /** VR líquido (manual): vr_recebido − vr_taxa_8% */
  vrLiquido: number
  /** Líquido que entra na conta = líquido plataformas + VR líquido */
  totalLiquido: number
  cmvCozina: number
  cmvLoja: number
  cmvTotal: number
  /** Margem líquida = total líquido − CMV (antes do custo de operação) */
  margemLiquida: number
  /** Margem de lucro % sobre o bruto */
  margemPct: number
  /** Custo da operação (manual, opcional): aluguel, folha, etc. */
  custoOperacao: number
  /** Resultado operacional = margem líquida − custo de operação (lucro) */
  resultadoOperacional: number
  /** Resultado operacional % sobre o bruto */
  resultadoPct: number
  /** Taxa de repasse % = líquido plataformas / bruto */
  repassePct: number
  temCusto: boolean
  temOperacao: boolean
  temImport: boolean
}

export type ResultadoTotals = {
  pedidos: number
  bruto: number
  taxasPlataforma: number
  promocoesLoja: number
  liquidoPlataformas: number
  vrLiquido: number
  totalLiquido: number
  cmvTotal: number
  margemLiquida: number
  margemPct: number
  custoOperacao: number
  resultadoOperacional: number
  resultadoPct: number
  repassePct: number
}

export type NetworkResultado = {
  rows: ResultadoUnitRow[]
  totals: ResultadoTotals
  /** Quantas unidades têm faturamento (import ou manual) no mês */
  unitsComFaturamento: number
  /** Quantas têm custo (CMV) lançado */
  unitsComCusto: number
}

/**
 * DRE consolidado da rede no mês. Uma linha por unidade ativa com
 * faturamento, ordenada por bruto DESC, + totais agregados.
 */
export async function getNetworkResultadoForMonth(
  year: number,
  month: number,
  filterUnitIds?: string[],
): Promise<NetworkResultado> {
  const allUnits = await getUnits()
  let active = allUnits.filter((u) => u.active)
  if (filterUnitIds) {
    const set = new Set(filterUnitIds)
    active = active.filter((u) => set.has(u.id))
  }
  const unitIds = active.map((u) => u.id)

  const [finByUnit, nineByUnit, keetaByUnit, cwByUnit, manualByUnit, keetaPorLoja] =
    await Promise.all([
      getFinanceiroResumoByUnits(unitIds, year, month),
      getNinefoodResumoByUnits(unitIds, year, month),
      getKeetaResumoByUnits(unitIds, year, month),
      getCardapioWebResumoByUnits(unitIds, year, month),
      getRealMonthlyForUnits(unitIds, year, month),
      getKeetaPedidoPorLoja(unitIds, year, month),
    ])
  // Promoção custeada pela loja na Keeta (vem do "Pedidos recentes").
  const keetaPromoLojaByUnit = new Map(
    keetaPorLoja.map((k) => [k.unitId, k.promoLoja]),
  )

  // Fallback de plataforma SEM import no mês: usa o monthly do MÊS CONSULTADO
  // (manualByUnit = getRealMonthlyForUnits(year,month)), NÃO u.monthly — que é
  // montado sempre com o mês corrente e contaminaria meses passados.
  const platBruto = (m: UnitMonthly, id: MarketplaceId) =>
    m.platforms.find((p) => p.id === id)?.bruto ?? 0
  const platLiquido = (m: UnitMonthly, id: MarketplaceId) =>
    m.platforms.find((p) => p.id === id)?.liquido ?? 0

  const rows: ResultadoUnitRow[] = []
  for (const u of active) {
    const fin = finByUnit.get(u.id)
    const nine = nineByUnit.get(u.id)
    const keeta = keetaByUnit.get(u.id)
    const manual = manualByUnit.get(u.id)
    // Monthly do MÊS CONSULTADO (não u.monthly, que é o mês corrente).
    const monthlyM = manual ?? emptyMonthly

    const hasIfood = fin?.hasData ?? false
    const has99 = nine?.hasData ?? false
    const hasKeeta = keeta?.hasData ?? false
    const cw = cwByUnit.get(u.id)
    const hasCw = cw?.hasData ?? false
    const temImport = hasIfood || has99 || hasKeeta || hasCw

    // Bruto / líquido por plataforma (importado preferido, fallback manual)
    const ifoodBruto = hasIfood ? fin!.bruto : platBruto(monthlyM, "ifood")
    const ifoodLiq = hasIfood ? fin!.liquido : platLiquido(monthlyM, "ifood")
    const nineBruto = has99 ? nine!.bruto : platBruto(monthlyM, "99food")
    const nineLiq = has99 ? nine!.liquido : platLiquido(monthlyM, "99food")
    const keetaBruto = hasKeeta ? keeta!.bruto : platBruto(monthlyM, "keeta")
    const keetaLiq = hasKeeta ? keeta!.liquido : platLiquido(monthlyM, "keeta")

    // Canal próprio: só existe via API, então não há fallback manual — ou o
    // pedido foi importado, ou ele não existe. Bruto e líquido entram JUNTOS:
    // somar só o bruto inventaria uma taxa que o canal não cobra.
    const cwBruto = hasCw ? cw!.bruto : 0
    const cwLiq = hasCw ? cw!.liquido : 0

    const bruto = ifoodBruto + nineBruto + keetaBruto + cwBruto
    const liquidoPlataformas = ifoodLiq + nineLiq + keetaLiq + cwLiq
    // Recebido direto (dinheiro/PIX na entrega, só iFood): dinheiro que a loja
    // pegou fora do repasse. Não é taxa e conta como receita — mesma régua do
    // DRE detalhado. Sem isto, as taxas inflavam e o resultado subestimava.
    const recebidoDireto =
      (hasIfood
        ? fin!.recebidoDireto
        : monthlyM.platforms.find((p) => p.id === "ifood")?.recebidoDireto ??
          0) +
      // 99 Food: dinheiro pago na porta também fica com a loja.
      (has99 ? nine!.recebidoDireto : 0)

    let pedidos = 0
    if (hasIfood) pedidos += fin!.pedidosUnicos
    if (has99) pedidos += nine!.pedidos
    if (hasKeeta) pedidos += keeta!.pedidos
    if (hasCw) pedidos += cw!.pedidos
    if (!temImport) pedidos = monthlyM.pedidos

    // Custos + VR vêm do manual
    const cmvCozina = manual?.custoProdutosCozina ?? 0
    const cmvLoja = manual?.custoProdutosLoja ?? 0
    const cmvTotal = cmvCozina + (cmvLoja ?? 0)
    const custoOperacao = manual?.custoOperacao ?? 0
    const vrLiquido = manual
      ? Math.max(0, manual.vrRecebido - manual.vrTaxaMedia8)
      : 0

    const taxasPlataforma = Math.max(0, bruto - liquidoPlataformas - recebidoDireto)
    // Promoções/descontos que a loja bancou (já dentro das taxas, itemizado)
    // — iFood + 99 Food + Keeta ("Promoção financiada pela loja").
    const promocoesLoja =
      (hasIfood ? Math.abs(fin!.promocaoLoja) : 0) +
      (has99 ? Math.abs(nine!.promocoesRs) : 0) +
      (keetaPromoLojaByUnit.get(u.id) ?? 0)
    // VR NÃO entra aqui. Ele parecia "receita paga à parte pelo iFood", mas o
    // dado diz o contrário: em julho/26, 2.201 de 2.201 pedidos pagos em vale
    // TÊM Entrada Financeira no repasse, e o valor bate centavo a centavo com
    // o total pago pelo cliente. Vale-refeição é FORMA DE PAGAMENTO de um
    // pedido que já foi repassado — somá-lo de novo inflava a receita da rede
    // em ~R$ 97 mil/mês. Continua exposto como mix de pagamento, que é o que
    // ele de fato responde ("quanto do meu faturamento vem de vale?").
    // Régua única (src/lib/financeiro/regua.ts). Estas cinco linhas eram
    // escritas de novo, com pequenas diferenças, em cada tela — daí as cinco
    // definições de "margem" que a auditoria achou, duas delas renderizadas
    // lado a lado na mesma página.
    const leitura = lerFinanceiro({
      bruto,
      liquido: liquidoPlataformas,
      recebidoDireto,
      cmv: cmvTotal,
      operacao: custoOperacao,
    })
    const totalLiquido = leitura.ficaNaLoja
    const margemLiquida = leitura.margem
    const margemPct = leitura.pctMargem
    const resultadoOperacional = leitura.resultado
    const resultadoPct = leitura.pctResultado
    // Repasse PURO (sem venda direta) — é o que a plataforma mandou, e serve
    // pra comparar plataformas entre si. Diferente do "% que fica na loja",
    // que é o que a loja embolsou no total.
    const repassePct = bruto > 0 ? (liquidoPlataformas / bruto) * 100 : 0

    // Só entra no DRE quem tem faturamento (import ou manual)
    if (bruto <= 0 && pedidos <= 0) continue

    rows.push({
      unitId: u.id,
      unitCode: u.code,
      unitName: u.name,
      pedidos,
      bruto,
      taxasPlataforma,
      promocoesLoja,
      liquidoPlataformas,
      vrLiquido,
      totalLiquido,
      cmvCozina,
      cmvLoja: cmvLoja ?? 0,
      cmvTotal,
      margemLiquida,
      margemPct,
      custoOperacao,
      resultadoOperacional,
      resultadoPct,
      repassePct,
      temCusto: cmvTotal > 0,
      temOperacao: custoOperacao > 0,
      temImport,
    })
  }

  rows.sort((a, b) => b.bruto - a.bruto)

  const totals = rows.reduce<ResultadoTotals>(
    (acc, r) => {
      acc.pedidos += r.pedidos
      acc.bruto += r.bruto
      acc.taxasPlataforma += r.taxasPlataforma
      acc.promocoesLoja += r.promocoesLoja
      acc.liquidoPlataformas += r.liquidoPlataformas
      acc.vrLiquido += r.vrLiquido
      acc.totalLiquido += r.totalLiquido
      acc.cmvTotal += r.cmvTotal
      acc.margemLiquida += r.margemLiquida
      acc.custoOperacao += r.custoOperacao
      acc.resultadoOperacional += r.resultadoOperacional
      return acc
    },
    {
      pedidos: 0,
      bruto: 0,
      taxasPlataforma: 0,
      promocoesLoja: 0,
      liquidoPlataformas: 0,
      vrLiquido: 0,
      totalLiquido: 0,
      cmvTotal: 0,
      margemLiquida: 0,
      margemPct: 0,
      custoOperacao: 0,
      resultadoOperacional: 0,
      resultadoPct: 0,
      repassePct: 0,
    },
  )
  totals.margemPct = totals.bruto > 0 ? (totals.margemLiquida / totals.bruto) * 100 : 0
  totals.resultadoPct =
    totals.bruto > 0 ? (totals.resultadoOperacional / totals.bruto) * 100 : 0
  totals.repassePct =
    totals.bruto > 0 ? (totals.liquidoPlataformas / totals.bruto) * 100 : 0

  return {
    rows,
    totals,
    unitsComFaturamento: rows.length,
    unitsComCusto: rows.filter((r) => r.temCusto).length,
  }
}

// ─── DRE detalhado da rede (taxas itemizadas por plataforma) ──────────

export type NetworkDrePlat = {
  id: PlatformId
  name: string
  bruto: number
  liquido: number
  taxaTotal: number
  /** Só iFood: cesta dos pedidos cancelados (o DRE abre em "Vendas totais −
   * cancelados", igual ao portal). */
  perdaCancelamento?: number
  /** Só iFood: quantidade de pedidos cancelados. */
  cancelQtd?: number
  /** VR líquido à parte (só iFood). */
  vrLiquido: number
  /** Só iFood: dinheiro recebido direto na entrega (fora do repasse). Volta no
   * "Resultado total", igual ao DRE por unidade. */
  recebidoDireto?: number
  /** Promoção/cupom que a LOJA bancou — separa "taxa real da plataforma" das
   * decisões de campanha da loja no card "Para onde vai o bruto". */
  promocoesLoja: number
  itens: { label: string; value: number; credit?: boolean }[]
}

/**
 * Abertura das taxas por plataforma SOMADA na rede — alimenta o DreDetalhado da
 * tela /financeiro (mesmo componente do detalhe da loja). iFood vem itemizado
 * da Conciliação; 99 Food do resumo; Keeta só o total.
 */
export async function getNetworkDrePlatforms(
  year: number,
  month: number,
  filterUnitIds?: string[],
): Promise<NetworkDrePlat[]> {
  const allUnits = await getUnits()
  let active = allUnits.filter((u) => u.active)
  if (filterUnitIds) {
    const set = new Set(filterUnitIds)
    active = active.filter((u) => set.has(u.id))
  }
  const unitIds = active.map((u) => u.id)
  if (unitIds.length === 0) return []

  const [
    finByUnit,
    nineByUnit,
    keetaByUnit,
    cwByUnit,
    manualByUnit,
    keFat,
    cestaByUnit,
  ] = await Promise.all([
      getFinanceiroResumoByUnits(unitIds, year, month),
      getNinefoodResumoByUnits(unitIds, year, month),
      getKeetaResumoByUnits(unitIds, year, month),
      getCardapioWebResumoByUnits(unitIds, year, month),
      getRealMonthlyForUnits(unitIds, year, month),
      getKeetaFaturaTaxasByUnits(unitIds, year, month),
      // Cesta dos cancelados iFood — o DRE da rede abre em "Vendas totais −
      // cancelados", igual ao portal e ao DRE da loja.
      getCancelamentoCestaByUnits(unitIds, year, month),
    ])
  const pBruto = (m: UnitMonthly, id: MarketplaceId) =>
    m.platforms.find((p) => p.id === id)?.bruto ?? 0
  const pLiq = (m: UnitMonthly, id: MarketplaceId) =>
    m.platforms.find((p) => p.id === id)?.liquido ?? 0

  const a = {
    if: {
      bruto: 0,
      liq: 0,
      entrega: 0,
      comissao: 0,
      promo: 0,
      cancelValor: 0,
      cancelQtd: 0,
      // Recebido direto (dinheiro/PIX na entrega, impacto_no_repasse=false):
      // dinheiro que a loja embolsou fora do repasse. O DRE por unidade já
      // devolve isso no "Resultado total"; a rede esquecia, subestimando o
      // consolidado. Só iFood tem.
      recDireto: 0, mensalidade: 0,
    },
    ni: { bruto: 0, liq: 0, comissao: 0, taxaPgto: 0, promo: 0 },
    ke: { bruto: 0, liq: 0, promo: 0 },
    // Canal próprio: sem comissão, sem promoção de plataforma. O que separa
    // bruto de líquido aqui é só cancelamento.
    cw: { bruto: 0, liq: 0, cancelQtd: 0 },
    vr: 0,
  }
  for (const u of active) {
    const fin = finByUnit.get(u.id)
    const nine = nineByUnit.get(u.id)
    const keeta = keetaByUnit.get(u.id)
    const mm = manualByUnit.get(u.id) ?? emptyMonthly
    const hasIfood = fin?.hasData ?? false
    const has99 = nine?.hasData ?? false
    const hasKeeta = keeta?.hasData ?? false

    // Bruto/líquido por plataforma (importado preferido, fallback manual) —
    // MESMA lógica do getNetworkResultadoForMonth, pra somar idêntico.
    const ifBruto = hasIfood ? fin!.bruto : pBruto(mm, "ifood")
    const ifLiq = hasIfood ? fin!.liquido : pLiq(mm, "ifood")
    const niBruto = has99 ? nine!.bruto : pBruto(mm, "99food")
    const niLiq = has99 ? nine!.liquido : pLiq(mm, "99food")
    const keBruto = hasKeeta ? keeta!.bruto : pBruto(mm, "keeta")
    const keLiq = hasKeeta ? keeta!.liquido : pLiq(mm, "keeta")
    const cwU = cwByUnit.get(u.id)
    const hasCw = cwU?.hasData ?? false
    const cwBruto = hasCw ? cwU!.bruto : 0
    const cwLiq = hasCw ? cwU!.liquido : 0

    // Pula quem não tem faturamento (mesmo critério do DRE): assim o bruto,
    // líquido e VR somam EXATAMENTE igual ao totals do resultado.
    let pedidos = 0
    if (hasIfood) pedidos += fin!.pedidosUnicos
    if (has99) pedidos += nine!.pedidos
    if (hasKeeta) pedidos += keeta!.pedidos
    if (hasCw) pedidos += cwU!.pedidos
    if (!hasIfood && !has99 && !hasKeeta && !hasCw) pedidos = mm.pedidos
    const unitBruto = ifBruto + niBruto + keBruto + cwBruto
    if (unitBruto <= 0 && pedidos <= 0) continue

    a.if.bruto += ifBruto
    a.if.liq += ifLiq
    const cc = cestaByUnit.get(u.id)
    if (cc) {
      a.if.cancelValor += cc.valor
      a.if.cancelQtd += cc.qtd
    }
    if (hasIfood) {
      // Mesmos itens do DRE da loja (mergeMonthly): entrega + comissão +
      // promoção que a loja bancou. Transação/serviço/anúncios não são
      // itemizados nesse padrão — caem no resto "Cancelamentos / outros".
      a.if.entrega += Math.abs(fin!.taxaEntrega)
      a.if.comissao += Math.abs(fin!.comissaoIfood)
      a.if.promo += Math.abs(fin!.promocaoLoja)
      a.if.recDireto += fin!.recebidoDireto
      // Mensalidade do plano + pacote de anúncios: cobranças de PERÍODO.
      // Sem linha própria elas caíam no resíduo e apareciam como "Créditos /
      // estornos da plataforma" — nome que diz o oposto do que são.
      a.if.mensalidade += Math.abs(fin!.mensalidade) + Math.abs(fin!.pacoteAnuncios)
    }
    a.ni.bruto += niBruto
    a.ni.liq += niLiq
    if (has99) {
      a.ni.comissao += nine!.comissaoRs
      a.ni.taxaPgto += nine!.taxaCanalPagamentoRs
      a.ni.promo += nine!.promocoesRs
    }
    a.ke.bruto += keBruto
    a.ke.liq += keLiq
    if (hasKeeta) a.ke.promo += keeta!.promocoesLoja
    a.cw.bruto += cwBruto
    a.cw.liq += cwLiq
    if (hasCw) a.cw.cancelQtd += cwU!.cancelamentosQtd
    a.vr += Math.max(0, mm.vrRecebido - mm.vrTaxaMedia8)
  }

  const make = (
    id: PlatformId,
    name: string,
    bruto: number,
    liq: number,
    itens: { label: string; value: number }[],
    vr: number,
    promoLoja: number,
    cancel?: { valor: number; qtd: number },
    recebidoDireto = 0,
  ): NetworkDrePlat | null => {
    if (bruto <= 0) return null
    // Taxa REAL = bruto − repasse − recebido direto. O recebido direto não é
    // taxa (é dinheiro que a loja pegou na entrega); sem descontá-lo aqui, a
    // linha por plataforma inflaria e não somaria o header. Mesma conta do DRE
    // por unidade (financeiro-loja-tab).
    const taxaTotal = Math.max(0, bruto - liq - recebidoDireto)
    const lista: { label: string; value: number; credit?: boolean }[] =
      itens.filter((i) => i.value > 0)
    const resto = taxaTotal - lista.reduce((s, i) => s + i.value, 0)
    if (resto > 0.5) {
      lista.push({ label: "Cancelamentos / outros", value: resto })
    } else if (resto < -0.5) {
      // Os descontos itemizados somam mais que a taxa líquida real — a
      // diferença é o que a plataforma devolveu (promoções financiadas por
      // ela, estornos/ressarcimentos). Entra como crédito pra fechar a conta.
      lista.push({
        label: "Créditos / estornos da plataforma",
        value: -resto,
        credit: true,
      })
    }
    return {
      id,
      name,
      bruto,
      liquido: liq,
      taxaTotal,
      perdaCancelamento: cancel?.valor ?? 0,
      cancelQtd: cancel?.qtd ?? 0,
      vrLiquido: vr,
      recebidoDireto,
      promocoesLoja: Math.min(Math.abs(promoLoja), taxaTotal),
      itens: lista,
    }
  }
  return [
    make(
      "ifood",
      "iFood",
      a.if.bruto,
      a.if.liq,
      [
        { label: "Taxa de entrega", value: a.if.entrega },
        { label: "Comissão + serviço", value: a.if.comissao },
        { label: "Promoções (loja bancou)", value: a.if.promo },
        { label: "Mensalidade / anúncios", value: a.if.mensalidade },
      ],
      a.vr,
      a.if.promo,
      { valor: a.if.cancelValor, qtd: a.if.cancelQtd },
      a.if.recDireto,
    ),
    make(
      "99food",
      "99 Food",
      a.ni.bruto,
      a.ni.liq,
      [
        { label: "Comissão", value: a.ni.comissao },
        { label: "Taxa de pagamento", value: a.ni.taxaPgto },
        { label: "Promoções", value: a.ni.promo },
      ],
      0,
      a.ni.promo,
    ),
    make(
      "keeta",
      "Keeta",
      a.ke.bruto,
      a.ke.liq,
      // Quebra oficial da Fatura (aba Histórico) somada na rede. Sem Fatura,
      // ao menos a promoção que a loja bancou; o resto vira Cancelamentos.
      keFat.hasData
        ? [
            { label: "Comissão", value: keFat.comissao },
            { label: "Taxa de distância", value: keFat.taxaDistancia },
            { label: "Taxa de pagamento online", value: keFat.taxaPagamentoOnline },
            { label: "Saque antecipado", value: keFat.taxaSaqueAntecipado },
            { label: "Taxa de serviço mensal", value: keFat.taxaServicoMensal },
            { label: "Publicidade / marketing", value: keFat.publicidade },
            { label: "Ajuste de comissão", value: keFat.ajusteComissao },
            { label: "Serviço da Ajuda", value: keFat.deducaoAjuda },
            { label: "Promoções (loja bancou)", value: keFat.promoLoja },
          ]
        : [{ label: "Promoções (loja bancou)", value: a.ke.promo }],
      0,
      keFat.hasData ? keFat.promoLoja : a.ke.promo,
    ),
    // Canal próprio. `itens` vai vazio de propósito: não há comissão, taxa de
    // entrega nem promoção de plataforma pra abrir. A diferença entre bruto e
    // líquido é só cancelamento, e o `make` já a rotula como
    // "Cancelamentos / outros" — que aqui é literalmente o que ela é.
    make(
      "cardapioweb",
      "Cardápio Web",
      a.cw.bruto,
      a.cw.liq,
      [],
      0,
      0,
      { valor: Math.max(0, a.cw.bruto - a.cw.liq), qtd: a.cw.cancelQtd },
    ),
  ].filter((p): p is NetworkDrePlat => p !== null)
}

/**
 * DRE por plataforma da rede AGREGADO sobre vários meses (período/ano). Soma os
 * meses inteiros do range, mesclando os itens de taxa por rótulo. Reaproveita o
 * `getNetworkDrePlatforms` mensal (tela /financeiro), então bate com ele.
 */
export async function getNetworkDrePlatformsForRange(
  months: { year: number; month: number }[],
  filterUnitIds?: string[],
): Promise<NetworkDrePlat[]> {
  // Concorrência limitada a 2 meses por vez (resumos pesados ~1,5s cada); em
  // paralelo nos 6+ meses satura o Postgres (statement timeout).
  const parts: NetworkDrePlat[][] = []
  for (let i = 0; i < months.length; i += 2) {
    const chunk = months.slice(i, i + 2)
    const res = await Promise.all(
      chunk.map((p) => getNetworkDrePlatforms(p.year, p.month, filterUnitIds)),
    )
    parts.push(...res)
  }
  const ORDER: NetworkDrePlat["id"][] = PLATAFORMAS
  const byId = new Map<
    NetworkDrePlat["id"],
    {
      name: string
      bruto: number
      liquido: number
      taxaTotal: number
      perdaCancelamento: number
      cancelQtd: number
      vrLiquido: number
      recebidoDireto: number
      promocoesLoja: number
      itens: Map<string, { value: number; credit?: boolean }>
    }
  >()
  for (const monthPlats of parts) {
    for (const p of monthPlats) {
      const cur = byId.get(p.id) ?? {
        name: p.name,
        bruto: 0,
        liquido: 0,
        taxaTotal: 0,
        perdaCancelamento: 0,
        cancelQtd: 0,
        vrLiquido: 0,
        recebidoDireto: 0,
        promocoesLoja: 0,
        itens: new Map<string, { value: number; credit?: boolean }>(),
      }
      cur.bruto += p.bruto
      cur.liquido += p.liquido
      cur.taxaTotal += p.taxaTotal
      cur.perdaCancelamento += p.perdaCancelamento ?? 0
      cur.cancelQtd += p.cancelQtd ?? 0
      cur.vrLiquido += p.vrLiquido
      cur.recebidoDireto += p.recebidoDireto ?? 0
      cur.promocoesLoja += p.promocoesLoja
      for (const it of p.itens) {
        const e = cur.itens.get(it.label) ?? { value: 0, credit: it.credit }
        e.value += it.value
        cur.itens.set(it.label, e)
      }
      byId.set(p.id, cur)
    }
  }
  return ORDER.filter((id) => byId.has(id)).map((id) => {
    const c = byId.get(id)!
    return {
      id,
      name: c.name,
      bruto: c.bruto,
      liquido: c.liquido,
      taxaTotal: c.taxaTotal,
      perdaCancelamento: c.perdaCancelamento,
      cancelQtd: c.cancelQtd,
      vrLiquido: c.vrLiquido,
      recebidoDireto: c.recebidoDireto,
      promocoesLoja: c.promocoesLoja,
      itens: [...c.itens].map(([label, e]) => ({
        label,
        value: e.value,
        credit: e.credit,
      })),
    }
  })
}
