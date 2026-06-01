import Link from "next/link"
import { ArrowLeft, Minus, TrendingDown, TrendingUp } from "lucide-react"

import { ExportPdfButton } from "@/components/shared/export-pdf-button"
import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { ComparativoFilters } from "../_components/comparativo-filters"
import { getUnits } from "@/lib/data/units"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import { getUnitMetricsForMonth } from "@/lib/data/comparativo"
import {
  COMPARATIVO_METRICS,
  deltaPct,
  type ComparativoMetric,
  type MetricFormat,
} from "@/lib/data/comparativo-metrics"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import {
  currentPeriod,
  formatPeriodKey,
  formatPeriodLabel,
} from "@/lib/period"

const ALL_PLAT: PlatformId[] = ["ifood", "99food", "keeta"]

function keyToYM(key: string): { year: number; month: number } {
  const [y, m] = key.split("-").map(Number)
  return { year: y, month: m }
}

function fmtMetric(v: number, f: MetricFormat): string {
  if (f === "moeda") return fmtBRL(v)
  if (f === "pct") return fmtPct(v)
  return fmtNum(v)
}

export default async function ComparativoPage({
  searchParams,
}: {
  searchParams: Promise<{
    plat?: string
    lojas?: string
    mesA?: string
    mesB?: string
    metrica?: string
  }>
}) {
  const sp = await searchParams

  const [allUnitsRaw, periodsRaw] = await Promise.all([
    getUnits(),
    getAvailablePeriods(),
  ])
  const allUnits = allUnitsRaw
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, code: u.code, name: u.name }))
  const periodOptions = periodsRaw.map((p) => ({
    key: formatPeriodKey(p),
    label: formatPeriodLabel(p),
  }))

  // --- Filtros (com defaults sensatos) ---
  const platParam = (sp.plat?.split(",") ?? []).filter((p): p is PlatformId =>
    (ALL_PLAT as string[]).includes(p),
  )
  const plataformas = platParam.length > 0 ? platParam : ALL_PLAT

  const lojaCodes = (sp.lojas?.split(",") ?? []).filter(Boolean)
  const selectedUnits =
    lojaCodes.length > 0
      ? allUnits.filter((u) => lojaCodes.includes(u.code))
      : allUnits
  const selectedIds = selectedUnits.map((u) => u.id)

  // Default: mês mais recente com dado, pulando o mês corrente (geralmente vazio).
  const currentKey = formatPeriodKey(currentPeriod())
  let defaultMesA = periodOptions[0]?.key ?? null
  if (defaultMesA === currentKey && periodOptions.length > 1) {
    defaultMesA = periodOptions[1].key
  }
  const mesA =
    sp.mesA && /^\d{4}-\d{2}$/.test(sp.mesA) ? sp.mesA : defaultMesA
  const mesB =
    sp.mesB && /^\d{4}-\d{2}$/.test(sp.mesB) && sp.mesB !== mesA
      ? sp.mesB
      : null
  const metrica: ComparativoMetric =
    COMPARATIVO_METRICS.find((m) => m.key === sp.metrica)?.key ?? "bruto"
  const focusMeta = COMPARATIVO_METRICS.find((m) => m.key === metrica)!

  const filtersInitial = {
    plataformas,
    lojas: lojaCodes,
    mesA: mesA ?? "",
    mesB,
    metrica,
  }

  // --- Dados ---
  const ymA = mesA ? keyToYM(mesA) : null
  const ymB = mesB ? keyToYM(mesB) : null
  const [metricsA, metricsB] = await Promise.all([
    ymA
      ? getUnitMetricsForMonth(selectedIds, plataformas, ymA.year, ymA.month)
      : Promise.resolve(null),
    ymB
      ? getUnitMetricsForMonth(selectedIds, plataformas, ymB.year, ymB.month)
      : Promise.resolve(null),
  ])

  // Linhas (uma por loja), ordenadas pelo indicador foco (mês A) desc.
  const rows = selectedUnits
    .map((u) => {
      const a = metricsA?.get(u.id) ?? null
      const b = metricsB?.get(u.id) ?? null
      return { unit: u, a, b }
    })
    .sort((x, y) => (y.a?.[metrica] ?? 0) - (x.a?.[metrica] ?? 0))

  const noData = !ymA

  return (
    <div data-print="page" className="flex flex-1 flex-col gap-5 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link
            href="/relatorios"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            data-print="hide"
          >
            <ArrowLeft className="size-3.5" />
            Hub de Relatórios
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Comparativo loja × loja
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {mesA ? formatPeriodLabel(keyToYM(mesA)) : "—"}
            {mesB && ` vs ${formatPeriodLabel(keyToYM(mesB))}`} ·{" "}
            {selectedUnits.length} loja{selectedUnits.length === 1 ? "" : "s"} ·{" "}
            {plataformas.length === 3
              ? "todas plataformas"
              : plataformas.join(" + ")}
          </p>
        </div>
        <div data-print="hide">
          <ExportPdfButton />
        </div>
      </div>

      <div data-print="hide">
        <ComparativoFilters
          units={allUnits.map((u) => ({ code: u.code, name: u.name }))}
          periods={periodOptions}
          initial={filtersInitial}
        />
      </div>

      {noData ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhum mês com dados ainda. Sobe relatórios em{" "}
          <span className="font-medium">/importacao</span>.
        </div>
      ) : mesB ? (
        // ===== Modo comparar A × B: foco em 1 indicador, com Δ% =====
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b px-5 py-3">
            <p className="text-sm font-semibold">
              {focusMeta.label} · {formatPeriodLabel(keyToYM(mesA!))} vs{" "}
              {formatPeriodLabel(keyToYM(mesB))}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Crescimento (▲) ou queda (▼) loja a loja
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Loja</th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    {formatPeriodLabel(keyToYM(mesA!))}
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    {formatPeriodLabel(keyToYM(mesB))}
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">Δ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ unit, a, b }) => {
                  const va = a?.[metrica] ?? 0
                  const vb = b?.[metrica] ?? 0
                  const d = deltaPct(va, vb)
                  const cresceu = d !== null && d > 0
                  const caiu = d !== null && d < 0
                  // bom = subiu quando maiorMelhor, ou caiu quando menorMelhor
                  const bom = focusMeta.maiorMelhor ? cresceu : caiu
                  const ruim = focusMeta.maiorMelhor ? caiu : cresceu
                  return (
                    <tr key={unit.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <p className="text-sm font-medium">{unit.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          #{unit.code}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                        {fmtMetric(va, focusMeta.format)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                        {fmtMetric(vb, focusMeta.format)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span
                          className={`inline-flex items-center justify-end gap-1 tabular-nums font-semibold ${
                            bom
                              ? "text-emerald-600 dark:text-emerald-400"
                              : ruim
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-muted-foreground"
                          }`}
                        >
                          {cresceu && <TrendingUp className="size-3.5" />}
                          {caiu && <TrendingDown className="size-3.5" />}
                          {!cresceu && !caiu && <Minus className="size-3.5" />}
                          {d === null ? "—" : `${d > 0 ? "+" : ""}${fmtPct(d)}`}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // ===== Modo 1 mês: todos os indicadores por loja =====
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <p className="text-sm font-semibold">
              Indicadores por loja · {formatPeriodLabel(keyToYM(mesA!))}
            </p>
            <div className="flex items-center gap-0.5">
              {plataformas.map((p) => (
                <PlatformLogo key={p} platform={p} size="sm" />
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Loja</th>
                  {COMPARATIVO_METRICS.map((m) => (
                    <th
                      key={m.key}
                      className="px-4 py-2.5 text-right font-medium"
                    >
                      {m.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ unit, a }) => (
                  <tr key={unit.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <p className="text-sm font-medium">{unit.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        #{unit.code}
                      </p>
                    </td>
                    {COMPARATIVO_METRICS.map((m) => (
                      <td
                        key={m.key}
                        className="px-4 py-2.5 text-right tabular-nums"
                      >
                        {a && a.hasData
                          ? fmtMetric(a[m.key], m.format)
                          : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
