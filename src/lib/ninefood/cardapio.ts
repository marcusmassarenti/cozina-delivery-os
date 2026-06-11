/**
 * Cardápio do 99 Food via API operacional (openapi.didi-food.com).
 *   GET /v3/item/item/list?auth_token=...  → menus, categories, items
 *
 * Usa o token POR LOJA (getNinefoodAuthToken). Valores em CENTAVOS.
 */
import "server-only"

import { getNinefoodAuthToken } from "./auth"

const BASE = "https://openapi.didi-food.com"

export type NinefoodMenuItem = {
  app_item_id?: string
  item_name?: string
  short_desc?: string
  price?: number // centavos
  status?: number // 1 disponível · 2 indisponível
  priority?: number
  head_img?: string
}

export type NinefoodMenuCategory = {
  app_category_id?: string
  category_name?: string
  app_item_ids?: string[]
  priority?: number
}

type ListResponse = {
  errno?: number
  errmsg?: string
  data?: {
    menus?: unknown[]
    categories?: NinefoodMenuCategory[]
    items?: NinefoodMenuItem[]
  } | null
}

/** Puxa o cardápio atual de uma loja (categorias + itens). */
export async function getNinefoodStoreMenu(appShopId: string): Promise<{
  categories: NinefoodMenuCategory[]
  items: NinefoodMenuItem[]
}> {
  const token = await getNinefoodAuthToken(appShopId)
  const url = new URL(`${BASE}/v3/item/item/list`)
  url.searchParams.set("auth_token", token)
  const res = await fetch(url, { method: "GET", cache: "no-store" })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Cardápio 99 HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  let json: ListResponse
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`Cardápio 99: resposta não-JSON: ${text.slice(0, 200)}`)
  }
  if (json.errno != null && json.errno !== 0) {
    throw new Error(`Cardápio 99 errno ${json.errno}: ${json.errmsg ?? ""}`)
  }
  const d = json.data ?? {}
  return { categories: d.categories ?? [], items: d.items ?? [] }
}
