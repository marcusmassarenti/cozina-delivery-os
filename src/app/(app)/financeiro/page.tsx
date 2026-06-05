import {
  Bike,
  DollarSign,
  Info,
  Megaphone,
  Percent,
  PiggyBank,
  Ticket,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react"

import { LojaFilter } from "@/components/shared/loja-filter"
import { PeriodSelector } from "@/components/shared/period-selector"
import { DailyTrendChart } from "./_components/daily-trend-chart"
import { PlatformLogo } from "@/components/platform-logo"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import { getDailyReportMatrix } from "@/lib/data/relatorio-diario"
import { getVisibleUnits } from "@/lib/data/units"
import { assertCanView, userCan } from "@/lib/auth/permissions"
import { getAccessibleUnitIds } from "@/lib/auth/roles"
import {
  getNetworkDrePlatforms,
  getNetworkResultadoForMonth,
} from "@/lib/data/resultado"
import { getNetworkDeliveryFee } from "@/lib/data/taxa-entrega"
import { getNetworkPagamentoResumo } from "@/lib/data/ifood-pedidos"
import { fmtBRL, fmtBRLShort, fmtNum, fmtPct } from "@/lib/format"
import { formatPeriodLabel, parsePeriodParam } from "@/lib/period"
import {
  DreDetalhado,
  type VrInfo,
} from "@/app/(app)/unidades/[codigo]/_components/dre-detalhado"
import { BrutoBreakdown } from "@/app/(app)/unidades/[codigo]/_components/bruto-breakdown"

import { ResultadoTable } from "./_components/resultado-table"

/**
 * Tela /financeiro ("DRE Grupo") — DRE consolidado da rede no mês.
 *
 * Junta faturamento importado (iFood + 99 + Keeta) com custos/VR dos
 * lançamentos manuais. Mostra KPIs, o DRE em cascata da rede e a tabela
 * ranking por unidade (clicável pro detalhe).
 */
export default async function ResultadoPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; lojas?: string }>
}) {
  const sp = await searchParams
  await assertCanView("financeiro")
  const canEditFin = await userCan("financeiro", "edit")
  const { year, month } = parsePeriodParam(sp.periodo)
  const periodoParam = sp.periodo

  const allUnits = (await getVisibleUnits())
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, code: u.code, name: u.name }))
  const lojaCodes = (sp.lojas?.split(",") ?? []).filter(Boolean)
  const accessibleIds = await getAccessibleUnitIds()
  const filterIds =
    lojaCodes.length > 0
      ? allUnits.filter((u) => lojaCodes.includes(u.code)).map((u) => u.id)
      : accessibleIds === null
        ? undefined // admin/gerente: rede inteira
        : allUnits.map((u) => u.id) // franqueado: só as lojas dele

  // Unidades no escopo (rede inteira p/ admin, ou as do franqueado/filtro) —
  // pra somar a série diária (faturamento + pedidos) na rede.
  const matrixUnits = filterIds
    ? allUnits.filter((u) => filterIds.includes(u.id))
    : allUnits

  const [resultado, drePlats, dTodas, dIfood, d99, dKeeta, availablePeriods] =
    await Promise.all([
      getNetworkResultadoForMonth(year, month, filterIds),
      getNetworkDrePlatforms(year, month, filterIds),
      getDailyReportMatrix(year, month, "todas", matrixUnits),
      getDailyReportMatrix(year, month, "ifood", matrixUnits),
      getDailyReportMatrix(year, month, "99food", matrixUnits),
      getDailyReportMatrix(year, month, "keeta", matrixUnits),
      getAvailablePeriods(),
    ])
  const { totals, rows, unitsComFaturamento, unitsComCusto } = resultado

  // Séries diárias por plataforma pro gráfico interativo (faturamento + pedidos)
  const toSeries = (m: typeof dTodas) => ({
    days: m.days,
    faturamento: m.networkByDay.faturamento,
    pedidos: m.networkByDay.pedidos,
  })
  const dailyByPlat = {
    todas: toSeries(dTodas),
    ifood: toSeries(dIfood),
    "99food": toSeries(d99),
    keeta: toSeries(dKeeta),
  }
  const dailyPlatforms = (
    [
      ["ifood", dIfood],
      ["99food", d99],
      ["keeta", dKeeta],
    ] as const
  )
    .filter(([, m]) => m.hasData)
    .map(([id]) => id)

  const hasData = rows.length > 0
  const semCusto = hasData && unitsComCusto === 0

  // Margem SEM VR (mesma definição do DRE da loja e do Resumo): líquido das
  // plataformas − CMV. O VR entra depois como ganho à parte. Recalcula aqui
  // porque totals.margemLiquida histórico inclui VR.
  const margemSemVr = totals.liquidoPlataformas - totals.cmvTotal
  const margemSemVrPct =
    totals.bruto > 0 ? (margemSemVr / totals.bruto) * 100 : 0

  // Custo de entrega das lojas com faturamento (parte das taxas das plataformas)
  const deliveryFee = hasData
    ? await getNetworkDeliveryFee(
        rows.map((r) => r.unitId),
        year,
        month,
      )
    : { ifood: 0, ninefood: 0, keeta: 0, total: 0 }
  const entregaPctBruto =
    totals.bruto > 0 ? (deliveryFee.total / totals.bruto) * 100 : 0

  // VR por bandeira (iFood) — surfa da tela Pedidos
  const pagamento = hasData
    ? await getNetworkPagamentoResumo(
        year,
        month,
        rows.map((r) => r.unitId),
      )
    : null

  // VR da rede pro DRE detalhado: líquido autoritativo (totals.vrLiquido);
  // bruto/taxa derivados pela regra dos 8% (líquido = bruto × 0,92), idêntico
  // ao detalhe da loja. Por bandeira (bruto) vem do relatório de Pedidos.
  const vrInfoRede: VrInfo | undefined =
    totals.vrLiquido > 0
      ? {
          liquido: totals.vrLiquido,
          bruto: totals.vrLiquido / 0.92,
          taxa: totals.vrLiquido / 0.92 - totals.vrLiquido,
          porBandeira: pagamento?.porBandeira ?? [],
        }
      : undefined

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">DRE Grupo</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            DRE consolidado da rede · {formatPeriodLabel({ year, month })}
            {hasData
              ? ` · ${unitsComFaturamento} loja${unitsComFaturamento !== 1 ? "s" : ""} com faturamento`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LojaFilter units={allUnits} />
          <PeriodSelector
            current={{ year, month }}
            options={availablePeriods}
          />
        </div>
      </div>

      {!hasData ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">
            Sem faturamento neste mês
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Importe os relatórios das plataformas em{" "}
            <a href="/importacao" className="underline">/importacao</a> pra ver
            o resultado consolidado da rede.
          </p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <Kpi
              icon={<DollarSign className="size-4" />}
              label="Faturamento Bruto"
              value={fmtBRLShort(totals.bruto)}
              hint={`${fmtNum(totals.pedidos)} pedidos no mês`}
            />
            <Kpi
              icon={<PiggyBank className="size-4" />}
              label="Líquido (entra na conta)"
              value={fmtBRLShort(totals.totalLiquido)}
              hint={`${fmtPct(totals.repassePct)} de repasse`}
              tone="positive"
            />
            <Kpi
              icon={<Percent className="size-4" />}
              label="Taxas das plataformas"
              value={fmtBRLShort(totals.taxasPlataforma)}
              hint={`${fmtPct(100 - totals.repassePct)} do bruto`}
              tone="warn"
            />
            <Kpi
              icon={<Bike className="size-4" />}
              label="Custo de Entrega"
              value={fmtBRLShort(deliveryFee.total)}
              hint={
                deliveryFee.total > 0
                  ? `${fmtPct(entregaPctBruto)} do bruto · dentro das taxas`
                  : "sem dado de entrega"
              }
              tone="warn"
            />
            <Kpi
              icon={<TrendingUp className="size-4" />}
              label="Margem de Lucro"
              value={semCusto ? "—" : fmtPct(margemSemVrPct)}
              hint={
                semCusto
                  ? "lance os custos pra ver a margem"
                  : `${fmtBRL(margemSemVr)} · sem VR (igual ao Resumo)`
              }
              tone={semCusto ? "neutral" : margemSemVr >= 0 ? "positive" : "negative"}
            />
          </div>

          {/* DRE da rede (detalhado, por plataforma) + composição do bruto */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <DreDetalhado
                platforms={drePlats}
                totalBruto={totals.bruto}
                totalLiquido={totals.liquidoPlataformas}
                cmv={totals.cmvTotal}
                operacao={totals.custoOperacao}
                vrInfo={vrInfoRede}
                title={`DRE da rede · ${formatPeriodLabel({ year, month })}`}
                totalLabel="Resultado total da rede"
              />
            </div>
            <BrutoBreakdown
              platforms={drePlats.map((p) => ({
                id: p.id,
                bruto: p.bruto,
                liquido: p.liquido,
              }))}
              totalBruto={totals.bruto}
              totalLiquido={totals.liquidoPlataformas}
              cmv={totals.cmvTotal}
              operacao={totals.custoOperacao}
            />
          </div>

          {/* Tendência diária da rede: faturamento + pedidos, por plataforma */}
          {dTodas.hasData && (
            <DailyTrendChart data={dailyByPlat} platforms={dailyPlatforms} />
          )}

          {semCusto && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Nenhuma loja tem custos (CMV) lançados neste mês — a margem fica
                indisponível. Edite o <strong>Custo Cozina</strong> de cada loja
                direto na tabela abaixo pra calcular o lucro real.
              </span>
            </div>
          )}

          {pagamento && pagamento.hasData && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-sm font-semibold">
                  Detalhes do iFood · relatório de Pedidos
                </h2>
                <PlatformLogo platform="ifood" size="sm" />
                <a
                  href="/pedidos"
                  className="ml-auto text-[11px] text-muted-foreground underline"
                >
                  ver em Pedidos
                </a>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {pagamento.vrPedidos > 0 && (
                  <div className="rounded-xl border bg-card p-5 shadow-sm">
                    <div className="mb-3 flex items-center gap-2">
                      <Ticket className="size-4 text-violet-600" />
                      <h3 className="text-sm font-semibold">
                        Vale-Refeição por bandeira
                      </h3>
                      <span className="ml-auto">
                        <PlatformLogo platform="ifood" size="sm" />
                      </span>
                    </div>
                    {pagamento.porBandeira.map((b) => (
                      <MiniRow
                        key={b.bandeira}
                        label={b.bandeira}
                        value={`${fmtBRL(b.valor)} · ${fmtNum(b.pedidos)} ped`}
                      />
                    ))}
                    <TotalRow
                      value={`${fmtBRL(pagamento.vrValor)} · ${fmtNum(pagamento.vrPedidos)} ped`}
                    />
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {fmtPct(pagamento.vrPct)} do pago · não entra no
                      faturamento.
                    </p>
                  </div>
                )}
                <div className="rounded-xl border bg-card p-5 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <Wallet className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Mix de pagamento</h3>
                    <span className="ml-auto">
                      <PlatformLogo platform="ifood" size="sm" />
                    </span>
                  </div>
                  {pagamento.mix.map((mx) => {
                    const pct =
                      pagamento.totalValor > 0
                        ? (mx.valor / pagamento.totalValor) * 100
                        : 0
                    return (
                      <MiniRow
                        key={mx.grupo}
                        label={mx.grupo}
                        value={`${fmtBRL(mx.valor)} · ${pct.toFixed(0)}%`}
                      />
                    )
                  })}
                  <TotalRow value={`${fmtBRL(pagamento.totalValor)} · 100%`} />
                </div>
                <div className="rounded-xl border bg-card p-5 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <Megaphone className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">
                      Promoções (quem bancou)
                    </h3>
                    <span className="ml-auto">
                      <PlatformLogo platform="ifood" size="sm" />
                    </span>
                  </div>
                  <MiniRow
                    label="iFood"
                    value={fmtBRL(pagamento.incentivoIfood)}
                  />
                  <MiniRow
                    label="Loja (investiu)"
                    value={fmtBRL(pagamento.incentivoLoja)}
                  />
                  <TotalRow
                    label="Total em promoções"
                    value={fmtBRL(
                      pagamento.incentivoIfood + pagamento.incentivoLoja,
                    )}
                  />
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    &quot;Loja&quot; = promoção que a própria loja bancou (saiu
                    do bolso dela pra atrair pedido).
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-5 shadow-sm">
                  <div className="mb-3 flex items-center gap-2">
                    <Truck className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Por turno</h3>
                    <span className="ml-auto">
                      <PlatformLogo platform="ifood" size="sm" />
                    </span>
                  </div>
                  {[...pagamento.porTurno]
                    .sort((a, b) => turnoRank(a.chave) - turnoRank(b.chave))
                    .map((tn) => (
                      <MiniRow
                        key={tn.chave}
                        label={tn.chave}
                        value={`${fmtNum(tn.pedidos)} ped`}
                      />
                    ))}
                  <TotalRow
                    value={`${fmtNum(
                      pagamento.porTurno.reduce((a, t) => a + t.pedidos, 0),
                    )} ped`}
                  />
                </div>
              </div>
            </div>
          )}

          <ResultadoTable
            rows={rows}
            totals={totals}
            periodo={periodoParam}
            year={year}
            month={month}
            canEdit={canEditFin}
          />
        </>
      )}
    </div>
  )
}

