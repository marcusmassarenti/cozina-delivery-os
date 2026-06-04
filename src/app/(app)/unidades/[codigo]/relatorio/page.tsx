import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { ExportPdfButton } from "@/components/shared/export-pdf-button"
import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { getUnitByCode, getUnitPlatforms } from "@/lib/data/units"
import { getAccessibleUnitIds } from "@/lib/auth/permissions"
import { getRealMonthlyForUnits } from "@/lib/data/lancamentos"
import {
  getAvaliacoesResumoForMonth,
  getCardapioPeriodoForMonth,
  getFunnelForMonth,
  getItemsRankingForMonth,
} from "@/lib/data/ifood-imported"
import { getNinefoodAvaliacoesResumoForMonth } from "@/lib/data/ninefood-imported"
import { getKeetaAvaliacoesResumoForMonth } from "@/lib/data/keeta-imported"
import { getDeliveryFeeByUnits } from "@/lib/data/taxa-entrega"
import { getDailyReportMatrix } from "@/lib/data/relatorio-diario"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import { emptyMonthly } from "@/lib/mock-monthly"
import { formatPeriodLabel, parsePeriodParam } from "@/lib/period"

const PLATS: { id: PlatformId; label: string }[] = [
  { id: "ifood", label: "iFood" },
  { id: "99food", label: "99 Food" },
  { id: "keeta", label: "Keeta" },
]

