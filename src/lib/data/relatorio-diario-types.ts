/**
 * Tipos e constantes do Relatório Diário compartilhados entre o data layer
 * (server-only) e os componentes client. Sem `server-only` aqui.
 */

export type DailyMetric = "faturamento" | "pedidos" | "cancelamentos"
export type ReportPlatform = "ifood" | "99food" | "todas"

export const PLATFORM_OPTIONS: { id: ReportPlatform; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "ifood", label: "iFood" },
  { id: "99food", label: "99 Food" },
]

export const METRIC_OPTIONS: { id: DailyMetric; label: string }[] = [
  { id: "faturamento", label: "Faturamento Bruto" },
  { id: "pedidos", label: "Pedidos" },
  { id: "cancelamentos", label: "Cancelamentos" },
]
