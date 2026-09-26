/**
 * Custo de entrega = o que a LOJA pagou de entrega, por unidade e plataforma
 * (Marcus, 25/09/26 — migration 0273, `entrega_paga_pela_loja_by_units`):
 *  - iFood : frete grátis que a loja bancou ("Promoção custeada pela loja no
 *            delivery"). A "Taxa entrega iFood" da entrega parceira é paga pelo
 *            CLIENTE — o portal a marca como informativa — e saiu da conta.
 *  - 99    : entrega cobrada da loja + frete grátis bancado. API primeiro (a
 *            régua do 99 desde a 0259); planilha só onde a API não tem.
 *  - Keeta : taxa de distância. O frete por pedido (`taxa_entrega`) é pago
 *            pelo cliente e nem entra na conta do repasse — saiu da conta.
 * Antes o card somava as duas entregas pagas pelo cliente: no CnP de set/26,
 * R$ 130,8 mil "de custo", dos quais R$ 117 mil eram do cliente.
 */

import "server-only"

import {
  mesFechadoComCache,
  TAG_99FOOD,
  TAG_FINANCEIRO_IFOOD,
  TAG_KEETA,
} from "@/lib/cache-tags"

import { createAdminClient } from "@/lib/supabase/admin"

export type DeliveryFee = {
  ifood: number
  ninefood: number
  keeta: number
  total: number
}

function emptyFee(): DeliveryFee {
  return { ifood: 0, ninefood: 0, keeta: 0, total: 0 }
}

/**
 * Custo de entrega pago pela loja, por unidade, separado por plataforma.
 * Retorna só unidades com algum custo. Mês cheio ou recorte de dias.
 */
export async function getDeliveryFeeByUnits(
  unitIds: string[],
  year: number,
  month: number,
  dateRange?: { start: string; end: string },
): Promise<Map<string, DeliveryFee>> {
  if (unitIds.length === 0) return new Map()
  // Mês fechado sai do cache; quem grava em mês fechado derruba as tags.
  const entradas = await mesFechadoComCache({
    nome: "entrega-paga-pela-loja",
    unitIds,
    year,
    month,
    recorte: dateRange ? `${dateRange.start}..${dateRange.end}` : undefined,
    tags: [TAG_FINANCEIRO_IFOOD, TAG_99FOOD, TAG_KEETA],
    calcular: async (falhas) => {
      const { data, error } = await createAdminClient().rpc(
        "entrega_paga_pela_loja_by_units",
        {
          p_unit_ids: unitIds,
          p_year: year,
          p_month: month,
          p_de: dateRange?.start ?? null,
          p_ate: dateRange?.end ?? null,
        },
      )
      if (error) {
        console.error("entrega_paga_pela_loja_by_units:", error.message)
        falhas.push(error.message)
        return [] as [string, DeliveryFee][]
      }
      return ((data ?? []) as Record<string, number | string>[]).map((r) => {
        const api = Number(r.ninefood_api) || 0
        const planilha = Number(r.ninefood_planilha) || 0
        const f: DeliveryFee = {
          ifood: Math.max(0, Number(r.ifood) || 0),
          // API primeiro (0259); planilha só onde a API não tem nada.
          ninefood: api > 0 ? api : planilha,
          keeta: Number(r.keeta) || 0,
          total: 0,
        }
        f.total = Math.round((f.ifood + f.ninefood + f.keeta) * 100) / 100
        return [String(r.unit_id), f] as [string, DeliveryFee]
      })
    },
  })
  return new Map(entradas.filter(([, f]) => f.total > 0))
}

/** Custo de entrega de 1 unidade no mês. */
export async function getDeliveryFeeForMonth(
  unitId: string,
  year: number,
  month: number,
  /** Recorte de dias do filtro. Sem ele a aba somava o mês inteiro. */
  dateRange?: { start: string; end: string },
): Promise<DeliveryFee> {
  const map = await getDeliveryFeeByUnits([unitId], year, month, dateRange)
  return map.get(unitId) ?? emptyFee()
}

/**
 * Total de custo de entrega da rede no mês (somando as unidades),
 * com breakdown por plataforma. Aceita filtro de unidades + range custom.
 */
export async function getNetworkDeliveryFee(
  unitIds: string[],
  year: number,
  month: number,
  dateRange?: { start: string; end: string },
): Promise<DeliveryFee> {
  const map = await getDeliveryFeeByUnits(unitIds, year, month, dateRange)
  const acc = emptyFee()
  for (const f of map.values()) {
    acc.ifood += f.ifood
    acc.ninefood += f.ninefood
    acc.keeta += f.keeta
  }
  acc.ifood = Math.round(acc.ifood * 100) / 100
  acc.ninefood = Math.round(acc.ninefood * 100) / 100
  acc.keeta = Math.round(acc.keeta * 100) / 100
  acc.total = Math.round((acc.ifood + acc.ninefood + acc.keeta) * 100) / 100
  return acc
}

// ─── Quem paga a entrega ──────────────────────────────────────────────

