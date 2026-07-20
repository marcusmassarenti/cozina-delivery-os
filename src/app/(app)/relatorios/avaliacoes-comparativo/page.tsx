import Link from "next/link"
import { ArrowLeft, AlertTriangle, Star } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { LojaFilter } from "@/components/shared/loja-filter"
import { PeriodSelector } from "@/components/shared/period-selector"
import { ExportPdfButton } from "@/components/shared/export-pdf-button"
import { ReportBrandLogo } from "@/components/report-brand-logo"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import { getAvaliacoesByUnitForMonth } from "@/lib/data/avaliacoes-network"
import { getVisibleUnits } from "@/lib/data/units"
import { assertCanView } from "@/lib/auth/permissions"
import { fmtNum } from "@/lib/format"
import { formatPeriodLabel, formatRangeLabel } from "@/lib/period"
import { readPeriod } from "@/lib/period-helpers"

function notaColor(n: number | null): string {
  if (n == null) return "text-muted-foreground"
  if (n >= 4.5) return "text-emerald-600 dark:text-emerald-400"
  if (n >= 4) return "text-amber-600 dark:text-amber-400"
  return "text-rose-600 dark:text-rose-400"
}

function Nota({ n }: { n: number | null }) {
  if (n == null) return <span className="text-muted-foreground/40">—</span>
  return (
    <span className={`font-semibold tabular-nums ${notaColor(n)}`}>
      {n.toFixed(2)} ★
    </span>
  )
}

export default async function AvaliacoesComparativoPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; inicio?: string; fim?: string; lojas?: string }>
}) {
  const sp = await searchParams
  await assertCanView("relatorios")
  const { range: periodRange, year, month, isFullMonth } = readPeriod(sp)

  const allUnits = (await getVisibleUnits())
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, code: u.code, name: u.name }))
  const lojaCodes = (sp.lojas?.split(",") ?? []).filter(Boolean)
  const scoped =
    lojaCodes.length > 0
      ? allUnits.filter((u) => lojaCodes.includes(u.code))
      : allUnits
  const ids = scoped.map((u) => u.id)

  const [byUnit, availablePeriods] = await Promise.all([
    getAvaliacoesByUnitForMonth(year, month, ids),
    getAvailablePeriods(),
  ])

  const rows = byUnit
    .filter((r) => r.total > 0)
    .sort((a, b) => b.notaMedia - a.notaMedia)

  const totalAval = rows.reduce((a, r) => a + r.total, 0)
  const notaRede =
    totalAval > 0
      ? rows.reduce((a, r) => a + r.notaMedia * r.total, 0) / totalAval
      : 0

  return (
    <div data-print="page" className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <ReportBrandLogo imgClassName="h-10 w-auto print:h-12" />
          <div>
          <Link
            href="/relatorios"
            className="mb-1 inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            data-print="hide"
          >
            <ArrowLeft className="size-3.5" />
            Hub de Relatórios
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Star className="size-6 text-primary" />
            Comparativo de nota
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Nota média loja × loja, por plataforma ·{" "}
            {isFullMonth
              ? formatRangeLabel(periodRange)
              : formatPeriodLabel({ year, month })}
          </p>
        </div>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-print="hide">
          <LojaFilter units={allUnits} />
          <PeriodSelector
            current={periodRange}
            options={availablePeriods}
            enableRange
          />
          <ExportPdfButton />
        </div>
      </div>

      {!isFullMonth && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          <span>
            Avaliações são agregadas por <strong>mês</strong>. Mostrando <strong>{formatPeriodLabel({ year, month })}</strong>.
          </span>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">Sem avaliações neste mês</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Importe os relatórios de avaliação em{" "}
            <a href="/importacao" className="underline">
              /importacao
            </a>
            .
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="rounded-xl border bg-card px-5 py-4 shadow-sm">
              <div className="text-xs text-muted-foreground">
                Nota média da rede
              </div>
              <div className={`mt-1 text-2xl font-semibold ${notaColor(notaRede)}`}>
                {notaRede.toFixed(2)} ★
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {fmtNum(totalAval)} avaliações
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="w-12 px-3 py-2.5 text-center font-medium">#</th>
                  <th className="px-3 py-2.5 text-left font-medium">Loja</th>
                  <th className="px-3 py-2.5 text-right font-medium">
                    Nota média
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium">
                    Avaliações
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium">
                    <span className="inline-flex items-center justify-end gap-1">
                      <PlatformLogo platform="ifood" size="sm" /> iFood
                    </span>
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium">
                    <span className="inline-flex items-center justify-end gap-1">
                      <PlatformLogo platform="99food" size="sm" /> 99
                    </span>
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium">
                    <span className="inline-flex items-center justify-end gap-1">
                      <PlatformLogo platform="keeta" size="sm" /> Keeta
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.unitId}
                    className="border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-3 py-2.5 text-center text-muted-foreground tabular-nums">
                      {i + 1}
                    </td>
                    <td className="px-3 py-2.5">
                      <a
                        href={`/unidades/${r.unitCode}`}
                        className="font-medium hover:underline"
                      >
                        #{r.unitCode} · {r.unitName}
                      </a>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Nota n={r.notaMedia} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {fmtNum(r.total)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Nota n={r.totalIfood > 0 ? r.notaMediaIfood : null} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Nota n={r.total99 > 0 ? r.notaMedia99 : null} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Nota n={r.totalKeeta > 0 ? r.notaMediaKeeta : null} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
