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

export type ProdutoRanking = {
  nomeItem: string
  qtdVendida: number
  valorTotal: number
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
  const rows = await getNetworkKeetaTopItemsForMonth(year, month, limit, filter)
  return rows.map((r) => ({
    nomeItem: r.nomeItem,
    qtdVendida: r.qtdVendida,
    valorTotal: r.valorTotal,
  }))
}
