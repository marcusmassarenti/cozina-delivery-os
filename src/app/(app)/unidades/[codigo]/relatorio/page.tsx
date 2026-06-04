import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { ExportPdfButton } from "@/components/shared/export-pdf-button"
import { PlatformLogo } from "@/components/platform-logo"
import { getUnitByCode, getUnitPlatforms } from "@/lib/data/units"
import { getAccessibleUnitIds } from "@/lib/auth/permissions"
import { getRealMonthlyForUnits } from "@/lib/data/lancamentos"
import {
  getAvaliacoesResumoForMonth,
  getFinanceiroResumoForMonth,
} from "@/lib/data/ifood-imported"
import {
  getNinefoodAvaliacoesResumoForMonth,
  getNinefoodResumoForMonth,
} from "@/lib/data/ninefood-imported"
import {
  getKeetaAvaliacoesResumoForMonth,
  getKeetaResumoForMonth,
} from "@/lib/data/keeta-imported"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import { emptyMonthly } from "@/lib/mock-monthly"
import { formatPeriodLabel, parsePeriodParam } from "@/lib/period"

import { FinanceiroLojaTab } from "../_components/financeiro-loja-tab"
import { CardapioTab } from "../_components/cardapio-tab"
import { Cardapio99Tab } from "../_components/cardapio-99-tab"
import { CardapioKeetaTab } from "../_components/cardapio-keeta-tab"
import { AvaliacoesTab } from "../_components/avaliacoes-tab"
import { Avaliacoes99Tab } from "../_components/avaliacoes-99-tab"
import { AvaliacoesKeetaTab } from "../_components/avaliacoes-keeta-tab"
import { mergeMonthly } from "../_components/merge-monthly"

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

  const [platforms, monthlyMap, fin, nine, keeta, avalIf, avalNine, avalKeeta] =
    await Promise.all([
      getUnitPlatforms(unit.id),
      getRealMonthlyForUnits([unit.id], year, month),
      getFinanceiroResumoForMonth(unit.id, year, month),
      getNinefoodResumoForMonth(unit.id, year, month),
      getKeetaResumoForMonth(unit.id, year, month),
      getAvaliacoesResumoForMonth(unit.id, year, month),
      getNinefoodAvaliacoesResumoForMonth(unit.id, year, month),
      getKeetaAvaliacoesResumoForMonth(unit.id, year, month),
    ])

  // monthly enriquecido (igual ao detalhe da loja) — alimenta o Financeiro.
  const m = mergeMonthly(monthlyMap.get(unit.id) ?? emptyMonthly, fin, nine, keeta)

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

  const has = (p: string) => platforms.includes(p as never)

  return (
    <div
      data-print="page"
      className="relatorio-mensal mx-auto flex w-full max-w-4xl flex-1 flex-col gap-5 bg-muted/30 p-6 print:max-w-none print:gap-3 print:bg-white print:p-0"
    >
      {/* Ajustes de impressão. O globals.css força break-inside:avoid em TODO
          filho direto de [data-print=page] (linha ~50) — o que empurrava o bloco
          grande pra próxima página e deixava o vazio. Liberamos pra fluir aqui
          (mesmo padrão do .acomp-print), e mantemos linhas/títulos inteiros. */}
      <style>{`@media print{[data-print="page"].relatorio-mensal>*{break-inside:auto !important}.relatorio-mensal .secao-break{break-before:page}.relatorio-mensal .grid:has(>.rounded-xl){display:block !important}.relatorio-mensal .grid:has(>.rounded-xl)>*{margin-bottom:.6rem}.relatorio-mensal .rounded-lg,.relatorio-mensal .rounded-xl{break-inside:avoid}.relatorio-mensal .rounded-lg.overflow-hidden,.relatorio-mensal .rounded-xl.overflow-hidden,.relatorio-mensal .rounded-lg:has(table),.relatorio-mensal .rounded-xl:has(table){break-inside:auto;overflow:visible}.relatorio-mensal tr{break-inside:avoid}.relatorio-mensal h2,.relatorio-mensal h3{break-after:avoid}.relatorio-mensal table{break-inside:auto}}`}</style>
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

      {/* Resumo (KPIs) */}
      <Secao titulo="Resumo do mês">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Faturamento bruto" value={fmtBRL(m.faturamentoBruto)} />
          <Kpi label="Líquido (recebido)" value={fmtBRL(m.totalLiquido)} accent />
          <Kpi
            label="Margem líquida"
            value={fmtBRL(m.margemLiquida)}
            sub={fmtPct(m.margemLucroPct)}
          />
          <Kpi label="Ticket médio" value={fmtBRL(m.ticketMedio)} />
          <Kpi label="Pedidos" value={fmtNum(m.pedidos)} />
          <Kpi
            label="Cancelados"
            value={fmtNum(m.pedidosCancelados)}
            sub={
              m.pedidos > 0
                ? fmtPct((m.pedidosCancelados / m.pedidos) * 100)
                : "—"
            }
          />
          <Kpi
            label="Nota média"
            value={notaMedia > 0 ? `${notaMedia.toFixed(2)} ★` : "—"}
            sub={notasTotal > 0 ? `${fmtNum(notasTotal)} aval.` : undefined}
          />
          <Kpi
            label="Custo de operação"
            value={m.custoOperacao > 0 ? fmtBRL(m.custoOperacao) : "—"}
          />
        </div>
      </Secao>

      {/* Financeiro completo (DRE, taxas, VR por bandeira, mix, turnos, por dia) */}
      <Secao titulo="Financeiro">
        <FinanceiroLojaTab unitId={unit.id} monthly={m} year={year} month={month} />
      </Secao>

      {/* Cardápio — cada plataforma começa em uma página nova */}
      {has("ifood") && (
        <Secao titulo="Cardápio" platform="ifood" platLabel="iFood" breakBefore>
          <CardapioTab unitId={unit.id} year={year} month={month} />
        </Secao>
      )}
      {has("99food") && (
        <Secao titulo="Cardápio" platform="99food" platLabel="99 Food" breakBefore>
          <Cardapio99Tab unitId={unit.id} year={year} month={month} />
        </Secao>
      )}
      {has("keeta") && (
        <Secao titulo="Cardápio" platform="keeta" platLabel="Keeta" breakBefore>
          <CardapioKeetaTab unitId={unit.id} year={year} month={month} />
        </Secao>
      )}

      {/* Avaliações — cada plataforma começa em uma página nova */}
      {has("ifood") && (
        <Secao titulo="Avaliações" platform="ifood" platLabel="iFood" breakBefore>
          <AvaliacoesTab unitId={unit.id} year={year} month={month} />
        </Secao>
      )}
      {has("99food") && (
        <Secao titulo="Avaliações" platform="99food" platLabel="99 Food" breakBefore>
          <Avaliacoes99Tab unitId={unit.id} year={year} month={month} />
        </Secao>
      )}
      {has("keeta") && (
        <Secao titulo="Avaliações" platform="keeta" platLabel="Keeta" breakBefore>
          <AvaliacoesKeetaTab unitId={unit.id} year={year} month={month} />
        </Secao>
      )}

      <p className="mt-1 text-[10px] text-muted-foreground print:mt-2">
        Gerado pelo Cozina Delivery OS · {periodLabel} · dados do iFood, 99 Food e
        Keeta importados. Líquido = repasse que entra na conta. VR é recebido à
        parte do iFood (não entra no faturamento).
      </p>
    </div>
  )
}

function Secao({
  titulo,
  breakBefore,
  platform,
  platLabel,
  children,
}: {
  titulo: string
  breakBefore?: boolean
  platform?: "ifood" | "99food" | "keeta"
  platLabel?: string
  children: React.ReactNode
}) {
  return (
    <section
      className={`flex flex-col gap-3 rounded-xl border bg-card p-4 print:gap-2 print:rounded-none print:border-0 print:p-0 ${breakBefore ? "secao-break" : ""}`}
    >
      <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {titulo}
        {platform && platLabel && (
          <>
            <span>·</span>
            <span data-print="hide">
              <PlatformLogo platform={platform} size="sm" />
            </span>
            <span className="normal-case tracking-normal">{platLabel}</span>
          </>
        )}
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
