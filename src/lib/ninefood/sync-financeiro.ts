/**
 * Sync do financeiro do 99 Food via API (Financial API / Bill Data) → banco.
 *
 * Pra cada loja vinculada (ninefood_store_links, active):
 *   1. garante a unidade (usa a vinculada · casa por nome · ou AUTO-CRIA)
 *   2. puxa o extrato pedido-a-pedido (getShopBillDetail, paginado)
 *   3. grava em ninefood_api_bill (upsert por app_shop_id+order_id+order_type)
 *
 * Idempotente: rodar de novo o mesmo período só atualiza as linhas existentes.
 * Valores convertidos de CENTAVOS (API) → REAIS no banco.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getAllShopBillDetail, type NinefoodBillRow } from "./financeiro"
import { idsDeUnidadesForaDoSync } from "@/lib/data/unidades-inativas"

const cents = (v: number | null | undefined) => Math.round(Number(v ?? 0)) / 100

/** "2026-05-03 09:41:36" | "2026-05-06" → "2026-05-06" (date only). */
function dateOnly(s: string | null | undefined): string | null {
  const m = String(s ?? "").match(/^\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : null
}

type StoreLink = {
  app_shop_id: string
  unit_id: string | null
  id_loja: string | null
  name: string | null
  active: boolean
}

export type ShopSyncResult = {
  appShopId: string
  name: string | null
  unitId: string | null
  unitCreated: boolean
  count: number
  /** Lançamentos (order_id+order_type) que NÃO existiam antes desta sync. */
  novos: number
  /** Σ valor dos pedidos de receita (orderType 1), em R$ */
  bruto: number
  /** Σ líquido a repassar (settlementAmount, todos os tipos), em R$ */
  liquido: number
  /** true = a loja não tinha NENHUM lançamento antes desta sync — é a
   *  estreia dela na integração (vira o aviso "loja nova conectada"). */
  primeiraSincronizacao?: boolean
  error?: string
}

function toRecord(appShopId: string, r: NinefoodBillRow) {
  return {
    app_shop_id: appShopId,
    order_id: String(r.orderId),
    order_index: r.orderIndex != null ? String(r.orderIndex) : null,
    order_type: Number(r.orderType),
    business_date: dateOnly(r.businessDateTime),
    business_ts: r.businessTs ?? null,
    expect_settle_date: dateOnly(r.expectSettleDate),
    day_payment_id: r.dayPaymentId ?? null,
    meal_original_amount: cents(r.mealOriginalAmount),
    pay_commission_amount: cents(r.payCommissionAmount),
    shop_delivery_amount: cents(r.shopDeliveryAmount),
    settlement_amount: cents(r.settlementAmount),
    payment_method: r.paymentMethod ?? null,
    raw: r,
    /* Sem isto, `synced_at` guardava a data do INSERT e nunca mais mudava — o
     * ON CONFLICT só escreve as colunas enviadas. O campo parecia dizer
     * "última verificação" e dizia "primeira vez que vi".
     *
     * Custou um diagnóstico errado em 24/08/26: li "nenhum dia foi revisitado
     * desde 19/08" e conclui que o sync tinha congelado, quando ele roda todo
     * dia. Carimbo que mente é pior que carimbo que falta. */
    synced_at: new Date().toISOString(),
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = ReturnType<typeof createAdminClient>

/** Resolve a unidade do link: usa a vinculada, casa por nome, ou auto-cria. */
async function resolveUnitForLink(
  admin: Admin,
  link: StoreLink,
  /** Mantido na assinatura: quem chama já calcula, e voltará a servir se um
   *  dia existir criação de unidade COM dono definido. */
  cityHint: string | null,
): Promise<{ unitId: string | null; created: boolean }> {
  if (link.unit_id) return { unitId: link.unit_id, created: false }

  const rawName = String(link.name ?? "").trim()
  const shortName = rawName.includes(" - ")
    ? rawName.split(" - ").slice(1).join(" - ").trim()
    : rawName

  // tenta casar com uma unidade existente pelo nome
  if (shortName) {
    const { data: match } = await admin
      .from("units")
      .select("id")
      .ilike("name", shortName)
      .limit(1)
      .maybeSingle()
    if ((match as any)?.id) {
      const id = (match as any).id as string
      await admin.from("ninefood_store_links").update({ unit_id: id }).eq("app_shop_id", link.app_shop_id)
      return { unitId: id, created: false }
    }
  }

  /**
   * ⚠️ SEM MATCH, NÃO CRIA UNIDADE. DEIXA SEM VÍNCULO.
   *
   * Aqui existia um auto-provisionamento: quando o nome não casava, criava a
   * unidade em `brand_id` pego assim —
   *
   *     .from("units").select("brand_id").not("brand_id","is",null).limit(1)
   *
   * — ou seja, o PRIMEIRO cliente que o banco devolvesse, sem nenhum contexto
   * de dono. Não é hipótese: em 18/08/26 a `cozina-brooklin-01`, do Churrasco
   * no Pote, foi criada dentro do **Churrasco Royal Poços**. Se o sync tivesse
   * seguido, o faturamento da Brooklin apareceria no painel de outro cliente.
   *
   * Numa base multi-tenant, misturar dinheiro de dois lojistas é o pior erro
   * possível — pior que ficar sem dado, porque sem dado se percebe. O caminho
   * do webhook já aplicava essa régua ("ligar a loja errada mistura o
   * faturamento de dois lojistas, e isso é bem pior que esperar alguém fazer à
   * mão"); esta função não aplicava.
   *
   * Sem vínculo a loja aparece em `sincronizarLojas99().semVinculo` e no
   * relatório de saúde, esperando um clique que diz de quem ela é.
   */
  void cityHint
  console.warn(
    `[99] loja ${link.app_shop_id} autorizada e sem unidade correspondente — precisa de vínculo manual`,
  )
  return { unitId: null, created: false }
}

/**
 * Sincroniza o financeiro do 99 das lojas vinculadas, num período.
 *
 * Datas em YYYYMMDD. O filtro da API é pela DATA DO PEDIDO (businessDateTime),
 * não pela do repasse — o comentário aqui dizia o contrário e estava errado.
 * Verificado em 24/08/26 chamando a API: pedir 20260803→20260803 devolve 20
 * linhas, todas com businessDateTime de 03/08 e expectSettleDate de 12/08.
 *
 * ⚠️ Limites documentados da API: janela máxima de 31 DIAS por chamada
 * (errno 110005) e histórico de 3 MESES (errno 110004). Pedir o mês inteiro
 * fica exatamente no teto num mês de 31 dias — sem folga nenhuma.
 */
export async function syncNinefoodFinanceiro(opts: {
  startDate: string
  endDate: string
  appShopIds?: string[]
}): Promise<{ results: ShopSyncResult[]; startDate: string; endDate: string }> {
  const admin = createAdminClient()
  let q = admin
    .from("ninefood_store_links")
    .select("app_shop_id, unit_id, id_loja, name, active")
    .eq("active", true)
  if (opts.appShopIds?.length) q = q.in("app_shop_id", opts.appShopIds)
  const [{ data: links }, inativas] = await Promise.all([
    q,
    idsDeUnidadesForaDoSync(),
  ])

  const results: ShopSyncResult[] = []
  for (const link of (((links as any[]) ?? []) as StoreLink[])
    // Loja fechada não sincroniza. Link SEM unidade continua entrando: é
    // assim que a loja nova é descoberta e vinculada na primeira rodada.
    .filter((l) => !l.unit_id || !inativas.has(l.unit_id))) {
    const res: ShopSyncResult = {
      appShopId: link.app_shop_id,
      name: link.name,
      unitId: link.unit_id,
      unitCreated: false,
      count: 0,
      novos: 0,
      bruto: 0,
      liquido: 0,
    }
    try {
      const rows = await getAllShopBillDetail({
        appShopId: link.app_shop_id,
        startDate: opts.startDate,
        endDate: opts.endDate,
      })
      const cityHint = rows[0]?.cityName ?? null
      const { unitId, created } = await resolveUnitForLink(admin, link, cityHint)
      res.unitId = unitId
      res.unitCreated = created

      const records = rows.map((r) => toRecord(link.app_shop_id, r))

      // "Dado novo": antes de gravar, descobre quais (order_id, order_type) já
      // existiam pra essa loja. O que sobrar é genuinamente novo (a tabela é
      // upsert, então rodar de novo não infla — só reescreve os já-presentes).
      // Estreia? Sem NENHUM lançamento anterior (qualquer período) = loja
      // recém-conectada — o dialog destaca com "nova loja".
      const { count: jaTinhaAlgo } = await admin
        .from("ninefood_api_bill")
        .select("order_id", { count: "exact", head: true })
        .eq("app_shop_id", link.app_shop_id)
      res.primeiraSincronizacao = (jaTinhaAlgo ?? 0) === 0 && records.length > 0

      const existing = new Set<string>()
      for (let i = 0; i < records.length; i += 500) {
        const ids = records.slice(i, i + 500).map((r) => r.order_id)
        const { data: ex } = await admin
          .from("ninefood_api_bill")
          .select("order_id, order_type")
          .eq("app_shop_id", link.app_shop_id)
          .in("order_id", ids)
        for (const e of ((ex as any[]) ?? []))
          existing.add(`${e.order_id}|${e.order_type}`)
      }
      res.novos = records.filter(
        (r) => !existing.has(`${r.order_id}|${r.order_type}`),
      ).length

      for (let i = 0; i < records.length; i += 500) {
        const { error } = await admin
          .from("ninefood_api_bill")
          .upsert(records.slice(i, i + 500), { onConflict: "app_shop_id,order_id,order_type" })
        if (error) throw new Error(error.message)
      }
      res.count = records.length
      res.bruto = records
        .filter((r) => r.order_type === 1)
        .reduce((s, r) => s + r.meal_original_amount, 0)
      res.liquido = records.reduce((s, r) => s + r.settlement_amount, 0)

      /**
       * Deixa rastro no Histórico de Importações — o iFood e o Cardápio Web já
       * deixavam, o 99 não deixava nenhum.
       *
       * Não é só a tela. `source: "api"` é a ÚNICA prova de que a plataforma
       * respondeu de verdade, e é nela que a varredura do e-mail "sua loja está
       * conectada" se apoia (vínculo não prova nada: o Marmitex Faisão tinha
       * vínculo e a API devolvia 403). Sem esta linha, loja do 99 conectava e
       * o cliente nunca era avisado — silenciosamente, que é o pior jeito.
       *
       * Só grava quando ALGO entrou: linha de "0 registros" todo dia vira ruído
       * e enterra o que importa.
       */
      if (unitId && records.length > 0) {
        const ini = opts.startDate
        await admin.from("platform_imports").insert({
          unit_id: unitId,
          platform: "99food",
          report_type: "api",
          cadencia: "mensal",
          ref_year: Number(ini.slice(0, 4)),
          ref_month: Number(ini.slice(4, 6)),
          rows_imported: records.length,
          status: "success",
          source: "api",
          source_filename: null,
        })
      }
    } catch (e) {
      res.error = e instanceof Error ? e.message : String(e)
    }
    results.push(res)
  }
  return { results, startDate: opts.startDate, endDate: opts.endDate }
}