function Kpi({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  tone?: "positive" | "warn" | "negative" | "neutral"
}) {
  const valueColor =
    tone === "positive"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "warn"
        ? "text-amber-700 dark:text-amber-400"
        : tone === "negative"
          ? "text-rose-700 dark:text-rose-400"
          : "text-foreground"
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        {icon}
      </div>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-bold tracking-tight ${valueColor}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

/** Ordena turnos na sequência do dia (café → almoço → café tarde → jantar). */
const TURNO_ORDEM = [
  "cafe da manha",
  "almoco",
  "cafe da tarde",
  "jantar",
  "madrugada",
]
function turnoRank(chave: string): number {
  const norm = chave
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
  const i = TURNO_ORDEM.indexOf(norm)
  return i === -1 ? 99 : i
}

function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1">
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <span className="shrink-0 text-xs font-medium tabular-nums">{value}</span>
    </div>
  )
}

/** Linha de total no rodapé de um card (negrito, separada por borda). */
function TotalRow({
  label = "Total",
  value,
  valueClass,
}: {
  label?: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="mt-1.5 flex items-baseline justify-between gap-2 border-t pt-2">
      <span className="text-xs font-semibold">{label}</span>
      <span
        className={`shrink-0 text-sm font-bold tabular-nums ${valueClass ?? ""}`}
      >
        {value}
      </span>
    </div>
  )
}
