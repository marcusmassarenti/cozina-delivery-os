/**
 * Top produtos por plataforma — normaliza os 3 rankings de item (iFood / 99 /
 * Keeta) num formato comum. Produto é por plataforma (nomes diferem entre elas),
 * então o relatório escolhe UMA plataforma por vez.
 */
import "server-only"

import type { PlatformId } from "@/components/platform-logo"
import { getNetworkTopItemsForMonth } from "@/lib/data/ifood-imported"
import { getNetworkNinefoodTopItemsForMonth } from "@/lib/data/ninefood-imported"
import { getNetworkKeetaTopItemsForMonth } from "@/lib/data/keeta-imported"
import { getNetworkCardapioWebTopItemsForMonth } from "@/lib/data/cardapioweb-imported"

export type ProdutoRanking = {
  nomeItem: string
  qtdVendida: number
  valorTotal: number
  /**
   * Venda por dia — só o iFood preenche, e só porque só ele precisa.
   *
   * O relatório de Cardápio do iFood cobre um período escolhido na exportação
   * (a base tinha de 7 a 60 dias em agosto/26), então total não compara entre
   * lojas. 99 / Keeta / Cardápio Web vêm de tabela diária já recortada no mês —
   * ali total já é comparável e estes campos ficam indefinidos de propósito.
   */
  qtdPorDia?: number
  valorPorDia?: number
}

export type ProdutoMetric = "qtd" | "valor"

/**
 * Top produtos da plataforma no mês, somando as lojas escolhidas. `limit` alto
 * pra a comparação alta/queda pegar a cauda também.
 *
 * IMPORTANTE: lista vazia = "nenhuma loja no escopo" → retorna [] (sem dados).
 * NÃO cai pra rede inteira (era o bug: franqueado sem lojas visíveis via o top
 * de toda a rede). Nenhum caller passa [] querendo a rede toda.
 */
export async function getTopProdutos(
  platform: PlatformId,
  unitIds: string[],
  year: number,
  month: number,
  limit = 200,
): Promise<ProdutoRanking[]> {
  if (unitIds.length === 0) return []
  const filter = unitIds

  if (platform === "ifood") {
    const rows = await getNetworkTopItemsForMonth(year, month, limit, filter)
    return rows.map((r) => ({
      nomeItem: r.nomeItem,
      qtdVendida: r.qtdVendida,
      valorTotal: r.valorTotal,
      qtdPorDia: r.qtdPorDia,
      valorPorDia: r.valorPorDia,
    }))
  }
  if (platform === "99food") {
    const rows = await getNetworkNinefoodTopItemsForMonth(
      year,
      month,
      limit,
      filter,
    )
    return rows.map((r) => ({
      nomeItem: r.nomeItem,
      qtdVendida: r.qtdVendida,
      valorTotal: r.valorTotal,
    }))
  }
  if (platform === "cardapioweb") {
    return getNetworkCardapioWebTopItemsForMonth(year, month, limit, filter)
  }
  // Ramo explícito, não "o resto": o fall-through era o que fazia uma
  // plataforma nova devolver o ranking da Keeta com o rótulo dela.
  if (platform !== "keeta") return []
  const rows = await getNetworkKeetaTopItemsForMonth(year, month, limit, filter)
  return rows.map((r) => ({
    nomeItem: r.nomeItem,
    qtdVendida: r.qtdVendida,
    valorTotal: r.valorTotal,
  }))
}
