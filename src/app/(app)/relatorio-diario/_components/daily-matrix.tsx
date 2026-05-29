import { ChevronDown } from "lucide-react"

import type {
  DailyReportMatrix,
  UnitDailyRow,
} from "@/lib/data/relatorio-diario"
import type { DailyMetric } from "@/lib/data/relatorio-diario-types"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"

/**
 * Tabela detalhada dia a dia (dentro de <details> colapsável).
 *
 * Transposta vs a planilha original: DIAS nas linhas, LOJAS nas colunas.
 * Motivo: com ~10 lojas a tabela cabe na largura da tela (sem scroll
 * horizontal e sem coluna fixa), evitando a colisão da coluna sticky com
 * a sidebar do app. Mesma informação, layout mais amigável pra tela.
 */
export function DailyMatrix({
  matrix,
  metric,
}: {
  matrix: DailyReportMatrix
  metric: DailyMetric
}) {
  const { days, units, networkByDay } = matrix

  return (
    <details className="group rounded-xl border bg-card shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-3.5">
        <span className="text-sm font-semibold">Tabela dia a dia (detalhe)</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Ver completo
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>

      <div className="border-t">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-[10px] text-muted-foreground">
                  Dia
                </th>
                {units.map((u) => (
                  <th
                    key={u.unitId}
                    title={u.name}
                    className="px-2 py-2.5 text-right font-semibold tabular-nums text-[10px] text-muted-foreground"
                  >
                    #{u.code}
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right font-semibold uppercase tracking-wider text-[10px] text-muted-foreground">
                  Rede
                </th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => {
                const netDay = formatCell(metric, {
                  faturamento: networkByDay.faturamento[d] ?? 0,
                  pedidos: networkByDay.pedidos[d] ?? 0,
                  cancelamentos: networkByDay.cancelamentos[d] ?? 0,
                })
                return (
                  <tr key={d} className="border-b">
                    <td className="px-3 py-2 text-left font-medium tabular-nums text-muted-foreground">
                      {String(d).padStart(2, "0")}
                    </td>
                    {units.map((u) => {
                      const tone =
                        metric === "cancelamentos"
                          ? cancelTone(
                              u.cancelamentos[d] ?? 0,
                              u.pedidos[d] ?? 0,
                            )
                          : ""
                      return (
                        <td
                          key={u.unitId}
                          className={`px-2 py-2 text-right tabular-nums ${tone}`}
                        >
                          {formatCell(metric, {
                            faturamento: u.faturamento[d] ?? 0,
                            pedidos: u.pedidos[d] ?? 0,
                            cancelamentos: u.cancelamentos[d] ?? 0,
                          })}
                        </td>
                      )
                    })}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {netDay}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-muted/40 font-semibold">
                <td className="px-3 py-2.5 text-left uppercase tracking-wider text-[10px]">
                  Total
                </td>
                {units.map((u) => (
                  <td
                    key={u.unitId}
                    className="px-2 py-2.5 text-right tabular-nums"
                  >
                    {formatRowTotal(metric, u)}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {formatTotal(metric, matrix)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="border-t px-4 py-2 text-[10px] text-muted-foreground">
          Dias nas linhas, lojas nas colunas (passe o mouse no #código pra ver o
          nome).{" "}
          {metric === "faturamento"
            ? "Valores em R$."
            : metric === "pedidos"
              ? "Nº de pedidos."
              : "Taxa de cancelamento · célula colorida = taxa alta."}
        </p>
      </div>
    </details>
  )
}

function formatCell(
  metric: DailyMetric,
  v: { faturamento: number; pedidos: number; cancelamentos: number },
): string {
  if (metric === "faturamento")
    return v.faturamento > 0 ? fmtNum(Math.round(v.faturamento)) : "·"
  if (metric === "pedidos") return v.pedidos > 0 ? fmtNum(v.pedidos) : "·"
  if (v.cancelamentos === 0) return "·"
  if (v.pedidos > 0) return fmtPct((v.cancelamentos / v.pedidos) * 100)
  return fmtNum(v.cancelamentos)
}

function formatRowTotal(metric: DailyMetric, row: UnitDailyRow): string {
  if (metric === "faturamento")
    return row.totalFaturamento > 0
      ? fmtNum(Math.round(row.totalFaturamento))
      : "·"
  if (metric === "pedidos") return fmtNum(row.totalPedidos)
  return row.totalPedidos > 0
    ? fmtPct((row.totalCancelamentos / row.totalPedidos) * 100)
    : fmtNum(row.totalCancelamentos)
}

function formatTotal(metric: DailyMetric, m: DailyReportMatrix): string {
  if (metric === "faturamento") return fmtBRL(m.totalFaturamento)
  if (metric === "pedidos") return fmtNum(m.totalPedidos)
  return m.totalPedidos > 0
    ? fmtPct((m.totalCancelamentos / m.totalPedidos) * 100)
    : fmtNum(m.totalCancelamentos)
}

function cancelTone(cancel: number, pedidos: number): string {
  if (cancel === 0) return ""
  const rate = pedidos > 0 ? (cancel / pedidos) * 100 : 100
  if (rate >= 10)
    return "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
  if (rate >= 5)
    return "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
  return "text-muted-foreground"
}
