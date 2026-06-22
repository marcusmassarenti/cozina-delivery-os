import { Trophy } from "lucide-react"

import { LojaFilter } from "@/components/shared/loja-filter"
import { PeriodSelector } from "@/components/shared/period-selector"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import { getVisibleUnits } from "@/lib/data/units"
import { assertCanView } from "@/lib/auth/permissions"
import { getAccessibleUnitIds } from "@/lib/auth/roles"
import { getNetworkResultadoForMonth } from "@/lib/data/resultado"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import { formatPeriodLabel, formatRangeLabel } from "@/lib/period"
import { readPeriod } from "@/lib/period-helpers"
import { AlertTriangle } from "lucide-react"
import {
  RankingSwitcher,
  type RankingMetrica,
} from "./_components/ranking-switcher"

const VALID_METRICAS: RankingMetrica[] = [
  "faturamento",
  "ticket",
  "margem",
  "pedidos",
]

const METRICA_LABEL: Record<RankingMetrica, string> = {
  faturamento: "Faturamento",
  ticket: "Ticket médio",
  margem: "Margem",
  pedidos: "Pedidos",
}

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; inicio?: string; fim?: string; lojas?: string; metrica?: string }>
}) {
  const sp = await searchParams
  await assertCanView("relatorios")
  const { range: periodRange, year, month, isFullMonth } = readPeriod(sp)
  const metrica: RankingMetrica = VALID_METRICAS.includes(
    sp.metrica as RankingMetrica,
  )
    ? (sp.metrica as RankingMetrica)
    : "faturamento"

  const allUnits = (await getVisibleUnits())
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, code: u.code, name: u.name }))
  const lojaCodes = (sp.lojas?.split(",") ?? []).filter(Boolean)
  const accessibleIds = await getAccessibleUnitIds()
  const filterIds =
    lojaCodes.length > 0
      ? allUnits.filter((u) => lojaCodes.includes(u.code)).map((u) => u.id)
      : accessibleIds === null
        ? undefined
        : allUnits.map((u) => u.id)

  const [resultado, availablePeriods] = await Promise.all([
    getNetworkResultadoForMonth(year, month, filterIds),
    getAvailablePeriods(),
  ])

  const ticket = (bruto: number, pedidos: number) =>
    pedidos > 0 ? bruto / pedidos : 0
  const valueOf = (r: (typeof resultado.rows)[number]) => {
    switch (metrica) {
      case "ticket":
        return ticket(r.bruto, r.pedidos)
      case "margem":
        // Margem real só existe com CMV lançado. Sem custo, margemPct é só
        // repasse/bruto — não é margem. Sentinela -Infinity joga essas lojas
        // pro fim do ranking e a coluna mostra "—" (igual à coluna dedicada).
        return r.temCusto ? r.margemPct : Number.NEGATIVE_INFINITY
      case "pedidos":
        return r.pedidos
      default:
        return r.bruto
    }
  }
  const fmtMetrica = (n: number) => {
    if (metrica === "margem") return Number.isFinite(n) ? fmtPct(n) : "—"
    if (metrica === "pedidos") return fmtNum(n)
    return fmtBRL(n)
  }

  // Só lojas com faturamento entram no ranking; ordena desc pela métrica.
  const ranked = resultado.rows
    .filter((r) => r.bruto > 0)
    .map((r) => ({ row: r, value: valueOf(r) }))
    .sort((a, b) => b.value - a.value)

  const medal = (pos: number) =>
    pos === 0 ? "🥇" : pos === 1 ? "🥈" : pos === 2 ? "🥉" : null

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Trophy className="size-6 text-primary" />
            Ranking de lojas
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Lojas ordenadas por {METRICA_LABEL[metrica].toLowerCase()} ·{" "}
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
            O ranking depende do DRE (que precisa do mês inteiro pra CMV e margem). Mostrando dados do mês <strong>{formatPeriodLabel({ year, month })}</strong>.
          </span>
        </div>
      )}

      <RankingSwitcher current={metrica} />

      {ranked.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">Sem faturamento neste mês</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Importe os relatórios das plataformas em{" "}
            <a href="/importacao" className="underline">
              /importacao
            </a>{" "}
            pra montar o ranking.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="w-16 px-3 py-2.5 text-center font-medium">#</th>
                <th className="px-3 py-2.5 text-left font-medium">Loja</th>
                <th className="px-3 py-2.5 text-right font-medium">
                  {METRICA_LABEL[metrica]}
                </th>
                <th className="px-3 py-2.5 text-right font-medium">
                  Faturamento
                </th>
                <th className="px-3 py-2.5 text-right font-medium">Ticket</th>
                <th className="px-3 py-2.5 text-right font-medium">Pedidos</th>
                <th className="px-3 py-2.5 text-right font-medium">Margem</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ row: r, value }, i) => (
                <tr
                  key={r.unitId}
                  className="border-b last:border-0 hover:bg-muted/30"
                >
                  <td className="px-3 py-2.5 text-center tabular-nums">
                    {medal(i) ?? (
                      <span className="text-muted-foreground">{i + 1}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <a
                      href={`/unidades/${r.unitCode}`}
                      className="font-medium hover:underline"
                    >
                      #{r.unitCode} · {r.unitName}
                    </a>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">
                    {fmtMetrica(value)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {fmtBRL(r.bruto)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {fmtBRL(ticket(r.bruto, r.pedidos))}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {fmtNum(r.pedidos)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {r.temCusto ? fmtPct(r.margemPct) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
