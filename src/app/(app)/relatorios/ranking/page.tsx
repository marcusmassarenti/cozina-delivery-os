import { Trophy } from "lucide-react"

import { LojaFilter } from "@/components/shared/loja-filter"
import { PeriodSelector } from "@/components/shared/period-selector"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import { getVisibleUnits } from "@/lib/data/units"
import { assertCanView } from "@/lib/auth/permissions"
import { getAccessibleUnitIds } from "@/lib/auth/roles"
import { getRankingData, type RankingRow } from "@/lib/data/ranking"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import {
  formatRangeLabel,
  parsePeriodParam,
  rangeDays,
  rangeFromPeriod,
  type DateRange,
} from "@/lib/period"
import {
  RankingSwitcher,
  type RankingMetrica,
} from "./_components/ranking-switcher"
import {
  BarEmpilhadaPlataforma,
  BarFaturamentoPorLoja,
  LinhaEvolucaoRede,
  PizzaPlataforma,
} from "./_components/ranking-charts"
import { RankingRows } from "./_components/ranking-rows"

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

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Range do Ranking. Diferente do readPeriod padrão (cap de 92 dias, pensado pras
 * telas de matriz diária), aqui aceita até ~1 ano — o Ranking AGREGA por mês, então
 * ano inteiro é válido. Fallback pro mês (?periodo) ou mês corrente.
 */
function parseRankingRange(sp: {
  periodo?: string
  inicio?: string
  fim?: string
}): DateRange {
  const { inicio, fim } = sp
  if (inicio && fim && ISO_DAY.test(inicio) && ISO_DAY.test(fim) && fim >= inicio) {
    const r = { start: inicio, end: fim }
    if (rangeDays(r) <= 366) return r
  }
  return rangeFromPeriod(parsePeriodParam(sp.periodo))
}

/** Label amigável do período (mês, ano inteiro ou range). */
function periodLabel(range: { start: string; end: string }): string {
  const sy = range.start.slice(0, 4)
  // Ano inteiro: YYYY-01-01 → YYYY-12-31
  if (range.start === `${sy}-01-01` && range.end === `${sy}-12-31`) {
    return `${sy} · ano inteiro`
  }
  return formatRangeLabel(range)
}

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{
    periodo?: string
    inicio?: string
    fim?: string
    lojas?: string
    metrica?: string
  }>
}) {
  const sp = await searchParams
  await assertCanView("relatorios")
  const range = parseRankingRange(sp)
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
  // Unidades no escopo: filtro de loja > acesso do perfil > todas.
  const scopedUnits =
    lojaCodes.length > 0
      ? allUnits.filter((u) => lojaCodes.includes(u.code))
      : accessibleIds === null
        ? allUnits
        : allUnits.filter((u) => accessibleIds.includes(u.id))

  const [data, availablePeriods] = await Promise.all([
    getRankingData(range, scopedUnits),
    getAvailablePeriods(),
  ])

  const years = [...new Set(availablePeriods.map((p) => p.year))].sort(
    (a, b) => b - a,
  )

  const valueOf = (r: RankingRow): number => {
    switch (metrica) {
      case "ticket":
        return r.ticket
      case "margem":
        return r.margemPct ?? Number.NEGATIVE_INFINITY
      case "pedidos":
        return r.pedidos
      default:
        return r.bruto
    }
  }

  const ranked = data.rows
    .filter((r) => r.bruto > 0)
    .sort((a, b) => valueOf(b) - valueOf(a))

  // Destaque da coluna ordenada (substitui a antiga coluna métrica duplicada)
  const colBg = (c: RankingMetrica) => (metrica === c ? "bg-primary/5" : "")

  const t = data.totals
  // Margem da rede = média ponderada SÓ das lojas com custo lançado (senão a
  // margem de 1 loja sobre o bruto de todas ficaria enganosamente baixa).
  const comCusto = ranked.filter((r) => r.margemPct != null)
  const brutoComCusto = comCusto.reduce((s, r) => s + r.bruto, 0)
  const margemRede =
    data.marginAvailable && brutoComCusto > 0
      ? comCusto.reduce((s, r) => s + (r.margemPct! / 100) * r.bruto, 0) /
          brutoComCusto *
        100
      : null

  return (
    <div data-print="page" className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Trophy className="size-6 text-primary" />
            Ranking de lojas
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Lojas ordenadas por {METRICA_LABEL[metrica].toLowerCase()} ·{" "}
            {periodLabel(range)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-print="hide">
          <LojaFilter units={allUnits} />
          <PeriodSelector
            current={range}
            options={availablePeriods}
            enableRange
            enableYear
            years={years}
          />
        </div>
      </div>

      {!data.marginAvailable && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
          <span>
            Período parcial: faturamento, ticket e pedidos somam os dias
            escolhidos. <strong>Margem</strong> fica indisponível (o custo/CMV é
            lançado por mês inteiro).
          </span>
        </div>
      )}

      <RankingSwitcher current={metrica} />

      {ranked.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">Sem faturamento neste período</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Importe os relatórios das plataformas em{" "}
            <a href="/importacao" className="underline">
              /importacao
            </a>{" "}
            pra montar o ranking.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="w-16 px-3 py-2.5 text-center font-medium">#</th>
                  <th className="px-3 py-2.5 text-left font-medium">Loja</th>
                  <th className={`px-3 py-2.5 text-right font-medium ${colBg("faturamento")}`}>
                    Faturamento
                  </th>
                  <th className={`px-3 py-2.5 text-right font-medium ${colBg("ticket")}`}>
                    Ticket
                  </th>
                  <th className={`px-3 py-2.5 text-right font-medium ${colBg("pedidos")}`}>
                    Pedidos
                  </th>
                  <th className={`px-3 py-2.5 text-right font-medium ${colBg("margem")}`}>
                    Margem
                  </th>
                </tr>
              </thead>
              <RankingRows rows={ranked} metrica={metrica} />
              <tfoot>
                <tr className="border-t-2 bg-muted/30 font-semibold">
                  <td className="px-3 py-2.5" />
                  <td className="px-3 py-2.5 text-sm">
                    Total · {ranked.length} loja
                    {ranked.length === 1 ? "" : "s"}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${colBg("faturamento")}`}>
                    {fmtBRL(t.bruto)}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${colBg("ticket")}`}>
                    {fmtBRL(t.ticket)}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${colBg("pedidos")}`}>
                    {fmtNum(t.pedidos)}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${colBg("margem")}`}>
                    {margemRede != null ? fmtPct(margemRede) : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Gráficos */}
          <div className="grid gap-4 lg:grid-cols-2">
            <BarFaturamentoPorLoja
              data={ranked.map((r) => ({
                code: r.unitCode,
                name: r.unitName,
                value: r.bruto,
              }))}
            />
            <PizzaPlataforma perPlatform={data.platformTotals} />
            <BarEmpilhadaPlataforma
              data={ranked.map((r) => ({
                code: r.unitCode,
                name: r.unitName,
                perPlatform: r.perPlatform,
                total: r.bruto,
              }))}
            />
            {data.evolution.length > 0 && (
              <LinhaEvolucaoRede
                data={data.evolution}
                year={data.evolution[0].year}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}
