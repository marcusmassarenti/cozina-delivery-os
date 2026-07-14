import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { getAccessibleUnitIds } from "@/lib/auth/roles"

/** Um ciclo de repasse (semana) da Keeta: quanto cai e quando. */
export type KeetaRepasseCiclo = {
  ciclo: string | null
  dataLiquidacao: string | null // YYYY-MM-DD
  valor: number
  liquidado: boolean
}

export type KeetaRepasseResumo = {
  total: number
  liquidado: number
  aLiquidar: number
  ciclos: KeetaRepasseCiclo[]
}

/**
 * Repasse da Keeta do mês (competência = data da transação), agrupado por
 * ciclo semanal, com a data de liquidação (quando o dinheiro cai) e se já
 * liquidou. Escopo: lojas acessíveis + filtro de loja do Caixa.
 */
export async function getKeetaRepasseResumo(
  year: number,
  month: number,
  loja?: string,
): Promise<KeetaRepasseResumo> {
  const admin = createAdminClient()
  const allowed = await getAccessibleUnitIds()

  let q = admin
    .from("keeta_repasses")
    .select("ciclo_faturamento, data_liquidacao, valor_repasse, status")
    .eq("ref_year", year)
    .eq("ref_month", month)
  if (loja && loja !== "todas" && loja !== "rede") q = q.eq("unit_id", loja)
  if (allowed !== null)
    q = q.in(
      "unit_id",
      allowed.length ? allowed : ["00000000-0000-0000-0000-000000000000"],
    )

  const { data } = await q
  const rows = data ?? []

  type Acc = { ciclo: string | null; dataLiquidacao: string | null; valor: number; liqCount: number; n: number }
  const byCiclo = new Map<string, Acc>()
  let total = 0
  let liquidado = 0

  for (const r of rows) {
    const valor = Number(r.valor_repasse) || 0
    total += valor
    const isLiq = String(r.status ?? "").toLowerCase() === "liquidado"
    if (isLiq) liquidado += valor

    const ciclo = (r.ciclo_faturamento as string | null) ?? null
    const dataLiq = (r.data_liquidacao as string | null) ?? null
    const key = ciclo ?? dataLiq ?? "—"
    let c = byCiclo.get(key)
    if (!c) {
      c = { ciclo, dataLiquidacao: dataLiq, valor: 0, liqCount: 0, n: 0 }
      byCiclo.set(key, c)
    }
    c.valor += valor
    c.n++
    if (isLiq) c.liqCount++
    if (!c.dataLiquidacao && dataLiq) c.dataLiquidacao = dataLiq
  }

  const ciclos: KeetaRepasseCiclo[] = [...byCiclo.values()]
    .map((c) => ({
      ciclo: c.ciclo,
      dataLiquidacao: c.dataLiquidacao,
      valor: Math.round(c.valor * 100) / 100,
      liquidado: c.n > 0 && c.liqCount === c.n,
    }))
    .sort((a, b) => (a.dataLiquidacao ?? "").localeCompare(b.dataLiquidacao ?? ""))

  return {
    total: Math.round(total * 100) / 100,
    liquidado: Math.round(liquidado * 100) / 100,
    aLiquidar: Math.round((total - liquidado) * 100) / 100,
    ciclos,
  }
}
