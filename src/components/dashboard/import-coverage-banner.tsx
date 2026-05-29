import { AlertTriangle, CircleCheck } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import type { ImportCoverage, PlatformCoverage } from "@/lib/data/relatorio-diario"

const MES_ABREV = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
]

/**
 * Banner de cobertura de importação no Dashboard. Mostra, por plataforma,
 * até que dia tem dado importado no mês. Marca em amarelo a plataforma que
 * está atrasada em relação à mais recente (pega lacuna de importação).
 */
export function ImportCoverageBanner({
  coverage,
  month,
  periodLabel,
}: {
  coverage: ImportCoverage
  month: number
  periodLabel: string
}) {
  const platforms: { id: PlatformId; cov: PlatformCoverage }[] = [
    { id: "ifood", cov: coverage.ifood },
    { id: "99food", cov: coverage.ninefood },
    { id: "keeta", cov: coverage.keeta },
  ]
  const withData = platforms.filter((p) => p.cov.lastDay !== null)
  const maxDay = withData.length
    ? Math.max(...withData.map((p) => p.cov.lastDay as number))
    : 0
  const isBehind = (cov: PlatformCoverage) =>
    cov.lastDay !== null && maxDay - cov.lastDay > 1

  const anyBehind = platforms.some((p) => isBehind(p.cov))
  const noData = withData.length === 0

  const tone = noData
    ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400"
    : anyBehind
      ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400"
      : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400"

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border px-3 py-2 text-xs ${tone}`}
    >
      <span className="inline-flex items-center gap-1.5 font-medium">
        {noData ? (
          <AlertTriangle className="size-3.5" />
        ) : anyBehind ? (
          <AlertTriangle className="size-3.5" />
        ) : (
          <CircleCheck className="size-3.5" />
        )}
        Cobertura de importação · {periodLabel}
      </span>

      {noData ? (
        <span>nenhum dado importado neste mês — suba os relatórios em /importacao</span>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {platforms.map((p) => {
            const behind = isBehind(p.cov)
            return (
              <span
                key={p.id}
                className={`inline-flex items-center gap-1.5 rounded-full border bg-card px-2 py-0.5 text-[11px] font-medium ${
                  behind
                    ? "border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400"
                    : "border-border text-foreground"
                }`}
              >
                <PlatformLogo platform={p.id} size="sm" />
                {p.cov.lastDay !== null
                  ? `até ${String(p.cov.lastDay).padStart(2, "0")}/${MES_ABREV[month - 1]}`
                  : "sem dados"}
                {behind && <AlertTriangle className="size-3 text-amber-600" />}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
