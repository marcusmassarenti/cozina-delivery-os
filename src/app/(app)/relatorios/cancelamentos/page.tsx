import Link from "next/link"
import { ArrowLeft, AlertTriangle, Ban } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { LojaFilter } from "@/components/shared/loja-filter"
import { PeriodSelector } from "@/components/shared/period-selector"
import {
  getAvailablePeriods,
  getFinanceiroResumoByUnits,
} from "@/lib/data/ifood-imported"
import { getNinefoodResumoByUnits } from "@/lib/data/ninefood-imported"
import { getKeetaResumoByUnits } from "@/lib/data/keeta-imported"
import { getCardapioWebResumoByUnits } from "@/lib/data/cardapioweb-imported"
import { getVisibleUnits } from "@/lib/data/units"
import { assertCanView } from "@/lib/auth/permissions"
import { fmtNum, fmtPct } from "@/lib/format"
import { formatRangeLabel } from "@/lib/period"
import { readPeriod } from "@/lib/period-helpers"

export default async function CancelamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; inicio?: string; fim?: string; lojas?: string }>
}) {
  const sp = await searchParams
  await assertCanView("relatorios")
  const { range: periodRange, year, month, isFullMonth, queryRange } = readPeriod(sp)

  const allUnits = (await getVisibleUnits())
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, code: u.code, name: u.name }))
  const lojaCodes = (sp.lojas?.split(",") ?? []).filter(Boolean)
  const scoped =
    lojaCodes.length > 0
      ? allUnits.filter((u) => lojaCodes.includes(u.code))
      : allUnits
  const ids = scoped.map((u) => u.id)

  const [ifoodMap, nineMap, keetaMap, cwMap, availablePeriods] =
    await Promise.all([
      getFinanceiroResumoByUnits(ids, year, month, queryRange),
      getNinefoodResumoByUnits(ids, year, month, queryRange),
      getKeetaResumoByUnits(ids, year, month, queryRange),
      getCardapioWebResumoByUnits(ids, year, month, queryRange),
      getAvailablePeriods(),
    ])

  const rows = scoped
    .map((u) => {
      const f = ifoodMap.get(u.id)
      const n = nineMap.get(u.id)
      const k = keetaMap.get(u.id)
      const cancelIfood =
        (f?.cancelamentoTotalQtd ?? 0) + (f?.cancelamentoParcialQtd ?? 0)
      const cancel99 = n?.cancelamentosQtd ?? 0
      const cancelKeeta = k?.cancelamentosQtd ?? 0
      const c = cwMap.get(u.id)
      const cancelCw = c?.cancelamentosQtd ?? 0
      const cancelados = cancelIfood + cancel99 + cancelKeeta + cancelCw
      const pedidos =
        (f?.pedidosUnicos ?? 0) +
        (n?.pedidos ?? 0) +
        (k?.pedidos ?? 0) +
        (c?.pedidos ?? 0)
      return {
        ...u,
        pedidos,
        cancelados,
        cancelIfood,
        cancel99,
        cancelKeeta,
        cancelCw,
        taxa: pedidos > 0 ? (cancelados / pedidos) * 100 : 0,
      }
    })
    .filter((r) => r.pedidos > 0)
    .sort((a, b) => b.cancelados - a.cancelados)

  const totalCancelados = rows.reduce((a, r) => a + r.cancelados, 0)
  const totalPedidos = rows.reduce((a, r) => a + r.pedidos, 0)
  const taxaRede = totalPedidos > 0 ? (totalCancelados / totalPedidos) * 100 : 0

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
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
            <Ban className="size-6 text-primary" />
            Cancelamentos
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Pedidos cancelados por loja e plataforma ·{" "}
            {formatRangeLabel(periodRange)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LojaFilter units={allUnits} />
          <PeriodSelector
            current={periodRange}
            options={availablePeriods}
            enableRange
          />
        </div>
      </div>

      {!isFullMonth && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          <span>
            Período personalizado <strong>{formatRangeLabel(periodRange)}</strong> — cancelamentos filtram pelos dias do range.
          </span>
        </div>
      )}

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
        <>
          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="text-xs text-muted-foreground">
                Cancelados (rede)
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {fmtNum(totalCancelados)}
              </div>
            </div>
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="text-xs text-muted-foreground">
                Taxa de cancelamento
              </div>
              <div
                className={`mt-1 text-2xl font-semibold tabular-nums ${
                  taxaRede >= 5
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-foreground"
                }`}
              >
                {fmtPct(taxaRede)}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                de {fmtNum(totalPedidos)} pedidos
              </div>
            </div>
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="text-xs text-muted-foreground">
                Lojas com cancelamento
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {fmtNum(rows.filter((r) => r.cancelados > 0).length)}
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                de {fmtNum(rows.length)} com pedidos
              </div>
            </div>
          </div>

          {/* Tabela por loja */}
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="px-3 py-2.5 text-left font-medium">Loja</th>
                  <th className="px-3 py-2.5 text-right font-medium">
                    Cancelados
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium">Taxa</th>
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
                  <th className="px-3 py-2.5 text-right font-medium">
                    <span className="inline-flex items-center justify-end gap-1">
                      <PlatformLogo platform="cardapioweb" size="sm" /> Cardápio
                      Web
                    </span>
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium">Pedidos</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="px-3 py-2.5">
                      <a
                        href={`/unidades/${r.code}`}
                        className="font-medium hover:underline"
                      >
                        #{r.code} · {r.name}
                      </a>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                      {fmtNum(r.cancelados)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right tabular-nums ${
                        r.taxa >= 5
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      {fmtPct(r.taxa)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {r.cancelIfood || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {r.cancel99 || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {r.cancelKeeta || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {r.cancelCw || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {fmtNum(r.pedidos)}
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
