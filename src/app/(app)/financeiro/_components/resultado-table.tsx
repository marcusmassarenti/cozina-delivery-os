"use client"

import { useRouter } from "next/navigation"

import type { ResultadoUnitRow, ResultadoTotals } from "@/lib/data/resultado"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"

/**
 * Tabela ranking por unidade do DRE. Linha clicável → detalhe da unidade.
 * Linha de TOTAL fixa no rodapé. Client component só pela navegação no clique.
 */
export function ResultadoTable({
  rows,
  totals,
  periodo,
}: {
  rows: ResultadoUnitRow[]
  totals: ResultadoTotals
  periodo?: string
}) {
  const router = useRouter()
  const href = (code: string) =>
    `/unidades/${code}${periodo ? `?periodo=${periodo}` : ""}`

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Resultado por unidade</h3>
        <span className="text-[10px] text-muted-foreground">
          {rows.length} loja{rows.length !== 1 ? "s" : ""} · ordenado por bruto
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Unidade</th>
              <th className="px-3 py-2 text-right font-semibold">Pedidos</th>
              <th className="px-3 py-2 text-right font-semibold">Bruto</th>
              <th className="px-3 py-2 text-right font-semibold">Taxas</th>
              <th className="px-3 py-2 text-right font-semibold">Líquido</th>
              <th className="px-3 py-2 text-right font-semibold">Repasse</th>
              <th className="px-3 py-2 text-right font-semibold">CMV</th>
              <th className="px-3 py-2 text-right font-semibold">Margem</th>
              <th className="px-3 py-2 text-right font-semibold">Margem %</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr
                key={r.unitId}
                onClick={() => router.push(href(r.unitCode))}
                className="cursor-pointer hover:bg-muted/40"
              >
                <td className="px-3 py-2">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    #{r.unitCode}
                  </span>{" "}
                  <span className="font-medium">{r.unitName}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtNum(r.pedidos)}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {fmtBRL(r.bruto)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-rose-700 dark:text-rose-400">
                  − {fmtBRL(r.taxasPlataforma)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {fmtBRL(r.totalLiquido)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                  {fmtPct(r.repassePct)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.temCusto ? (
                    <span className="text-rose-700 dark:text-rose-400">
                      − {fmtBRL(r.cmvTotal)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </td>
                <td
                  className={`px-3 py-2 text-right font-semibold tabular-nums ${
                    r.margemLiquida >= 0
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-rose-700 dark:text-rose-400"
                  }`}
                >
                  {fmtBRL(r.margemLiquida)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {r.temCusto ? (
                    fmtPct(r.margemPct)
                  ) : (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 bg-muted/30 font-semibold">
              <td className="px-3 py-2.5">TOTAL · rede</td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {fmtNum(totals.pedidos)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {fmtBRL(totals.bruto)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-rose-700 dark:text-rose-400">
                − {fmtBRL(totals.taxasPlataforma)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {fmtBRL(totals.totalLiquido)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                {fmtPct(totals.repassePct)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-rose-700 dark:text-rose-400">
                {totals.cmvTotal > 0 ? `− ${fmtBRL(totals.cmvTotal)}` : "—"}
              </td>
              <td
                className={`px-3 py-2.5 text-right tabular-nums ${
                  totals.margemLiquida >= 0
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-rose-700 dark:text-rose-400"
                }`}
              >
                {fmtBRL(totals.margemLiquida)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {totals.cmvTotal > 0 ? fmtPct(totals.margemPct) : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
