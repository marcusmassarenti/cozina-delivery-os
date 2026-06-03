import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { fetchAllRows } from "@/lib/data/paginate"

export type RecebidoSemana = {
  ifood: number
  ninefood: number
  keeta: number
}

/**
 * Pré-preenchimento do "Recebido" da semana, somando o que já foi importado:
 *  - iFood:  soma de todos os lançamentos financeiros (vendas − taxas = líquido)
 *  - 99 Food: soma do líquido diário (pós-taxas)
 *  - Keeta:  soma dos ganhos líquidos por pedido
 *
 * É ESTIMATIVA pelo importado — o depósito real pode ter ajustes (VR, etc.),
 * então o usuário confere/edita. Pagina pra não truncar em 1000.
 */
export async function getRecebidoSemana(
  unitId: string,
  inicio: string, // YYYY-MM-DD
  fim: string,
): Promise<RecebidoSemana> {
  const admin = createAdminClient()
  const fimTs = `${fim}T23:59:59`
  const round2 = (n: number) => Math.round(n * 100) / 100

  const [ifoodRows, nineRows, keetaRows] = await Promise.all([
    fetchAllRows<{ valor: number | string }>(
      (from, to) =>
        admin
          .from("ifood_financeiro_lancamentos")
          .select("valor")
          .eq("unit_id", unitId)
          .gte("data_fato_gerador", inicio)
          .lte("data_fato_gerador", fimTs)
          .order("id")
          .range(from, to),
      "recebido semana ifood",
    ),
    fetchAllRows<{ liquido: number | string }>(
      (from, to) =>
        admin
          .from("ninefood_daily_loja")
          .select("liquido")
          .eq("unit_id", unitId)
          .gte("data", inicio)
          .lte("data", fim)
          .order("id")
          .range(from, to),
      "recebido semana 99",
    ),
    fetchAllRows<{ ganhos_liquidos: number | string | null }>(
      (from, to) =>
        admin
          .from("keeta_pedidos")
          .select("ganhos_liquidos")
          .eq("unit_id", unitId)
          .gte("data", inicio)
          .lte("data", fim)
          .order("id")
          .range(from, to),
      "recebido semana keeta",
    ),
  ])

  return {
    ifood: round2(ifoodRows.reduce((a, r) => a + (Number(r.valor) || 0), 0)),
    ninefood: round2(
      nineRows.reduce((a, r) => a + (Number(r.liquido) || 0), 0),
    ),
    keeta: round2(
      keetaRows.reduce((a, r) => a + (Number(r.ganhos_liquidos) || 0), 0),
    ),
  }
}

export type Fechamento = {
  id: string
  unitId: string
  periodoInicio: string // YYYY-MM-DD
  periodoFim: string
  recebidoIfood: number
  recebidoKeeta: number
  recebido99: number
  creditoDebito: number
  custoProdutos: number
  custoVinagrete: number
  acerto: Record<string, unknown>
  observacoes: string | null
  createdAt: string
}

const num = (v: unknown) => (v == null ? 0 : Number(v))

function mapRow(r: Record<string, unknown>): Fechamento {
  return {
    id: r.id as string,
    unitId: r.unit_id as string,
    periodoInicio: r.periodo_inicio as string,
    periodoFim: r.periodo_fim as string,
    recebidoIfood: num(r.recebido_ifood),
    recebidoKeeta: num(r.recebido_keeta),
    recebido99: num(r.recebido_99),
    creditoDebito: num(r.credito_debito),
    custoProdutos: num(r.custo_produtos),
    custoVinagrete: num(r.custo_vinagrete),
    acerto: (r.acerto as Record<string, unknown>) ?? {},
    observacoes: (r.observacoes as string | null) ?? null,
    createdAt: r.created_at as string,
  }
}

/** Lucro líquido derivado (recebido − custos) — nunca persistido. */
export function lucroLiquido(f: {
  recebidoIfood: number
  recebidoKeeta: number
  recebido99: number
  creditoDebito: number
  custoProdutos: number
  custoVinagrete: number
}): number {
  const recebido =
    f.recebidoIfood + f.recebidoKeeta + f.recebido99 + f.creditoDebito
  return recebido - f.custoProdutos - f.custoVinagrete
}

/** Um fechamento pelo id (pra tela de impressão). */
export async function getFechamentoById(
  id: string,
): Promise<Fechamento | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("unit_fechamentos")
    .select(
      "id, unit_id, periodo_inicio, periodo_fim, recebido_ifood, recebido_keeta, recebido_99, credito_debito, custo_produtos, custo_vinagrete, acerto, observacoes, created_at",
    )
    .eq("id", id)
    .maybeSingle()
  if (error || !data) return null
  return mapRow(data as Record<string, unknown>)
}

/** Todos os fechamentos da unidade, mais recentes primeiro. */
export async function getFechamentos(unitId: string): Promise<Fechamento[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("unit_fechamentos")
    .select(
      "id, unit_id, periodo_inicio, periodo_fim, recebido_ifood, recebido_keeta, recebido_99, credito_debito, custo_produtos, custo_vinagrete, acerto, observacoes, created_at",
    )
    .eq("unit_id", unitId)
    .order("periodo_inicio", { ascending: false })
  if (error) {
    console.error("getFechamentos:", error.message)
    return []
  }
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>))
}
