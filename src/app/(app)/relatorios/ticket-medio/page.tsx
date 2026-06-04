import { Receipt } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { LojaFilter } from "@/components/shared/loja-filter"
import { PeriodSelector } from "@/components/shared/period-selector"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import {
  getDailyReportMatrix,
  type DailyReportMatrix,
} from "@/lib/data/relatorio-diario"
import { getVisibleUnits } from "@/lib/data/units"
import { assertCanView } from "@/lib/auth/permissions"
import { fmtBRL, fmtNum } from "@/lib/format"
import { formatPeriodLabel, parsePeriodParam } from "@/lib/period"

export default async function TicketMedioPage({
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

  const [todas, ifood, nine, keeta, availablePeriods] = await Promise.all([
    getDailyReportMatrix(year, month, "todas", scoped),
    getDailyReportMatrix(year, month, "ifood", scoped),
    getDailyReportMatrix(year, month, "99food", scoped),
    getDailyReportMatrix(year, month, "keeta", scoped),
    getAvailablePeriods(),
  ])

  const tk = (m: DailyReportMatrix, unitId: string) => {
    const r = m.units.find((u) => u.unitId === unitId)
    return r && r.totalPedidos > 0 ? r.totalFaturamento / r.totalPedidos : 0
  }
  const pedidosDe = (unitId: string) =>
    todas.units.find((u) => u.unitId === unitId)?.totalPedidos ?? 0

  const rows = scoped
    .map((u) => ({
      code: u.code,
      name: u.name,
      geral: tk(todas, u.id),
      ifood: tk(ifood, u.id),
      nine: tk(nine, u.id),
      keeta: tk(keeta, u.id),
      pedidos: pedidosDe(u.id),
    }))
    .filter((r) => r.pedidos > 0)
    .sort((a, b) => b.geral - a.geral)

  const redeGeral =
    todas.totalPedidos > 0 ? todas.totalFaturamento / todas.totalPedidos : 0

  const cell = (v: number) =>
    v > 0 ? (
      <span className="tabular-nums">{fmtBRL(v)}</span>
    ) : (
      <span className="text-muted-foreground/50">—</span>
    )

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Receipt className="size-6 text-primary" />
            Ticket médio comparativo
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Ticket médio por loja e plataforma (faturamento ÷ pedidos) ·{" "}
            {formatPeriodLabel({ year, month })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LojaFilter units={allUnits} />
          <PeriodSelector current={{ year, month }} options={availablePeriods} />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">Sem pedidos neste mês</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Importe os relatórios das plataformas em{" "}
            <a href="/importacao" className="underline">
              /importacao
            </a>
            .
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-medium">Loja</th>
                <th className="px-3 py-2.5 text-right font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <PlatformLogo platform="ifood" size="sm" /> iFood
                  </span>
                </th>
                <th className="px-3 py-2.5 text-right font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <PlatformLogo platform="99food" size="sm" /> 99
                  </span>
                </th>
                <th className="px-3 py-2.5 text-right font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <PlatformLogo platform="keeta" size="sm" /> Keeta
                  </span>
                </th>
                <th className="px-4 py-2.5 text-right font-medium">Geral</th>
                <th className="px-3 py-2.5 text-right font-medium">Pedidos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="border-b last:border-0">
                  <td className="px-4 py-2.5 font-medium">{r.name}</td>
                  <td className="px-3 py-2.5 text-right">{cell(r.ifood)}</td>
                  <td className="px-3 py-2.5 text-right">{cell(r.nine)}</td>
                  <td className="px-3 py-2.5 text-right">{cell(r.keeta)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                    {fmtBRL(r.geral)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {fmtNum(r.pedidos)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-muted/30">
                <td className="px-4 py-2.5 font-semibold">Rede</td>
                <td colSpan={3}></td>
                <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                  {fmtBRL(redeGeral)}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-muted-foreground">
                  {fmtNum(todas.totalPedidos)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
