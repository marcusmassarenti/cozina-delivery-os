/**
 * Sync do cardápio do 99 (snapshot) → banco.
 * Pra cada loja vinculada: puxa o menu atual e regrava em
 * ninefood_api_menu_item (delete-all-da-loja + insert).
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getNinefoodStoreMenu, type NinefoodMenuItem } from "./cardapio"
import { idsDeUnidadesInativas } from "@/lib/data/unidades-inativas"

export type CardapioSyncResult = {
  appShopId: string
  name: string | null
  items: number
  indisponiveis: number
  error?: string
}

const cents = (v: number | null | undefined) => Math.round(Number(v ?? 0)) / 100

export async function syncNinefoodCardapio(opts?: {
  appShopIds?: string[]
}): Promise<{ results: CardapioSyncResult[] }> {
  const admin = createAdminClient()
  let q = admin
    .from("ninefood_store_links")
    .select("app_shop_id, name, active, unit_id")
    .eq("active", true)
  if (opts?.appShopIds?.length) q = q.in("app_shop_id", opts.appShopIds)
  const [{ data: links }, inativas] = await Promise.all([
    q,
    idsDeUnidadesInativas(),
  ])

  const results: CardapioSyncResult[] = []
  for (const link of ((links as {
    app_shop_id: string
    name: string | null
    unit_id: string | null
  }[]) ?? [])
    // Loja fechada não puxa cardápio. Link sem unidade segue entrando — é
    // como a loja nova aparece antes de ser vinculada.
    .filter((l) => !l.unit_id || !inativas.has(l.unit_id))) {
    const res: CardapioSyncResult = {
      appShopId: link.app_shop_id,
      name: link.name,
      items: 0,
      indisponiveis: 0,
    }
    try {
      const { categories, items } = await getNinefoodStoreMenu(link.app_shop_id)
      // mapa app_item_id (não-vazio) → category_name
      const catByItem = new Map<string, string>()
      for (const c of categories) {
        const name = c.category_name ?? ""
        for (const id of c.app_item_ids ?? []) {
          if (id) catByItem.set(id, name)
        }
      }
      const records = items.map((it: NinefoodMenuItem, idx: number) => ({
        app_shop_id: link.app_shop_id,
        position: idx,
        item_name: it.item_name ?? null,
        category_name:
          it.app_item_id && catByItem.has(it.app_item_id)
            ? (catByItem.get(it.app_item_id) ?? null)
            : null,
        short_desc: it.short_desc ?? null,
        price: cents(it.price),
        status: it.status ?? null,
        raw: it,
      }))
      // snapshot: zera a loja e regrava
      await admin
        .from("ninefood_api_menu_item")
        .delete()
        .eq("app_shop_id", link.app_shop_id)
      for (let i = 0; i < records.length; i += 500) {
        const { error } = await admin
          .from("ninefood_api_menu_item")
          .insert(records.slice(i, i + 500))
        if (error) throw new Error(error.message)
      }
      res.items = records.length
      res.indisponiveis = records.filter((r) => r.status === 2).length
    } catch (e) {
      res.error = e instanceof Error ? e.message : String(e)
    }
    results.push(res)
  }
  return { results }
}
