"use client"

import { useRouter, usePathname, useSearchParams } from "next/navigation"

import { PlatformLogo } from "@/components/platform-logo"
import {
  METRIC_OPTIONS,
  PLATFORM_OPTIONS,
  type DailyMetric,
  type ReportPlatform,
} from "@/lib/data/relatorio-diario-types"

/**
 * Switchers de Métrica e Plataforma do Relatório Diário.
 * Persistem em query params `metrica` e `plataforma` (mantém `periodo`).
 */
export function RelatorioFilters({
  metric,
  platform,
}: {
  metric: DailyMetric
  platform: ReportPlatform
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function pushWith(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set(key, value)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Métrica */}
      <div className="flex items-center gap-1 rounded-md border bg-card p-1">
        {METRIC_OPTIONS.map((m) => {
          const active = m.id === metric
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => pushWith("metrica", m.id)}
              aria-pressed={active}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {m.label}
            </button>
          )
        })}
      </div>

      {/* Plataforma */}
      <div className="flex items-center gap-1 rounded-md border bg-card p-1">
        {PLATFORM_OPTIONS.map((p) => {
          const active = p.id === platform
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => pushWith("plataforma", p.id)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                active
                  ? "bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {p.id !== "todas" && <PlatformLogo platform={p.id} size="sm" />}
              {p.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
