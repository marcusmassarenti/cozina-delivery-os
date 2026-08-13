import "server-only"

import type { createAdminClient } from "@/lib/supabase/admin"

/**
 * Extrai os ITENS da comanda do webhook `orderNew` da 99 Food.
 *
 * O payload sempre trouxe `data.order_info.order_items[]` com nome, quantidade
 * e preço de cada linha — e o processador lia esse array só pra contar o
 * tamanho (`contagem_item`), jogando o resto fora. Enquanto isso a Ficha
 * Técnica pedia ao cliente a planilha "Dados do item" pra reconstruir à mão o
 * que já estava no nosso banco.
 *
 * ⚠️ A IDENTIDADE NÃO PODE SER O `order_id`. Ele tem 19 dígitos e chega por
 * JSON: o `req.json()` do JS estoura a precisão de float64 e trunca o final em
 * zeros. Medido em 13/ago/26 sobre os 5.590 eventos existentes: SEIS pedidos
 * diferentes — horários, códigos e até lojas distintas — colidiam no mesmo
 * número. Usar isso como chave apagaria pedido em silêncio, e a taxa de
 * colisão só cresce com o volume.
 *
 * A chave é `app_shop_id|order_index|create_time`, que deu 5.590 distintas pra
 * 5.590 eventos — 1 pra 1, sem colisão e sem reentrega.
 *
 * ⚠️ COMPLEMENTO CONTA. `sub_item_list` vira linha com `kind='opcao'`: molho e
 * acompanhamento consomem insumo igual ao prato. E é assim que a própria 99
 * conta na planilha — confirmado comparando os mesmos dias em 6 lojas, onde
 * item+complemento bate 100,0% a 100,7% com o relatório oficial (só o prato
 * principal dava ~40%).
 *
 * NÃO grava nada de cliente. O payload traz CPF, telefone e endereço; daqui
 * pra dentro entra só o que é venda.
 */

type Admin = ReturnType<typeof createAdminClient>

export type EventoWebhook = {
  payload: {
    data?: {
      order_id?: unknown
      order_info?: Record<string, unknown>
    }
    app_shop_id?: unknown
  } | null
}

/** Centavos → reais, com 2 casas. Null quando o campo não veio. */
function reais(v: unknown): number | null {
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n) / 100 : null
}

function texto(v: unknown): string | null {
  const s = v == null ? "" : String(v).trim()
  return s === "" ? null : s
}

export async function gravarItensDoWebhook(
  admin: Admin,
  eventos: EventoWebhook[],
  unitByAppShop: Map<string, string>,
): Promise<{ linhas: number; semLoja: number }> {
  const linhas: Record<string, unknown>[] = []
  let semLoja = 0

  for (const e of eventos) {
    const data = (e.payload?.data ?? {}) as Record<string, unknown>
    const info = (data.order_info ?? {}) as Record<string, unknown>
    const shop = (info.shop ?? {}) as Record<string, unknown>
    const itens = info.order_items
    if (!Array.isArray(itens) || itens.length === 0) continue

    const appShopId = String(shop.app_shop_id ?? e.payload?.app_shop_id ?? "")
    const unitId = unitByAppShop.get(appShopId)
    if (!unitId) {
      semLoja++
      continue
    }

    const createTime = Number(info.create_time)
    if (!Number.isFinite(createTime) || createTime <= 0) continue
    const chave = `${appShopId}|${info.order_index ?? ""}|${info.create_time}`
    // A 99 manda epoch em segundos, UTC. O dia da venda é o de Brasília — sem
    // isso, pedido da madrugada cai no dia anterior no relatório.
    const dia = new Date(createTime * 1000).toLocaleDateString("en-CA", {
      timeZone: "America/Sao_Paulo",
    })
    const [ano, mes] = dia.split("-").map(Number)
    const oid99 = texto(data.order_id ?? info.order_id)

    itens.forEach((raw, i) => {
      const item = (raw ?? {}) as Record<string, unknown>
      const nome = texto(item.name)
      if (!nome) return
      linhas.push({
        unit_id: unitId,
        order_id: chave,
        order_id_99: oid99,
        kind: "item",
        item_index: i,
        parent_index: -1,
        nome_item: nome,
        grupo: null,
        quantidade: Number(item.amount ?? 1) || 1,
        preco_unitario: reais(item.sku_price),
        valor_total: reais(item.total_price),
        valor_pago: reais(item.real_price),
        data: dia,
        ref_year: ano,
        ref_month: mes,
        app_item_id: texto(item.app_item_id),
      })

      const subs = item.sub_item_list
      if (!Array.isArray(subs)) return
      subs.forEach((rawSub, j) => {
        const sub = (rawSub ?? {}) as Record<string, unknown>
        const nomeSub = texto(sub.name)
        if (!nomeSub) return
        linhas.push({
          unit_id: unitId,
          order_id: chave,
          order_id_99: oid99,
          kind: "opcao",
          item_index: j,
          parent_index: i,
          nome_item: nomeSub,
          grupo: texto(sub.content_name),
          quantidade: Number(sub.amount ?? 1) || 1,
          preco_unitario: reais(sub.sku_price),
          valor_total: reais(sub.total_price),
          valor_pago: null,
          data: dia,
          ref_year: ano,
          ref_month: mes,
          app_item_id: texto(sub.app_item_id),
        })
      })
    })
  }

  if (linhas.length === 0) return { linhas: 0, semLoja }

  // Dedupe no LOTE antes de subir. O Postgres recusa um ON CONFLICT cujo lote
  // traga a mesma chave duas vezes ("cannot affect row a second time") e
  // derruba o chunk inteiro — foi assim que 22 mil eventos ficaram parados 22
  // dias neste mesmo cron. A 99 reenvia `orderNew` do mesmo pedido.
  const porChave = new Map<string, Record<string, unknown>>()
  for (const l of linhas) {
    porChave.set(`${l.order_id}|${l.kind}|${l.parent_index}|${l.item_index}`, l)
  }
  const unicas = [...porChave.values()]

  const CHUNK = 500
  let gravadas = 0
  for (let i = 0; i < unicas.length; i += CHUNK) {
    const slice = unicas.slice(i, i + CHUNK)
    const { error } = await admin
      .from("ninefood_pedido_itens")
      .upsert(slice, { onConflict: "order_id,kind,parent_index,item_index" })
    if (error) {
      // NÃO derruba a rodada: o pedido em si já foi gravado, que é o dado que
      // sustenta faturamento. Item é enriquecimento — perder um lote dele não
      // pode fazer o cron devolver 500 e travar a fila de novo.
      console.error("gravarItensDoWebhook:", error.message)
      break
    }
    gravadas += slice.length
  }
  return { linhas: gravadas, semLoja }
}
