import { LineChart } from "lucide-react"

import { LojaFilter } from "@/components/shared/loja-filter"
import { PeriodSelector } from "@/components/shared/period-selector"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import { getAvaliacoesByUnitForMonth } from "@/lib/data/avaliacoes-network"
import { getVisibleUnits } from "@/lib/data/units"
import { assertCanView } from "@/lib/auth/permissions"
import { fmtNum } from "@/lib/format"
import { formatPeriodLabel, parsePeriodParam } from "@/lib/period"

const MES_CURTO = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
]

function notaColor(n: number | null): string {
  if (n == null) return "text-muted-foreground"
  if (n >= 4.5) return "text-emerald-600 dark:text-emerald-400"
  if (n >= 4) return "text-amber-600 dark:text-amber-400"
  return "text-rose-600 dark:text-rose-400"
}

export default async function AvaliacoesEvolucaoPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; lojas?: string }>
}) {
  const sp = await searchParams
  await assertCanView("relatorios")
  const { year, month } = parsePeriodParam(sp.periodo)

  const allUnits = (await getVisibleUnits())
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, code: u.code, name: u.name }))
  const lojaCodes = (sp.lojas?.split(",") ?? []).filter(Boolean)
  const scoped =
    lojaCodes.length > 0
      ? allUnits.filter((u) => lojaCodes.includes(u.code))
      : allUnits
  const ids = scoped.map((u) => u.id)

  // Últimos 6 meses terminando no período selecionado.
  const periods: { year: number; month: number }[] = []
  let y = year
  let m = month
  for (let i = 0; i < 6; i++) {
    periods.unshift({ year: y, month: m })
    m -= 1
    if (m < 1) {
      m = 12
      y -= 1
    }
  }

  const [monthly, availablePeriods] = await Promise.all([
    Promise.all(
      periods.map((p) => getAvaliacoesByUnitForMonth(p.year, p.month, ids)),
    ),
    getAvailablePeriods(),
  ])

  const series = periods.map((p, i) => {
    const rows = monthly[i].filter((r) => r.total > 0)
    const total = rows.reduce((a, r) => a + r.total, 0)
    const nota =
      total > 0
        ? rows.reduce((a, r) => a + r.notaMedia * r.total, 0) / total
        : null
    return { ...p, nota, total }
  })

  const hasData = series.some((s) => s.nota != null)
  const last = series[series.length - 1]
  const prev = series[series.length - 2]
  const delta =
    last?.nota != null && prev?.nota != null ? last.nota - prev.nota : null

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <LineChart className="size-6 text-primary" />
            Evolução da nota
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Nota média da rede mês a mês · até {formatPeriodLabel({ year, month })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LojaFilter units={allUnits} />
          <PeriodSelector current={{ year, month }} options={availablePeriods} />
        </div>
      </div>

      {!hasData ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">Sem avaliações no período</p>
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
          {/* KPI atual + Δ */}
          <div className="flex flex-wrap gap-3">
            <div className="rounded-xl border bg-card px-5 py-4 shadow-sm">
              <div className="text-xs text-muted-foreground">
                Nota atual ({MES_CURTO[(last.month - 1) % 12]}/{last.year % 100})
              </div>
              <div
                className={`mt-1 text-2xl font-semibold ${notaColor(last.nota)}`}
              >
                {last.nota != null ? `${last.nota.toFixed(2)} ★` : "—"}
              </div>
              {delta != null && (
                <div
                  className={`mt-0.5 text-[11px] ${
                    delta >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(2)} vs mês
                  anterior
                </div>
              )}
            </div>
          </div>

          {/* Gráfico de barras (nota escalada 3–5) */}
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-end justify-between gap-2 sm:gap-4">
              {series.map((s) => {
                // escala visual 3.0–5.0 pra realçar a variação
                const h =
                  s.nota != null
                    ? Math.max(4, ((s.nota - 3) / 2) * 100)
                    : 0
                return (
                  <div
                    key={`${s.year}-${s.month}`}
                    className="flex flex-1 flex-col items-center gap-1.5"
                  >
                    <span
                      className={`text-xs font-semibold ${notaColor(s.nota)}`}
                    >
                      {s.nota != null ? s.nota.toFixed(2) : "—"}
                    </span>
                    <div className="flex h-32 w-full items-end justify-center">
                      <div
                        className="w-7 rounded-t bg-primary/80 transition-all sm:w-9"
                        style={{ height: `${h}%` }}
                        title={
                          s.nota != null
                            ? `${s.nota.toFixed(2)} ★ · ${fmtNum(s.total)} avaliações`
                            : "sem dados"
                        }
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {MES_CURTO[(s.month - 1) % 12]}/{s.year % 100}
                    </span>
                    <span className="text-[9px] text-muted-foreground/70">
                      {fmtNum(s.total)}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="mt-3 text-center text-[10px] text-muted-foreground">
              Barras em escala 3,0–5,0 ★ · número embaixo = avaliações no mês
            </p>
          </div>
        </>
      )}
    </div>
  )
}
