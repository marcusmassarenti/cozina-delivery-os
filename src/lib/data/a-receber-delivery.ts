import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getAccessibleUnitIds } from "@/lib/auth/roles"
import { fetchAllRows } from "@/lib/data/paginate"
import type { Loja } from "@/lib/data/caixa"

/**
 * "A receber" das plataformas de delivery, por loja.
 *
 * POR QUE EXISTE: a coluna "A receber" do Financeiro lia só `fin_entries` -- o
 * que foi digitado à mão ou veio do OFX. Como extrato bancário é dinheiro que
 * JÁ mexeu, toda linha importada nasce paga, e a coluna ficava zerada em todas
 * as lojas. Enquanto isso o repasse do iFood, da Keeta e da 99 -- que é a maior
 * fonte de receita da operação -- morava só na projeção do Fluxo de Caixa.
 * Duas telas do mesmo módulo diziam coisas diferentes com a palavra "a
 * receber".
 *
 * CONFIABILIDADE DA DATA (medido em 08/08/26 contra o extrato do BTG da JK):
 * previsto para 05/08 pela Keeta = R$ 9.713,10, creditado no banco = R$
 * 9.713,10, nas mesmas 7 linhas. Previsto pela 99 = R$ 3.776,48, creditado =
 * R$ 3.776,48. A data que a plataforma informa é a data em que o dinheiro
 * entra -- não é estimativa nossa.
 *
 * Origens, que envelhecem diferente:
 *  • iFood e 99 vêm por API, atualizadas pelo cron diário;
 *  • Keeta vem do relatório importado à mão -- confiável, mas só até a data da
 *    última importação.
 */

export type AReceberPlataformas = {
  ifood: number
  keeta: number
  ninefood: number
  total: number
}

const ZERO: AReceberPlataformas = { ifood: 0, keeta: 0, ninefood: 0, total: 0 }

/** UUID que não existe — filtro "nenhuma loja". Array vazio no PostgREST vira
 *  "sem filtro", que traria a rede inteira. */
const UNIT_INEXISTENTE = "00000000-0000-0000-0000-000000000000"

function hojeISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/**
 * Quais lojas consultar. Devolve `null` para "todas" (sem restrição de acesso).
 *
 * "rede" é escopo de holding: não tem loja, e portanto não tem repasse.
 */
function escopo(
  loja: Loja | undefined,
  allowed: string[] | null,
): { skip: boolean; units: string[] | null } {
  if (loja === "rede") return { skip: true, units: null }
  if (loja && loja !== "todas") return { skip: false, units: [loja] }
  return { skip: false, units: allowed }
}

export async function getAReceberDelivery(
  loja?: Loja,
): Promise<Map<string, AReceberPlataformas>> {
  const porLoja = new Map<string, AReceberPlataformas>()
  const allowed = await getAccessibleUnitIds()
  const e = escopo(loja, allowed)
  if (e.skip) return porLoja

  const admin = createAdminClient()
  const hoje = hojeISO()
  const unitsFiltro = e.units
    ? e.units.length
      ? e.units
      : [UNIT_INEXISTENTE]
    : null

  const em = (unitId: string): AReceberPlataformas => {
    let b = porLoja.get(unitId)
    if (!b) {
      b = { ...ZERO }
      porLoja.set(unitId, b)
    }
    return b
  }

  // iFood — 130 mil linhas pendentes em 08/08/26. Somado no banco (0166).
  const { data: ifood, error: errIfood } = await admin.rpc(
    "a_receber_ifood_por_loja",
    { p_de: hoje, p_unit_ids: unitsFiltro },
  )
  // Erro aqui não pode virar zero: "a receber R$ 0,00" se lê como loja sem
  // nada a receber, que é justamente o defeito que esta função conserta.
  if (errIfood)
    throw new Error(`a-receber-delivery: iFood — ${errIfood.message}`)
  for (const r of (ifood ?? []) as { unit_id: string; total: number | string }[]) {
    const v = Number(r.total ?? 0)
    if (v > 0) em(r.unit_id).ifood += v
  }

  // Keeta — 26 linhas pendentes; cabe numa requisição.
  //
  // ⚠️ `ilike` e não `neq`: o relatório grava "Liquidado" com inicial
  // maiúscula, e comparação exata nunca casava — o mesmo defeito que fazia o
  // Fluxo de Caixa prometer R$ 486 mil já recebidos como entrada futura.
  let qK = admin
    .from("keeta_repasses")
    .select("unit_id, valor_repasse")
    .not("data_liquidacao", "is", null)
    .not("status", "ilike", "liquidado")
  if (unitsFiltro) qK = qK.in("unit_id", unitsFiltro)
  const { data: keeta, error: errKeeta } = await qK
  if (errKeeta)
    throw new Error(`a-receber-delivery: Keeta — ${errKeeta.message}`)
  for (const r of keeta ?? []) {
    const v = Number(r.valor_repasse ?? 0)
    if (v > 0 && r.unit_id) em(r.unit_id as string).keeta += v
  }

  // 99 Food — a tabela guarda `app_shop_id`, não `unit_id`; o vínculo passa
  // pela ninefood_store_links.
  const linkQ = admin.from("ninefood_store_links").select("unit_id, app_shop_id")
  const { data: links, error: errLinks } = unitsFiltro
    ? await linkQ.in("unit_id", unitsFiltro)
    : await linkQ
  if (errLinks)
    throw new Error(`a-receber-delivery: lojas do 99 Food — ${errLinks.message}`)

  const lojaDoShop = new Map<string, string>()
  for (const l of links ?? []) {
    if (l.unit_id && l.app_shop_id)
      lojaDoShop.set(l.app_shop_id as string, l.unit_id as string)
  }
  if (lojaDoShop.size > 0) {
    const bills = await fetchAllRows<{
      app_shop_id: string | null
      settlement_amount: number | string | null
    }>(
      (from, to) =>
        admin
          .from("ninefood_api_bill")
          .select("app_shop_id, settlement_amount")
          .in("app_shop_id", [...lojaDoShop.keys()])
          .gte("expect_settle_date", hoje)
          .order("id")
          .range(from, to),
      "a-receber-delivery 99 Food",
    )
    // O valor vem COM SINAL: negativo é a 99 descontando (taxa, pacote,
    // estorno). Somo o líquido — o que a loja tem a receber é o que sobra.
    for (const b of bills) {
      const unitId = b.app_shop_id ? lojaDoShop.get(b.app_shop_id) : null
      if (!unitId) continue
      em(unitId).ninefood += Number(b.settlement_amount ?? 0)
    }
  }

  for (const b of porLoja.values()) {
    // Desconto da 99 pode passar do repasse do dia e deixar a parcela
    // negativa. "A receber" negativo não existe: o que a loja deve à 99 sai
    // pelo repasse seguinte, não vira conta a pagar.
    if (b.ninefood < 0) b.ninefood = 0
    b.total = b.ifood + b.keeta + b.ninefood
  }
  return porLoja
}

/** Soma de todas as lojas do escopo — para o card consolidado. */
export function somarPlataformas(
  porLoja: Map<string, AReceberPlataformas>,
): AReceberPlataformas {
  const t = { ...ZERO }
  for (const b of porLoja.values()) {
    t.ifood += b.ifood
    t.keeta += b.keeta
    t.ninefood += b.ninefood
    t.total += b.total
  }
  return t
}
