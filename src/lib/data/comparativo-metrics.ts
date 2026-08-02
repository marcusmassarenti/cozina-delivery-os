/**
 * Tipos e metadados das métricas do comparativo. SEM `server-only` — pode ser
 * importado tanto pelo Client (filtros) quanto pelo Server (data + página).
 * A função de busca (server-only) fica em `comparativo.ts`.
 */

export type ComparativoMetric =
  | "bruto"
  | "liquido"
  | "pedidos"
  | "ticket"
  | "repasse"
  | "cancelados"

export type MetricFormat = "moeda" | "numero" | "pct"

export const COMPARATIVO_METRICS: {
  key: ComparativoMetric
  label: string
  short: string
  format: MetricFormat
  /** Se true, valor maior é melhor (pra colorir crescimento). */
  maiorMelhor: boolean
}[] = [
  { key: "bruto", label: "Faturamento bruto", short: "Bruto", format: "moeda", maiorMelhor: true },
  { key: "liquido", label: "Faturamento líquido", short: "Líquido", format: "moeda", maiorMelhor: true },
  { key: "pedidos", label: "Pedidos", short: "Pedidos", format: "numero", maiorMelhor: true },
  { key: "ticket", label: "Ticket médio", short: "Ticket", format: "moeda", maiorMelhor: true },
  { key: "repasse", label: "Taxa de repasse", short: "Repasse", format: "pct", maiorMelhor: true },
  { key: "cancelados", label: "Cancelados", short: "Cancelados", format: "numero", maiorMelhor: false },
]

export type UnitMetrics = Record<ComparativoMetric, number> & {
  hasData: boolean
  /**
   * Bruto e líquido SÓ de marketplace (sem o canal próprio). É a base do
   * repasse: canal próprio não tem repasse, e somá-lo puxava o percentual
   * pra cima como se a plataforma tivesse melhorado.
   *
   * Existem porque a série de evolução refaz o repasse a partir dos totais
   * somados — sem esses dois campos ela usava bruto/líquido COM canal próprio
   * e mostrava um repasse diferente do /relatorios/comparativo, no mesmo
   * filtro. Duas telas, dois números, nada tendo mudado no meio.
   */
  brutoMarketplace?: number
  liquidoMarketplace?: number
}

/** Δ% entre dois valores (base = anterior). null se base = 0 e atual ≠ 0. */
export function deltaPct(atual: number, base: number): number | null {
  if (base === 0) return atual === 0 ? 0 : null
  return ((atual - base) / Math.abs(base)) * 100
}
