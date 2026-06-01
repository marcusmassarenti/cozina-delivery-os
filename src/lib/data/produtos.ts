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
 * Top produtos da plataforma no mês, somando as lojas escolhidas (ou a rede
 * toda se a lista vier vazia). `limit` alto pra a comparação alta/queda pegar
 * a cauda também.
 */
export async function getTopProdutos(
  platform: PlatformId,
  unitIds: string[],
  year: number,
  month: number,
  limit = 200,
): Promise<ProdutoRanking[]> {
  const filter = unitIds.length > 0 ? unitIds : undefined

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
