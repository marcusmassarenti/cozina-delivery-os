import Link from "next/link"
import { ArrowLeft, Minus, TrendingDown, TrendingUp } from "lucide-react"

import { ExportPdfButton } from "@/components/shared/export-pdf-button"
import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { getVisibleUnits } from "@/lib/data/units"
import { assertCanView } from "@/lib/auth/permissions"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import { getEvolucaoSeries } from "@/lib/data/comparativo"
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
import { EvolucaoFilters } from "../_components/evolucao-filters"

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
const MES_ABREV = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
]

export default async function EvolucaoPage({
  searchParams,
}: {
  searchParams: Promise<{
    plat?: string
    lojas?: string
    de?: string
    ate?: string
    metrica?: string
  }>
}) {
  const sp = await searchParams
  await assertCanView("relatorios")

  const [allUnitsRaw, periodsRaw] = await Promise.all([
    getVisibleUnits(),
    getAvailablePeriods(),
  ])
  const allUnits = allUnitsRaw
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, code: u.code, name: u.name }))
  // Cronológico ascendente pra série.
  const periodsAsc = [...periodsRaw]
    .map((p) => ({ key: formatPeriodKey(p), year: p.year, month: p.month }))
    .sort((a, b) => a.key.localeCompare(b.key))
  const periodOptions = periodsAsc.map((p) => ({
    key: p.key,
    label: formatPeriodLabel(p),
  }))

  // --- Filtros ---
  // Só as plataformas habilitadas no tenant (default quando nenhuma no filtro).
  const tenantPlats: PlatformId[] = ALL_PLAT.filter((p) =>
    allUnitsRaw.some((u) => u.active && u.platforms.includes(p)),
  )
  const platParam = (sp.plat?.split(",") ?? []).filter((p): p is PlatformId =>
    (ALL_PLAT as string[]).includes(p),
  )
  const plataformas = platParam.length > 0 ? platParam : tenantPlats

  const lojaCodes = (sp.lojas?.split(",") ?? []).filter(Boolean)
  const selectedUnits =
    lojaCodes.length > 0
      ? allUnits.filter((u) => lojaCodes.includes(u.code))
      : allUnits
  const selectedIds = selectedUnits.map((u) => u.id)

  const firstKey = periodsAsc[0]?.key ?? null
  const lastKey = periodsAsc[periodsAsc.length - 1]?.key ?? null
  // Por padrão, não inclui o mês corrente (geralmente ainda vazio) no "até".
  const currentKey = formatPeriodKey(currentPeriod())
  let defaultAte = lastKey
  if (defaultAte === currentKey && periodsAsc.length > 1) {
    defaultAte = periodsAsc[periodsAsc.length - 2].key
  }
  const de =
    sp.de && /^\d{4}-\d{2}$/.test(sp.de) ? sp.de : (firstKey ?? "")
  const ate =
    sp.ate && /^\d{4}-\d{2}$/.test(sp.ate) ? sp.ate : (defaultAte ?? "")
  const metrica: ComparativoMetric =
    COMPARATIVO_METRICS.find((m) => m.key === sp.metrica)?.key ?? "bruto"
  const meta = COMPARATIVO_METRICS.find((m) => m.key === metrica)!

  const rangePeriods = periodsAsc.filter(
    (p) => p.key >= de && p.key <= ate,
  )

  const serie =
    rangePeriods.length > 0
      ? await getEvolucaoSeries(
          selectedIds,
          plataformas,
          rangePeriods.map((p) => ({ year: p.year, month: p.month })),
        )
      : []

  const valores = serie.map((s) => s.metrics[metrica])
  const max = Math.max(0, ...valores)
  const primeiro = valores[0] ?? 0
  const ultimo = valores[valores.length - 1] ?? 0
  const deltaTotal = serie.length >= 2 ? deltaPct(ultimo, primeiro) : null

  const lojasLabel =
    selectedUnits.length === allUnits.length
      ? "rede toda"
      : `${selectedUnits.length} loja${selectedUnits.length === 1 ? "" : "s"}`

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
            Evolução / crescimento
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {meta.label} · {lojasLabel} ·{" "}
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
        <EvolucaoFilters
          units={allUnits.map((u) => ({ code: u.code, name: u.name }))}
          periods={periodOptions}
          platforms={tenantPlats}
          initial={{ plataformas, lojas: lojaCodes, de, ate, metrica }}
        />
      </div>

      {serie.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhum mês com dados no intervalo.
        </div>
      ) : (
        <>
          {/* Resumo do período */}
          {deltaTotal !== null && (
            <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-card px-5 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {formatPeriodLabel(serie[0])} → {formatPeriodLabel(serie[serie.length - 1])}
                </p>
                <p className="mt-0.5 text-2xl font-bold tracking-tight">
                  {fmtMetric(ultimo, meta.format)}
                </p>
              </div>
              <div
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold ${
                  deltaTotal > 0
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                    : deltaTotal < 0
                      ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {deltaTotal > 0 && <TrendingUp className="size-4" />}
                {deltaTotal < 0 && <TrendingDown className="size-4" />}
                {deltaTotal === 0 && <Minus className="size-4" />}
                {deltaTotal > 0 ? "+" : ""}
                {fmtPct(deltaTotal)} no período
              </div>
              <span className="text-xs text-muted-foreground">
                de {fmtMetric(primeiro, meta.format)} pra{" "}
                {fmtMetric(ultimo, meta.format)}
              </span>
            </div>
          )}

          {/* Gráfico de barras */}
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{meta.label} por mês</p>
              <div className="flex items-center gap-0.5">
                {plataformas.map((p) => (
                  <PlatformLogo key={p} platform={p} size="sm" />
                ))}
              </div>
            </div>
            <div className="mt-8 flex h-44 items-end gap-2">
              {serie.map((s) => {
                const v = s.metrics[metrica]
                const h = max > 0 ? Math.max(1, (v / max) * 100) : 1
                return (
                  <div
                    key={`${s.year}-${s.month}`}
                    className="relative flex-1 rounded-t bg-primary/80"
                    style={{ height: `${h}%` }}
                  >
                    <span className="absolute -top-5 left-0 right-0 text-center text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {meta.format === "moeda"
                        ? fmtBRL(v).replace("R$ ", "")
                        : fmtMetric(v, meta.format)}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="mt-1.5 flex gap-2">
              {serie.map((s) => (
                <span
                  key={`lbl-${s.year}-${s.month}`}
                  className="flex-1 text-center text-[10px] font-medium text-muted-foreground"
                >
                  {MES_ABREV[s.month - 1]}/{String(s.year).slice(2)}
                </span>
              ))}
            </div>
          </div>

          {/* Tabela mês a mês */}
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="border-b px-5 py-3">
              <p className="text-sm font-semibold">Mês a mês · {meta.label}</p>
              <p className="text-[11px] text-muted-foreground">
                Δ vs o mês anterior
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">Mês</th>
                    <th className="px-4 py-2.5 text-right font-medium">
                      {meta.short}
                    </th>
                    <th className="px-4 py-2.5 text-right font-medium">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {serie.map((s, i) => {
                    const v = s.metrics[metrica]
                    const prev = i > 0 ? serie[i - 1].metrics[metrica] : null
                    const d = prev !== null ? deltaPct(v, prev) : null
                    const cresceu = d !== null && d > 0
                    const caiu = d !== null && d < 0
                    const bom = meta.maiorMelhor ? cresceu : caiu
                    const ruim = meta.maiorMelhor ? caiu : cresceu
                    return (
                      <tr
                        key={`${s.year}-${s.month}`}
                        className="border-t hover:bg-muted/30"
                      >
                        <td className="px-4 py-2.5 font-medium">
                          {formatPeriodLabel(s)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {fmtMetric(v, meta.format)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {d === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span
                              className={`inline-flex items-center justify-end gap-1 font-semibold tabular-nums ${
                                bom
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : ruim
                                    ? "text-rose-600 dark:text-rose-400"
                                    : "text-muted-foreground"
                              }`}
                            >
                              {cresceu && <TrendingUp className="size-3.5" />}
                              {caiu && <TrendingDown className="size-3.5" />}
                              {!cresceu && !caiu && (
                                <Minus className="size-3.5" />
                              )}
                              {d > 0 ? "+" : ""}
                              {fmtPct(d)}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