export default async function RelatorioMensalUnidade({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string }>
  searchParams: Promise<{ periodo?: string }>
}) {
  const { codigo } = await params
  const sp = await searchParams
  const unit = await getUnitByCode(codigo)
  if (!unit) notFound()

  // Acesso: franqueado só abre o relatório da PRÓPRIA loja (null = holding/admin).
  const accessibleIds = await getAccessibleUnitIds()
  if (accessibleIds !== null && !accessibleIds.includes(unit.id)) notFound()

  const { year, month } = parsePeriodParam(sp.periodo)
  const periodLabel = formatPeriodLabel({ year, month })
  const unitLite = [{ id: unit.id, code: unit.code, name: unit.name }]

  const [
    platforms,
    monthlyMap,
    avalIf,
    avalNine,
    avalKeeta,
    funnel,
    topItens,
    cardapioPeriodo,
    feeMap,
    matIf,
    mat99,
    matKe,
  ] = await Promise.all([
    getUnitPlatforms(unit.id),
    getRealMonthlyForUnits([unit.id], year, month),
    getAvaliacoesResumoForMonth(unit.id, year, month),
    getNinefoodAvaliacoesResumoForMonth(unit.id, year, month),
    getKeetaAvaliacoesResumoForMonth(unit.id, year, month),
    getFunnelForMonth(unit.id, year, month),
    getItemsRankingForMonth(unit.id, year, month, 15),
    getCardapioPeriodoForMonth(unit.id, year, month),
    getDeliveryFeeByUnits([unit.id], year, month),
    getDailyReportMatrix(year, month, "ifood", unitLite),
    getDailyReportMatrix(year, month, "99food", unitLite),
    getDailyReportMatrix(year, month, "keeta", unitLite),
  ])

  const m = monthlyMap.get(unit.id) ?? emptyMonthly
  const fee = feeMap.get(unit.id) ?? { ifood: 0, ninefood: 0, keeta: 0, total: 0 }

  // Nota média ponderada das 3 plataformas com avaliação.
  const notaParts = [
    { total: avalIf.total, nota: avalIf.notaMedia },
    { total: avalNine.total, nota: avalNine.notaMedia },
    { total: avalKeeta.total, nota: avalKeeta.notaMedia },
  ].filter((p) => p.total > 0)
  const notasTotal = notaParts.reduce((a, p) => a + p.total, 0)
  const notaMedia =
    notasTotal > 0
      ? notaParts.reduce((a, p) => a + p.nota * p.total, 0) / notasTotal
      : 0

  // DRE (espelha o detalhe da loja).
  const bruto = m.faturamentoBruto
  const taxas = Math.max(0, bruto - m.faturamentoLiquido)
  const liquido = m.faturamentoLiquido
  const vrLiquido = Math.max(0, m.vrRecebido - m.vrTaxaMedia8)
  const cmv = m.custoProdutosCozina + (m.custoProdutosLoja ?? 0)
  const margem = m.margemLiquida
  const resultadoOper = margem - m.custoOperacao

  // Faturamento por dia (soma das 3 plataformas).
  const diasNoMes = new Date(year, month, 0).getDate()
  const fatBy = (mat: typeof matIf): Record<number, number> =>
    mat.units.find((u) => u.unitId === unit.id)?.faturamento ?? {}
  const fIf = fatBy(matIf)
  const f99 = fatBy(mat99)
  const fKe = fatBy(matKe)
  const dias: { dia: number; valor: number }[] = []
  let fatMesTotal = 0
  for (let d = 1; d <= diasNoMes; d++) {
    const v = (fIf[d] ?? 0) + (f99[d] ?? 0) + (fKe[d] ?? 0)
    dias.push({ dia: d, valor: v })
    fatMesTotal += v
  }
  const maxDia = Math.max(1, ...dias.map((d) => d.valor))

  const platBruto = (id: PlatformId) =>
    m.platforms.find((p) => p.id === id)?.bruto ?? 0
  const platLiquido = (id: PlatformId) =>
    m.platforms.find((p) => p.id === id)?.liquido ?? 0
  const feeByPlat = (id: PlatformId) =>
    id === "ifood" ? fee.ifood : id === "99food" ? fee.ninefood : fee.keeta

  return (
    <div
      data-print="page"
      className="relatorio-mensal mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 bg-muted/30 p-6 print:max-w-none print:gap-3 print:bg-white print:p-0"
    >
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cozina-logo.png" alt="Cozina" className="h-10 w-auto" />
          <div>
            <Link
              href={`/unidades/${unit.code}?periodo=${year}-${String(month).padStart(2, "0")}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground print:hidden"
            >
              <ArrowLeft className="size-3.5" />
              Voltar para a loja
            </Link>
            <h1 className="text-xl font-bold tracking-tight">
              Relatório mensal · {unit.name}{" "}
              <span className="text-sm font-medium text-muted-foreground">
                #{unit.code}
              </span>
            </h1>
            <p className="text-xs text-muted-foreground">
              {periodLabel}
              {[unit.city, unit.state].filter(Boolean).length > 0
                ? ` · ${[unit.city, unit.state].filter(Boolean).join(" / ")}`
                : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2" data-print="hide">
          <span className="flex items-center gap-1.5">
            {platforms.map((p) => (
              <PlatformLogo key={p} platform={p} size="sm" />
            ))}
          </span>
          <ExportPdfButton label="Salvar PDF" />
        </div>
      </div>

      {/* 1. Resumo (KPIs) */}
      <Secao titulo="Resumo do mês">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Faturamento bruto" value={fmtBRL(bruto)} />
          <Kpi label="Líquido (recebido)" value={fmtBRL(liquido)} accent />
          <Kpi label="Margem líquida" value={fmtBRL(margem)} sub={fmtPct(m.margemLucroPct)} />
          <Kpi label="Ticket médio" value={fmtBRL(m.ticketMedio)} />
          <Kpi label="Pedidos" value={fmtNum(m.pedidos)} />
          <Kpi
            label="Cancelados"
            value={fmtNum(m.pedidosCancelados)}
            sub={m.pedidos > 0 ? fmtPct((m.pedidosCancelados / m.pedidos) * 100) : "—"}
          />
          <Kpi
            label="Nota média"
            value={notaMedia > 0 ? `${notaMedia.toFixed(2)} ★` : "—"}
            sub={notasTotal > 0 ? `${fmtNum(notasTotal)} aval.` : undefined}
          />
          <Kpi label="VR recebido (à parte)" value={vrLiquido > 0 ? fmtBRL(vrLiquido) : "—"} />
        </div>
      </Secao>

      {/* 2. DRE */}
      <Secao titulo="DRE da loja">
        <div className="overflow-hidden rounded-lg border">
          <Linha label="Faturamento bruto" value={bruto} kind="base" />
          <Linha label="(−) Taxas das plataformas" value={-taxas} kind="minus" />
          <Linha label="= Líquido (entra na conta)" value={liquido} kind="sum" />
          {vrLiquido > 0 && (
            <Linha label="(+) VR líquido (recebido à parte)" value={vrLiquido} kind="plus" />
          )}
          <Linha label="(−) CMV (Cozina + Loja)" value={-cmv} kind="minus" />
          <Linha label="= Margem líquida" value={margem} kind="sum" pct={m.margemLucroPct} strong />
          {m.custoOperacao > 0 && (
            <>
              <Linha label="(−) Custo de operação" value={-m.custoOperacao} kind="minus" />
              <Linha label="= Resultado operacional" value={resultadoOper} kind="sum" strong />
            </>
          )}
        </div>
      </Secao>

      {/* 3. Por plataforma + entrega */}
      <Secao titulo="Por plataforma">
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Plataforma</th>
                <th className="px-3 py-2 text-right font-semibold">Bruto</th>
                <th className="px-3 py-2 text-right font-semibold">Líquido</th>
                <th className="px-3 py-2 text-right font-semibold">% repasse</th>
                <th className="px-3 py-2 text-right font-semibold">Entrega</th>
              </tr>
            </thead>
            <tbody>
              {PLATS.filter((p) => platforms.includes(p.id)).map((p) => {
                const b = platBruto(p.id)
                const l = platLiquido(p.id)
                return (
                  <tr key={p.id} className="border-t">
                    <td className="px-3 py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span data-print="hide">
                          <PlatformLogo platform={p.id} size="sm" />
                        </span>
                        {p.label}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtBRL(b)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{fmtBRL(l)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {b > 0 ? fmtPct((l / b) * 100) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-rose-600">
                      {feeByPlat(p.id) > 0 ? `− ${fmtBRL(feeByPlat(p.id))}` : "—"}
                    </td>
                  </tr>
                )
              })}
              <tr className="border-t-2 border-primary/30 bg-muted/30 font-semibold">
                <td className="px-3 py-1.5">Total</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtBRL(bruto)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtBRL(liquido)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {bruto > 0 ? fmtPct((liquido / bruto) * 100) : "—"}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-rose-600">
                  {fee.total > 0 ? `− ${fmtBRL(fee.total)}` : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Secao>

      {/* 4. Cardápio — funil + produtos */}
      <Secao titulo="Cardápio (iFood)">
        {cardapioPeriodo || funnel.diasComDado > 0 ? (
          <div className="flex flex-col gap-3">
            {(() => {
              const fn = cardapioPeriodo ?? funnel
              const conv = Number(fn.conversaoPct)
              const steps = [
                { l: "Visitas", v: fn.visitas },
                { l: "Visualizações", v: fn.visualizacoes },
                { l: "Sacola", v: fn.sacola },
                { l: "Revisão", v: fn.revisao },
                { l: "Concluídos", v: fn.concluidos },
              ]
              return (
                <div className="rounded-lg border p-3">
                  <p className="mb-2 text-xs font-medium">
                    Funil de conversão · conversão {fmtPct(conv)}
                  </p>
                  <div className="grid grid-cols-5 gap-2">
                    {steps.map((s) => (
                      <div key={s.l} className="rounded-md bg-muted/40 px-2 py-1.5 text-center">
                        <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
                          {s.l}
                        </div>
                        <div className="text-sm font-semibold tabular-nums">{fmtNum(s.v)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
            {topItens.length > 0 && (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Top produtos vendidos</th>
                      <th className="px-3 py-2 text-right font-semibold">Qtd</th>
                      <th className="px-3 py-2 text-right font-semibold">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topItens.map((it, i) => (
                      <tr key={`${it.nomeItem}-${i}`} className="border-t">
                        <td className="px-3 py-1.5">{it.nomeItem}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtNum(it.qtdVendida)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmtBRL(it.valorTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Sem dados de Cardápio importados no período.
          </p>
        )}
      </Secao>

      {/* 5. Faturamento por dia */}
      {fatMesTotal > 0 && (
        <Secao titulo="Faturamento por dia">
          <div className="flex flex-col gap-1">
            {dias
              .filter((d) => d.valor > 0)
              .map((d) => (
                <div key={d.dia} className="flex items-center gap-2 text-[11px]">
                  <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">
                    {d.dia}
                  </span>
                  <div className="h-3 flex-1 overflow-hidden rounded bg-muted/40">
                    <div
                      className="h-full rounded bg-emerald-500/70"
                      style={{ width: `${(d.valor / maxDia) * 100}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right tabular-nums">
                    {fmtBRL(d.valor)}
                  </span>
                </div>
              ))}
            <div className="mt-1 flex items-center justify-between border-t pt-1 text-xs font-semibold">
              <span>Total do mês (todas plataformas)</span>
              <span className="tabular-nums">{fmtBRL(fatMesTotal)}</span>
            </div>
          </div>
        </Secao>
      )}

      <p className="mt-1 text-[10px] text-muted-foreground print:mt-2">
        Gerado pelo Cozina Delivery OS · {periodLabel} · números do iFood, 99 Food
        e Keeta importados. Líquido = repasse que entra na conta (impacto no
        repasse). VR é recebido à parte do iFood.
      </p>
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex break-inside-avoid flex-col gap-2 rounded-xl border bg-card p-4 print:border-muted print:p-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {titulo}
      </h2>
      {children}
    </section>
  )
}

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`text-base font-bold tabular-nums ${accent ? "text-emerald-600 dark:text-emerald-400" : ""}`}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  )
}

function Linha({
  label,
  value,
  kind,
  pct,
  strong,
}: {
  label: string
  value: number
  kind: "base" | "minus" | "plus" | "sum"
  pct?: number
  strong?: boolean
}) {
  const color =
    kind === "minus"
      ? "text-rose-600 dark:text-rose-400"
      : kind === "plus"
        ? "text-emerald-600 dark:text-emerald-400"
        : ""
  return (
    <div
      className={`flex items-center justify-between gap-3 border-b px-3 py-2 text-sm last:border-b-0 ${
        kind === "sum" ? "bg-muted/30" : ""
      } ${strong ? "font-semibold" : ""}`}
    >
      <span>{label}</span>
      <span className="flex items-center gap-2">
        {pct != null && (
          <span className="text-[10px] text-muted-foreground">{fmtPct(pct)}</span>
        )}
        <span className={`tabular-nums ${color}`}>
          {value < 0 ? `− ${fmtBRL(Math.abs(value))}` : fmtBRL(value)}
        </span>
      </span>
    </div>
  )
}
