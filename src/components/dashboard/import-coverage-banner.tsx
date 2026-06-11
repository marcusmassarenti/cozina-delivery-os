import { AlertTriangle, CircleCheck } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import type { ImportCoverage, PlatformCoverage } from "@/lib/data/relatorio-diario"
import { nowParts } from "@/lib/period"

import { Ninefood99QuickSync } from "./ninefood99-quick-sync"

const MES_ABREV = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
]

/** Quantos dias atrás do alvo é considerado atrasado (D-1 + 2 dias de folga). */
const ATRASO_TOLERANCIA_DIAS = 2

function parseYmd(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Banner de cobertura de importação no Dashboard. Mostra, por plataforma, até
 * que dia tem dado no mês. Cada plataforma é julgada contra um ALVO ABSOLUTO
 * de frescor (último dia do mês OU ontem, o que for menor) — não comparando as
 * plataformas entre si. Atrasado = dado mais de 2 dias atrás do alvo.
 */
export function ImportCoverageBanner({
  coverage,
  year,
  month,
  periodLabel,
}: {
  coverage: ImportCoverage
  year: number
  month: number
  periodLabel: string
}) {
  // Alvo: menor entre fim do mês e ontem (D-1). "Ontem" é calculado em horário
  // de Brasília — senão, na Vercel (UTC), depois das 21h o D-1 pula um dia.
  const monthEnd = new Date(year, month, 0)
  const today = nowParts()
  const yesterday = new Date(today.year, today.month - 1, today.day - 1)
  const target = yesterday < monthEnd ? yesterday : monthEnd

  const lagDays = (cov: PlatformCoverage): number | null => {
    if (!cov.lastDate) return null
    return Math.max(
      0,
      Math.round((target.getTime() - parseYmd(cov.lastDate).getTime()) / 86_400_000),
    )
  }
  const isBehind = (cov: PlatformCoverage) => {
    const lag = lagDays(cov)
    return lag !== null && lag > ATRASO_TOLERANCIA_DIAS
  }

  const platforms: { id: PlatformId; cov: PlatformCoverage }[] = [
    { id: "ifood", cov: coverage.ifood },
    { id: "99food", cov: coverage.ninefood },
    { id: "keeta", cov: coverage.keeta },
  ]
  const withData = platforms.filter((p) => p.cov.lastDay !== null)
  const noData = withData.length === 0
  const anyBehind = platforms.some((p) => isBehind(p.cov))

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
        {noData || anyBehind ? (
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
            const lag = lagDays(p.cov)
            return (
              <span
                key={p.id}
                title={
                  p.cov.lastDay === null
                    ? "Sem dados neste mês"
                    : behind
                      ? `Atrasado ${lag} dia${lag === 1 ? "" : "s"} em relação a ontem`
                      : "Em dia"
                }
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

      <Ninefood99QuickSync year={year} month={month} />
    </div>
  )
}
