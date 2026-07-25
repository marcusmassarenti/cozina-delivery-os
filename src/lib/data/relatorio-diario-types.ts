/**
 * Tipos e constantes do Relatório Diário compartilhados entre o data layer
 * (server-only) e os componentes client. Sem `server-only` aqui.
 */

export type DailyMetric = "faturamento" | "pedidos" | "cancelamentos"
import type { PlatformId } from "@/components/platform-logo"

/**
 * Derivado de PlatformId de propósito: quando entra uma plataforma nova, o
 * compilador passa a cobrar o ramo no dispatch em vez de deixá-la cair no
 * "todas" silenciosamente.
 */
export type ReportPlatform = PlatformId | "todas"

export const PLATFORM_OPTIONS: { id: ReportPlatform; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "ifood", label: "iFood" },
  { id: "99food", label: "99 Food" },
  { id: "keeta", label: "Keeta" },
  { id: "cardapioweb", label: "Cardápio Web" },
]

export const METRIC_OPTIONS: { id: DailyMetric; label: string }[] = [
  { id: "faturamento", label: "Faturamento Bruto" },
  { id: "pedidos", label: "Pedidos" },
  { id: "cancelamentos", label: "Cancelamentos" },
]
