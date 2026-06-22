import { AlertTriangle, Layers } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { LojaFilter } from "@/components/shared/loja-filter"
import { PeriodSelector } from "@/components/shared/period-selector"
import {
  getAvailablePeriods,
  getFinanceiroResumoByUnits,
} from "@/lib/data/ifood-imported"
import { getNinefoodResumoByUnits } from "@/lib/data/ninefood-imported"
import { getKeetaResumoByUnits } from "@/lib/data/keeta-imported"
import { getVisibleUnits } from "@/lib/data/units"
import { assertCanView } from "@/lib/auth/permissions"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import { formatPeriodLabel, formatRangeLabel } from "@/lib/period"
import { readPeriod } from "@/lib/period-helpers"

const BAR_COLOR: Record<PlatformId, string> = {
  ifood: "bg-red-500",
  "99food": "bg-amber-400",
  keeta: "bg-violet-500",
}

export default async function PlataformasPage({
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
  // getVisibleUnits já escopa pelo perfil; aqui só aplica o filtro de lojas.
  const scoped =
    lojaCodes.length > 0
      ? allUnits.filter((u) => lojaCodes.includes(u.code))
      : allUnits
  const ids = scoped.map((u) => u.id)

  const [ifoodMap, nineMap, keetaMap, availablePeriods] = await Promise.all([
    getFinanceiroResumoByUnits(ids, year, month, queryRange),
    getNinefoodResumoByUnits(ids, year, month, queryRange),
    getKeetaResumoByUnits(ids, year, month, queryRange),
    getAvailablePeriods(),
  ])

  const sumBy = <T,>(map: Map<string, T>, pick: (v: T) => number) =>
    [...map.values()].reduce((acc, v) => acc + (pick(v) || 0), 0)

  const plats: {
    id: PlatformId
    label: string
    bruto: number
    pedidos: number
    liquido: number
  }[] = [
    {
      id: "ifood",
      label: "iFood",
      bruto: sumBy(ifoodMap, (v) => v.bruto),
      pedidos: sumBy(ifoodMap, (v) => v.pedidosUnicos),
      liquido: sumBy(ifoodMap, (v) => v.liquido),
    },
    {
      id: "99food",
      label: "99 Food",
      bruto: sumBy(nineMap, (v) => v.bruto),
      pedidos: sumBy(nineMap, (v) => v.pedidos),
      liquido: sumBy(nineMap, (v) => v.liquido),
    },
    {
      id: "keeta",
      label: "Keeta",
      bruto: sumBy(keetaMap, (v) => v.bruto),
      pedidos: sumBy(keetaMap, (v) => v.pedidos),
      liquido: sumBy(keetaMap, (v) => v.liquido),
    },
  ]

  const totalBruto = plats.reduce((a, p) => a + p.bruto, 0)
  const totalPedidos = plats.reduce((a, p) => a + p.pedidos, 0)
  const pct = (n: number) => (totalBruto > 0 ? (n / totalBruto) * 100 : 0)
  const ordered = [...plats].sort((a, b) => b.bruto - a.bruto)

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Layers className="size-6 text-primary" />
            Faturamento por plataforma
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Quanto cada plataforma representa do faturamento da rede ·{" "}
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
            Período personalizado <strong>{formatRangeLabel(periodRange)}</strong> — faturamento filtra por dia (cruzando meses se for o caso).
          </span>
        </div>
      )}

      {totalBruto === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">Sem faturamento neste mês</p>
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
          {/* Barra de participação */}
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-sm font-medium">
                Participação no faturamento
              </span>
              <span className="text-sm text-muted-foreground">
                {fmtBRL(totalBruto)} · {fmtNum(totalPedidos)} pedidos
              </span>
            </div>
            <div className="flex h-6 w-full overflow-hidden rounded-md">
              {ordered
                .filter((p) => p.bruto > 0)
                .map((p) => (
                  <div
                    key={p.id}
                    className={`${BAR_COLOR[p.id]} flex items-center justify-center text-[10px] font-semibold text-white`}
                    style={{ width: `${pct(p.bruto)}%` }}
                    title={`${p.label}: ${fmtPct(pct(p.bruto))}`}
                  >
                    {pct(p.bruto) >= 8 ? `${pct(p.bruto).toFixed(0)}%` : ""}
                  </div>
                ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {ordered.map((p) => (
                <span
                  key={p.id}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <span
                    className={`size-2.5 rounded-sm ${BAR_COLOR[p.id]}`}
                  />
                  {p.label} · {fmtPct(pct(p.bruto))}
                </span>
              ))}
            </div>
          </div>

          {/* Cards por plataforma */}
          <div className="grid gap-3 sm:grid-cols-3">
            {ordered.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border bg-card p-5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PlatformLogo platform={p.id} size="sm" />
                    <span className="text-sm font-medium">{p.label}</span>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
                    {fmtPct(pct(p.bruto))}
                  </span>
                </div>
                <div className="mt-3 text-2xl font-semibold tabular-nums">
                  {fmtBRL(p.bruto)}
                </div>
                <div className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
                  <span>{fmtNum(p.pedidos)} pedidos</span>
                  <span>{fmtBRL(p.liquido)} líquido</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
