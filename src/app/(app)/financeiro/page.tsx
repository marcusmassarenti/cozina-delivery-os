import {
  Bike,
  DollarSign,
  Info,
  Percent,
  PiggyBank,
  Ticket,
  TrendingUp,
  Wallet,
} from "lucide-react"

import { LojaFilter } from "@/components/shared/loja-filter"
import { PeriodSelector } from "@/components/shared/period-selector"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import { getVisibleUnits } from "@/lib/data/units"
import { assertCanView } from "@/lib/auth/permissions"
import { getAccessibleUnitIds } from "@/lib/auth/roles"
import { getNetworkResultadoForMonth } from "@/lib/data/resultado"
import { getNetworkDeliveryFee } from "@/lib/data/taxa-entrega"
import { getNetworkPagamentoResumo } from "@/lib/data/ifood-pedidos"
import { fmtBRL, fmtBRLShort, fmtNum, fmtPct } from "@/lib/format"
import { formatPeriodLabel, parsePeriodParam } from "@/lib/period"

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

  const [resultado, availablePeriods] = await Promise.all([
    getNetworkResultadoForMonth(year, month, filterIds),
    getAvailablePeriods(),
  ])
  const { totals, rows, unitsComFaturamento, unitsComCusto } = resultado

  const hasData = rows.length > 0
  const semCusto = hasData && unitsComCusto === 0

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
              value={semCusto ? "—" : fmtPct(totals.margemPct)}
              hint={
                semCusto
                  ? "lance os custos pra ver a margem"
                  : `${fmtBRL(totals.margemLiquida)} de margem`
              }
              tone={semCusto ? "neutral" : totals.margemLiquida >= 0 ? "positive" : "negative"}
            />
          </div>

          {/* DRE da rede + nota */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border bg-card p-5 shadow-sm lg:col-span-2">
              <div className="mb-3 flex items-center gap-2">
                <Wallet className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">
                  DRE da rede · {formatPeriodLabel({ year, month })}
                </h2>
              </div>
              <DreRow label="Faturamento bruto" value={fmtBRL(totals.bruto)} bold />
              <DreRow
                label="(−) Taxas das plataformas"
                value={`− ${fmtBRL(totals.taxasPlataforma)}`}
                muted
              />
              {deliveryFee.total > 0 && (
                <p className="-mt-1 pl-3 text-[11px] text-muted-foreground">
                  ↳ dos quais{" "}
                  <span className="font-medium">
                    {fmtBRL(deliveryFee.total)}
                  </span>{" "}
                  são taxa de entrega ({fmtPct(entregaPctBruto)} do bruto)
                </p>
              )}
              {totals.promocoesLoja > 0 && (
                <p className="-mt-1 pl-3 text-[11px] text-muted-foreground">
                  ↳ e{" "}
                  <span className="font-medium">
                    {fmtBRL(totals.promocoesLoja)}
                  </span>{" "}
                  em promoções/descontos que a loja bancou (
                  {fmtPct(
                    totals.bruto > 0
                      ? (totals.promocoesLoja / totals.bruto) * 100
                      : 0,
                  )}{" "}
                  do bruto)
                </p>
              )}
              <Divider />
              <DreRow
                label="= Líquido das plataformas"
                value={fmtBRL(totals.liquidoPlataformas)}
                bold
                highlight
              />
              {totals.vrLiquido > 0 && (
                <DreRow
                  label="(+) VR líquido (via loja)"
                  value={`+ ${fmtBRL(totals.vrLiquido)}`}
                  muted
                />
              )}
              <DreRow
                label="(−) CMV (Cozina + Loja)"
                value={
                  totals.cmvTotal > 0
                    ? `− ${fmtBRL(totals.cmvTotal)}`
                    : "sem custo lançado"
                }
                muted
              />
              <Divider />
              <DreRow
                label="= Margem líquida"
                value={
                  <span className="flex items-baseline gap-2">
                    {fmtBRL(totals.margemLiquida)}
                    {!semCusto && (
                      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                        ({fmtPct(totals.margemPct)})
                      </span>
                    )}
                  </span>
                }
                bold
                highlight={totals.custoOperacao <= 0}
              />
              {totals.custoOperacao > 0 && (
                <>
                  <DreRow
                    label="(−) Custo da operação"
                    value={`− ${fmtBRL(totals.custoOperacao)}`}
                    muted
                  />
                  <Divider />
                  <DreRow
                    label="= Resultado operacional"
                    value={
                      <span className="flex items-baseline gap-2">
                        {fmtBRL(totals.resultadoOperacional)}
                        <span
                          className={`text-xs font-semibold ${
                            totals.resultadoOperacional >= 0
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-rose-700 dark:text-rose-400"
                          }`}
                        >
                          ({fmtPct(totals.resultadoPct)})
                        </span>
                      </span>
                    }
                    bold
                    highlight
                  />
                </>
              )}
            </div>

            {/* Composição por etapa (visual) */}
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold">Pra onde vai o bruto</h2>
              <CompBar
                label="Líquido pra loja"
                value={totals.liquidoPlataformas}
                base={totals.bruto}
                color="bg-emerald-500"
              />
              <CompBar
                label="Taxas das plataformas"
                value={totals.taxasPlataforma}
                base={totals.bruto}
                color="bg-rose-500"
              />
              {totals.cmvTotal > 0 && (
                <CompBar
                  label="CMV (custo dos produtos)"
                  value={totals.cmvTotal}
                  base={totals.bruto}
                  color="bg-amber-500"
                />
              )}
              {totals.custoOperacao > 0 && (
                <CompBar
                  label="Custo da operação"
                  value={totals.custoOperacao}
                  base={totals.bruto}
                  color="bg-orange-500"
                />
              )}
              {!semCusto && (
                <CompBar
                  label={
                    totals.custoOperacao > 0
                      ? "Resultado operacional"
                      : "Margem líquida"
                  }
                  value={Math.max(
                    0,
                    totals.custoOperacao > 0
                      ? totals.resultadoOperacional
                      : totals.margemLiquida,
                  )}
                  base={totals.bruto}
                  color="bg-blue-500"
                  emphasis
                />
              )}
            </div>
          </div>

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

          {pagamento && pagamento.vrPedidos > 0 && (
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Ticket className="size-4 text-violet-600" />
                <h2 className="text-sm font-semibold">
                  Vale-Refeição por bandeira (iFood)
                </h2>
                <a
                  href="/pedidos"
                  className="ml-auto text-[11px] text-muted-foreground underline"
                >
                  ver em Pedidos
                </a>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {pagamento.porBandeira.map((b) => (
                  <div
                    key={b.bandeira}
                    className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
                  >
                    <span className="text-xs font-medium">{b.bandeira}</span>
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums">
                        {fmtBRL(b.valor)}
                      </p>
                      <p className="text-[10px] tabular-nums text-muted-foreground">
                        {fmtNum(b.pedidos)} pedidos
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Total: {fmtNum(pagamento.vrPedidos)} pedidos ·{" "}
                {fmtBRL(pagamento.vrValor)} ({fmtPct(pagamento.vrPct)} do pago) ·
                valor = total pago pelo cliente
              </p>
            </div>
          )}

          <ResultadoTable
            rows={rows}
            totals={totals}
            periodo={periodoParam}
            year={year}
            month={month}
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

function DreRow({
  label,
  value,
  bold,
  muted,
  highlight,
}: {
  label: string
  value: React.ReactNode
  bold?: boolean
  muted?: boolean
  highlight?: boolean
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-2 py-1.5 ${
        highlight ? "rounded-md bg-emerald-50 px-2 dark:bg-emerald-950/30" : ""
      }`}
    >
      <span
        className={`text-xs ${muted ? "text-muted-foreground" : ""} ${bold ? "font-semibold" : ""}`}
      >
        {label}
      </span>
      <span
        className={`text-sm tabular-nums ${
          highlight
            ? "font-bold text-emerald-700 dark:text-emerald-400"
            : bold
              ? "font-semibold"
              : ""
        } ${muted ? "text-muted-foreground" : ""}`}
      >
        {value}
      </span>
    </div>
  )
}

function Divider() {
  return <div className="my-2 h-px bg-border" />
}

function CompBar({
  label,
  value,
  base,
  color,
  emphasis,
}: {
  label: string
  value: number
  base: number
  color: string
  emphasis?: boolean
}) {
  const pct = base > 0 ? (value / base) * 100 : 0
  return (
    <div className="mb-2.5">
      <div className="mb-0.5 flex items-baseline justify-between">
        <span
          className={`text-xs ${emphasis ? "font-semibold" : "text-muted-foreground"}`}
        >
          {label}
        </span>
        <div className="flex items-baseline gap-2 tabular-nums">
          <span className="text-xs font-semibold">{fmtBRLShort(value)}</span>
          <span className="text-[10px] text-muted-foreground">
            {pct.toFixed(0)}%
          </span>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${color}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  )
}
