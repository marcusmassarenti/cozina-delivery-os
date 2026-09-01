/**
 * Comparativo loja × loja — métricas por unidade no mês, respeitando o filtro
 * de plataformas (soma só as plataformas escolhidas). Reusa os 3 "resumos"
 * por unidade (iFood / 99 / Keeta), então é a mesma fonte do resto do sistema.
 *
 * Tipos e metadados das métricas (compartilhados com o Client) ficam em
 * `comparativo-metrics.ts` — este arquivo é server-only.
 */
import "server-only"

import { brutoIfoodComoNoPortal } from "@/lib/ifood-bruto"
import { getCancelamentoCestaByUnits } from "./ifood-imported"

import type { PlatformId } from "@/components/platform-logo"
import { getFinanceiroResumoByUnits } from "@/lib/data/ifood-imported"
import { getReceitaPropriaByUnits } from "@/lib/data/lancamentos"
import { getNinefoodResumoByUnits } from "@/lib/data/ninefood-imported"
import { getKeetaResumoByUnits } from "@/lib/data/keeta-imported"
import { getCardapioWebResumoByUnits } from "@/lib/data/cardapioweb-imported"
import type { UnitMetrics } from "@/lib/data/comparativo-metrics"

export type EvolucaoPonto = {
  year: number
  month: number
  metrics: UnitMetrics
}

/**
 * Métricas por unidade no mês, somando só as plataformas pedidas.
 * Retorna um Map keyed por unitId (mesmas chaves de `unitIds`).
 */
export async function getUnitMetricsForMonth(
  unitIds: string[],
  platforms: PlatformId[],
  year: number,
  month: number,
): Promise<Map<string, UnitMetrics>> {
  const want = new Set(platforms)
  // Receita própria (balcão, salão, telefone) não é de plataforma nenhuma.
  // Entra só quando a pergunta é sobre a loja INTEIRA — filtrar por "iFood" e
  // ver o balcão somado ali seria mentira. É a mesma régua do painel: sem ela
  // aqui, o Nino e os comparativos passariam a discordar da tela da unidade,
  // que é exatamente o defeito que a gente acabou de caçar em julho/26.
  const querTodas = (["ifood", "99food", "keeta", "cardapioweb"] as const).every(
    (p) => want.has(p),
  )
  const [ifood, nine, keeta, cw, propria, cestaCancelada] = await Promise.all([
    want.has("ifood")
      ? getFinanceiroResumoByUnits(unitIds, year, month)
      : null,
    want.has("99food")
      ? getNinefoodResumoByUnits(unitIds, year, month)
      : null,
    want.has("keeta") ? getKeetaResumoByUnits(unitIds, year, month) : null,
    want.has("cardapioweb")
      ? getCardapioWebResumoByUnits(unitIds, year, month)
      : null,
    querTodas ? getReceitaPropriaByUnits(unitIds, year, month) : null,
    // Cesta dos pedidos cancelados: a RÉGUA DO PORTAL manda mostrar o bruto
    // COM eles (ver project-bruto-portal). Ela entra AQUI dentro, e não em
    // cada tela, porque quem somava por fora era só metade do sistema — o
    // gráfico de Evolução mostrava R$ 1.249.939 embaixo de um KPI de R$ 1,3
    // mi e o Marcus leu a diferença no tooltip (31/08/26).
    want.has("ifood") ? getCancelamentoCestaByUnits(unitIds, year, month) : null,
  ])

  const out = new Map<string, UnitMetrics>()
  for (const id of unitIds) {
    let bruto = 0
    let liquido = 0
    let pedidos = 0
    let cancelados = 0
    let hasData = false

    const fi = ifood?.get(id)
    if (fi) {
      // Régua do portal — ver src/lib/ifood-bruto.ts (taxas do cliente) e o
      // comentário do `cestaCancelada` acima (pedidos que não viraram venda).
      bruto += brutoIfoodComoNoPortal(fi) + (cestaCancelada?.get(id)?.valor ?? 0)
      liquido += fi.liquido
      pedidos += fi.pedidosUnicos
      cancelados += fi.cancelamentoTotalQtd + fi.cancelamentoParcialQtd
      if (fi.hasData) hasData = true
    }
    const ni = nine?.get(id)
    if (ni) {
      bruto += ni.bruto
      liquido += ni.liquido
      pedidos += ni.pedidos
      cancelados += ni.cancelamentosQtd
      if (ni.hasData) hasData = true
    }
    const ke = keeta?.get(id)
    if (ke) {
      bruto += ke.bruto
      liquido += ke.liquido
      pedidos += ke.pedidos
      cancelados += ke.cancelamentosQtd
      if (ke.hasData) hasData = true
    }

    // Canal próprio entra em bruto/pedidos/cancelados, mas NÃO no repasse:
    // ele não tem repasse (a loja recebe direto), e somá-lo puxaria o "% que
    // fica na loja" da rede pra cima como se o marketplace tivesse melhorado.
    const brutoMarketplace = bruto
    const liquidoMarketplace = liquido
    const c = cw?.get(id)
    if (c?.hasData) {
      bruto += c.bruto
      liquido += c.liquido
      pedidos += c.pedidos
      cancelados += c.cancelamentosQtd
      hasData = true
    }

    // Sem taxa: entra cheia no bruto e no líquido. Fora de `pedidos` porque
    // não há contagem — somar no ticket inflaria o ticket sem pedido novo.
    const rp = propria?.get(id) ?? 0
    if (rp > 0) {
      bruto += rp
      liquido += rp
      hasData = true
    }

    // Ticket pelo bruto SEM a receita própria, pelo mesmo motivo.
    const ticket = pedidos > 0 ? (bruto - rp) / pedidos : 0
    const repasse =
      brutoMarketplace > 0 ? (liquidoMarketplace / brutoMarketplace) * 100 : 0

    out.set(id, {
      brutoMarketplace,
      liquidoMarketplace,
      bruto,
      liquido,
      pedidos,
      ticket,
      repasse,
      cancelados,
      hasData,
    })
  }
  return out
}

/**
 * Série temporal: para cada mês pedido, agrega as métricas das lojas escolhidas
 * (somadas) nas plataformas escolhidas. Devolve em ordem cronológica.
 */
export async function getEvolucaoSeries(
  unitIds: string[],
  platforms: PlatformId[],
  periods: { year: number; month: number }[],
): Promise<EvolucaoPonto[]> {
  const maps = await Promise.all(
    periods.map((p) =>
      getUnitMetricsForMonth(unitIds, platforms, p.year, p.month),
    ),
  )
  return periods.map((p, i) => {
    let bruto = 0
    let liquido = 0
    let pedidos = 0
    let cancelados = 0
    let brutoMkt = 0
    let liquidoMkt = 0
    let hasData = false
    for (const m of maps[i].values()) {
      bruto += m.bruto
      liquido += m.liquido
      pedidos += m.pedidos
      cancelados += m.cancelados
      brutoMkt += m.brutoMarketplace ?? m.bruto
      liquidoMkt += m.liquidoMarketplace ?? m.liquido
      if (m.hasData) hasData = true
    }
    const ticket = pedidos > 0 ? bruto / pedidos : 0
    // Mesma base do /relatorios/comparativo: só marketplace.
    const repasse = brutoMkt > 0 ? (liquidoMkt / brutoMkt) * 100 : 0
    return {
      year: p.year,
      month: p.month,
      metrics: { bruto, liquido, pedidos, ticket, repasse, cancelados, hasData },
    }
  })
}
