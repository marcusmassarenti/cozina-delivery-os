import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

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