/**
 * A loja entrega com equipe própria?
 *
 * POR QUE EXISTE: sem isto, o card de entrega simplesmente SUMIA nessas lojas,
 * e some do jeito errado — o Marcus abriu o Restaurante Cardeal em 10/08/26
 * achando que faltava dado. Não faltava: a loja entrega sozinha, e aí o iFood
 * não cobra taxa de entrega dela. Não há custo porque não há serviço, não
 * porque a integração falhou. Card ausente não conta essa diferença.
 *
 * O sinal é o próprio extrato: o iFood usa uma descrição SEPARADA de comissão
 * quando a entrega é da loja. Medido no Cardeal (ago/26): 1.273 lançamentos de
 * "Comissão do iFood (entrega própria da loja)", R$ 7.283,72, e ZERO de "Taxa
 * entrega iFood" — enquanto a Pátria Pizza Matão, que usa entregador do iFood,
 * tem 241 da segunda.
 */
export type EntregaPropria = {
  pedidos: number
  comissao: number
}

export async function getEntregaPropria(
  unitIds: string[],
  year: number,
  month: number,
  dateRange?: { start: string; end: string },
): Promise<EntregaPropria | null> {
  if (!unitIds.length) return null
  const admin = createAdminClient()

  let q = admin
    .from("ifood_financeiro_lancamentos")
    .select("valor")
    .in("unit_id", unitIds)
    .eq("ref_year", year)
    .eq("ref_month", month)
    .eq("descricao_lancamento", "Comissão do iFood (entrega própria da loja)")
  if (dateRange) {
    q = q
      .gte("data_fato_gerador", dateRange.start)
      .lte("data_fato_gerador", `${dateRange.end}T23:59:59`)
  }

  const { data, error } = await q
  if (error || !data?.length) return null
  return {
    pedidos: data.length,
    comissao: data.reduce((s, r) => s + Math.abs(Number(r.valor) || 0), 0),
  }
}

/**
 * Quem BANCOU a entrega de cada pedido.
 *
 * ⚠️ A primeira versão disto perguntava "o cliente foi cobrado?" (coluna
 * taxa_entrega_cliente da planilha) e concluiu que a loja bancou 11 pedidos
 * de 7.300 — com R$ 71.868 debitados dela no mesmo mês. A contradição era o
 * próprio erro falando: no iFood, cobrar do cliente e a loja pagar convivem
 * no MESMO pedido.
 *
 * A fonte correta é o extrato, que separa as duas coisas:
 *   "Taxa entrega iFood"                      → custo da entrega
 *   "Promoção custeada pela loja no delivery" → a loja bancou aquela entrega
 * Com a régua certa, são 4.894 de 7.380 (66%).
 *
 * Na Keeta não existe campo que diga quem bancou. Ali não se afirma nada:
 * o que não dá pra provar vai pra `semInfo`, nunca creditado à loja.
 */
export type QuemPagaEntrega = {
  plataforma: "ifood" | "99food" | "keeta"
  pedidos: number
  lojaBancou: number
  clientePagou: number
  /** Pedido sem informação suficiente pra dizer quem bancou. */
  semInfo: number
  valorBancadoPelaLoja: number
  valorPagoPeloCliente: number
  /** Custo total de entrega debitado da loja. */
  custoTotalEntrega: number
  /** Cobrança extra que só existe em algumas plataformas (Keeta: distância). */
  custoExtra: number
  custoExtraLabel: string | null
}

export async function getQuemPagaEntrega(
  unitIds: string[],
  year: number,
  month: number,
  /**
   * Recorte de dias do filtro. O RPC já recebia início e fim — só o invólucro
   * é que fixava o mês inteiro, e a aba Financeiro herdava isso.
   */
  dateRange?: { start: string; end: string },
): Promise<QuemPagaEntrega[]> {
  if (!unitIds.length) return []
  const admin = createAdminClient()
  const fimDia = new Date(year, month, 0).getDate()
  const ini =
    dateRange?.start ?? `${year}-${String(month).padStart(2, "0")}-01`
  const fim =
    dateRange?.end ??
    `${year}-${String(month).padStart(2, "0")}-${String(fimDia).padStart(2, "0")}`

  const { data, error } = await admin.rpc("quem_paga_entrega", {
    p_unit_ids: unitIds,
    p_inicio: ini,
    p_fim: fim,
  })
  if (error) {
    console.error("quem_paga_entrega:", error.message)
    return []
  }

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    plataforma: String(r.plataforma) as QuemPagaEntrega["plataforma"],
    pedidos: Number(r.pedidos ?? 0),
    lojaBancou: Number(r.loja_bancou ?? 0),
    clientePagou: Number(r.cliente_pagou ?? 0),
    semInfo: Number(r.sem_info ?? 0),
    valorBancadoPelaLoja: Number(r.valor_bancado_pela_loja ?? 0),
    valorPagoPeloCliente: Number(r.valor_pago_pelo_cliente ?? 0),
    custoTotalEntrega: Number(r.custo_total_entrega ?? 0),
    custoExtra: Number(r.custo_extra ?? 0),
    custoExtraLabel: (r.custo_extra_label as string | null) ?? null,
  }))
}
