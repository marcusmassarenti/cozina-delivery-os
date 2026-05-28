import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  ClipboardEdit,
  DollarSign,
  Pencil,
  PiggyBank,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
} from "lucide-react"

import { BrandLogo } from "@/components/brand-logo"
import { PlatformLogo } from "@/components/platform-logo"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  getUnitByCode,
  getUnitPlatforms,
  type Unit,
} from "@/lib/data/units"
import {
  getAvailablePeriods,
  getAvaliacoesResumoForMonth,
  getFinanceiroResumoForMonth,
} from "@/lib/data/ifood-imported"
import {
  getNinefoodResumoForMonth,
  ninefoodHasAnyDataForMonth,
} from "@/lib/data/ninefood-imported"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import type { UnitMonthly } from "@/lib/mock-monthly"
import { parsePeriodParam } from "@/lib/period"
import { PeriodSelector } from "@/components/shared/period-selector"
import { PlatformSwitcher } from "@/components/shared/platform-switcher"
import { EditUnitDialog } from "../_components/edit-unit-dialog"
import { AvaliacoesTab } from "./_components/avaliacoes-tab"
import { Avaliacoes99Tab } from "./_components/avaliacoes-99-tab"
import { CardapioTab } from "./_components/cardapio-tab"
import { Cardapio99Tab } from "./_components/cardapio-99-tab"
import { CustosTab } from "./_components/custos-tab"
import { FinanceiroTab } from "./_components/financeiro-tab"
import { Financeiro99Tab } from "./_components/financeiro-99-tab"

export default async function UnidadeDetalhePage({
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

  const { year, month } = parsePeriodParam(sp.periodo)
  const [platforms, fin, nine, nine99HasAny, avalResumo, availablePeriods] =
    await Promise.all([
      getUnitPlatforms(unit.id),
      getFinanceiroResumoForMonth(unit.id, year, month),
      getNinefoodResumoForMonth(unit.id, year, month),
      ninefoodHasAnyDataForMonth(unit.id, year, month),
      getAvaliacoesResumoForMonth(unit.id, year, month),
      getAvailablePeriods(),
    ])

  // m = monthly mesclado: soma plataformas importadas (iFood + 99 Food)
  const m = mergeMonthly(unit.monthly, fin, nine)
  // hasData inclui Cardápio 99 (item) — só Loja não cobre quando Marcus
  // importou só o cardápio, sem o financeiro.
  const hasData = m.pedidos > 0 || fin.hasData || nine.hasData || nine99HasAny
  const usaIfood = fin.hasData
  // "usa99" aqui significa "tem qualquer dado 99 Food" — Loja OU Item.
  // Usado pelo PlatformSwitcher pra decidir se o chip aparece com dados
  // ou com "sem dados". Considera os 2 tipos pra cobertura ficar coerente.
  const usa99 = nine.hasData || nine99HasAny
  const usaImportado = usaIfood || usa99

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      {/* Back link */}
      <Link
        href="/unidades"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Voltar para unidades
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <BrandLogo size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight">
                  {unit.name}
                </h1>
                <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs font-bold tabular-nums text-muted-foreground">
                  #{unit.code}
                </span>
                {!unit.active && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Inativa
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {[unit.city, unit.state].filter(Boolean).join(" · ")}
                {unit.cnpj ? ` · CNPJ ${formatCnpj(unit.cnpj)}` : ""}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSelector
            current={{ year, month }}
            options={availablePeriods}
          />
          <Link
            href={`/unidades/${unit.code}/lancamentos`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <ClipboardEdit className="size-3.5" />
            Lançar dados
          </Link>
          <EditUnitDialog
            unit={{
              unitId: unit.id,
              code: unit.code,
              name: unit.name,
              city: unit.city,
              state: unit.state,
              cnpj: unit.cnpj,
              active: unit.active,
              platforms,
              externalStoreIds: unit.externalStoreIds,
            }}
          />
        </div>
      </div>

      {hasData ? (
        <>
          {usaImportado && (
            <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
              <Sparkles className="size-3" />
              KPIs vindos de{" "}
              {[usaIfood && "iFood", usa99 && "99 Food"]
                .filter(Boolean)
                .join(" + ")}{" "}
              · {String(month).padStart(2, "0")}/{year}
            </div>
          )}
          <HeroKpis
            monthly={m}
            notaMedia={avalResumo.notaMedia}
            notasCount={avalResumo.total}
          />
          <DetailTabs
            unit={unit}
            monthlyMerged={m}
            usaIfood={usaIfood}
            usa99={usa99}
            year={year}
            month={month}
          />
        </>
      ) : (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">Unidade sem dados no mês</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Conecte as plataformas ou adicione lançamentos manuais para começar
            a ver o resultado dessa loja.
          </p>
        </div>
      )}
    </div>
  )
}

//----------------------------------------------------------------
// Hero (sempre visível)
//----------------------------------------------------------------

function HeroKpis({
  monthly: m,
  notaMedia,
  notasCount,
}: {
  monthly: UnitMonthly
  notaMedia: number
  notasCount: number
}) {
  const heroes = [
    {
      label: "Faturamento Bruto",
      value: fmtBRL(m.faturamentoBruto),
      trend: `${fmtNum(m.pedidos)} pedidos no mês`,
      tone: "positive" as const,
      icon: DollarSign,
    },
    {
      label: "Margem Líquida",
      value: fmtBRL(m.margemLiquida),
      trend: `${fmtBRL(m.totalLiquido)} líquido (entra na conta)`,
      tone: m.margemLiquida >= 0 ? ("positive" as const) : ("neutral" as const),
      icon: PiggyBank,
    },
    {
      label: "Margem de Lucro",
      value: fmtPct(m.margemLucroPct),
      trend: `sobre R$ ${fmtNum(m.faturamentoBruto)} bruto`,
      tone: m.margemLucroPct >= 0 ? ("positive" as const) : ("neutral" as const),
      icon: TrendingUp,
    },
    {
      label: "Nota Média (iFood)",
      value: notaMedia > 0 ? `${notaMedia.toFixed(2)} ★` : "—",
      trend: notasCount > 0 ? `${notasCount} avaliações` : "Sem avaliações",
      tone: "neutral" as const,
      icon: Star,
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {heroes.map((h) => {
        const Icon = h.icon
        const toneClass =
          h.tone === "positive"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-muted-foreground"
        return (
          <div
            key={h.label}
            className="rounded-xl border bg-card p-5 shadow-sm"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Icon className="size-4" />
            </div>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {h.label}
            </p>
            <p className="mt-1.5 text-2xl font-bold tracking-tight">
              {h.value}
            </p>
            <p className={`mt-1 text-[11px] font-medium ${toneClass}`}>
              {h.trend}
            </p>
          </div>
        )
      })}
    </div>
  )
}

//----------------------------------------------------------------
// Tabs
//----------------------------------------------------------------

function DetailTabs({
  unit,
  monthlyMerged,
  usaIfood,
  usa99,
  year,
  month,
}: {
  unit: Unit
  monthlyMerged: UnitMonthly
  usaIfood: boolean
  usa99: boolean
  year: number
  month: number
}) {
  const m = monthlyMerged
  // Define os slots de plataforma pras tabs Cardápio e Financeiro.
  // Aparece no chip mesmo sem dados (com aviso "sem dados") pra Marcus
  // saber que a plataforma existe mas falta importar.
  const cardapioSlots = [
    {
      platform: "ifood" as const,
      empty: !usaIfood,
      content: (
        <Suspense fallback={<TabSkeleton />}>
          <CardapioTab unitId={unit.id} year={year} month={month} />
        </Suspense>
      ),
    },
    {
      platform: "99food" as const,
      empty: !usa99,
      content: (
        <Suspense fallback={<TabSkeleton />}>
          <Cardapio99Tab unitId={unit.id} year={year} month={month} />
        </Suspense>
      ),
    },
  ]
  const financeiroSlots = [
    {
      platform: "ifood" as const,
      empty: !usaIfood,
      content: (
        <Suspense fallback={<TabSkeleton />}>
          <FinanceiroTab unitId={unit.id} year={year} month={month} />
        </Suspense>
      ),
    },
    {
      platform: "99food" as const,
      empty: !usa99,
      content: (
        <Suspense fallback={<TabSkeleton />}>
          <Financeiro99Tab unitId={unit.id} year={year} month={month} />
        </Suspense>
      ),
    },
  ]
  const avaliacoesSlots = [
    {
      platform: "ifood" as const,
      empty: !usaIfood,
      content: (
        <Suspense fallback={<TabSkeleton />}>
          <AvaliacoesTab unitId={unit.id} year={year} month={month} />
        </Suspense>
      ),
    },
    {
      platform: "99food" as const,
      empty: !usa99,
      content: (
        <Suspense fallback={<TabSkeleton />}>
          <Avaliacoes99Tab unitId={unit.id} year={year} month={month} />
        </Suspense>
      ),
    },
  ]

  return (
    <Tabs defaultValue="resumo">
      <TabsList>
        <TabsTrigger value="resumo">Resumo</TabsTrigger>
        <TabsTrigger value="receita">Receita</TabsTrigger>
        <TabsTrigger value="cardapio">Cardápio</TabsTrigger>
        <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
        <TabsTrigger value="custos">Custos</TabsTrigger>
        <TabsTrigger value="avaliacoes">Avaliações</TabsTrigger>
      </TabsList>

      <TabsContent value="cardapio" className="mt-4">
        <PlatformSwitcher slots={cardapioSlots} />
      </TabsContent>

      <TabsContent value="financeiro" className="mt-4">
        <PlatformSwitcher slots={financeiroSlots} />
      </TabsContent>

      {/* Tab: Resumo */}
      <TabsContent value="resumo" className="mt-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Volume do mês">
            <Row label="Pedidos Recebidos" value={fmtNum(m.pedidos)} />
            <Row
              label="Pedidos Cancelados"
              value={`${fmtNum(m.pedidosCancelados)} (${fmtPct((m.pedidosCancelados / m.pedidos) * 100)})`}
            />
            <Row label="Ticket Médio" value={fmtBRL(m.ticketMedio)} />
            <Row
              label="Clientes Novos"
              value={m.clientesNovos !== null ? fmtNum(m.clientesNovos) : "—"}
            />
          </Card>
          <Card title="Plataformas (mês)">
            {m.platforms.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2">
                <PlatformLogo platform={p.id} size="sm" />
                <div className="flex flex-1 items-baseline justify-between">
                  <span className="text-sm">{p.name}</span>
                  <span className="text-sm font-semibold tabular-nums">
                    {fmtBRL(p.bruto)}
                  </span>
                </div>
              </div>
            ))}
          </Card>
          <Card title="Observações" className="lg:col-span-2">
            <textarea
              defaultValue={m.observacoes}
              placeholder="Anotações do mês — comentários, alertas, contexto..."
              className="min-h-24 w-full resize-y rounded-md border bg-background p-3 text-sm outline-none focus:border-ring"
            />
            <button
              type="button"
              className="mt-2 inline-flex h-8 items-center gap-1.5 self-end rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              Salvar observações
            </button>
          </Card>
        </div>
      </TabsContent>

      {/* Tab: Receita */}
      <TabsContent value="receita" className="mt-4">
        <Card title="Receita (mês)" tone="positive">
          <Row
            label="Faturamento Bruto"
            value={fmtBRL(m.faturamentoBruto)}
            bold
          />
          <Row
            label="(−) Total de descontos e taxas"
            value={`− ${fmtBRL(
              m.taxaEntregaIfood +
                m.promocoes +
                m.taxaComissaoIfood +
                m.servicosLogisticos +
                m.outrosDescontosIfood,
            )}`}
            muted
          />
          <Row
            label="= Faturamento Líquido"
            value={fmtBRL(m.faturamentoLiquido)}
            bold
            highlight
          />
          <Divider />
          <Row label="(+) VR Recebido via loja" value={fmtBRL(m.vrRecebido)} />
          <Row
            label="(−) VR Taxa Média 8%"
            value={`− ${fmtBRL(m.vrTaxaMedia8)}`}
            muted
          />
          <Row
            label="(−) Cancelamentos/Reembolsos"
            value={`− ${fmtBRL(m.cancelamentosReembolsos)}`}
            muted
          />
          <Divider />
          <Row
            label="= Total Líquido (entra na conta)"
            value={fmtBRL(m.totalLiquido)}
            bold
            highlight
          />
        </Card>
      </TabsContent>

      {/* Tab: Custos */}
      <TabsContent value="custos" className="mt-4">
        <Suspense fallback={<TabSkeleton />}>
          <CustosTab
            unitId={unit.id}
            monthly={m}
            year={year}
            month={month}
          />
        </Suspense>
      </TabsContent>

      {/* Tab: Avaliações */}
      <TabsContent value="avaliacoes" className="mt-4">
        <PlatformSwitcher slots={avaliacoesSlots} />
      </TabsContent>
    </Tabs>
  )
}

function TabSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border bg-card p-4 shadow-sm"
          >
            <div className="size-9 animate-pulse rounded-lg bg-muted" />
            <div className="mt-3 h-3 w-20 animate-pulse rounded bg-muted/70" />
            <div className="mt-2 h-5 w-28 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="h-40 w-full animate-pulse rounded-xl border bg-card" />
    </div>
  )
}

//----------------------------------------------------------------
// Reusable inner pieces
//----------------------------------------------------------------

function Card({
  title,
  children,
  className,
  tone,
}: {
  title: string
  children: React.ReactNode
  className?: string
  tone?: "positive" | "negative"
}) {
  const accent =
    tone === "positive"
      ? "border-l-4 border-l-emerald-500"
      : tone === "negative"
        ? "border-l-4 border-l-rose-500"
        : ""
  return (
    <div
      className={`rounded-xl border bg-card p-5 shadow-sm ${accent} ${className ?? ""}`}
    >
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <div className="mt-3 flex flex-col">{children}</div>
    </div>
  )
}

function Row({
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

function formatCnpj(c: string): string {
  const d = c.replace(/\D/g, "")
  if (d.length !== 14) return c
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
}

/**
 * Quando há Financeiro importado pra esse mês (iFood e/ou 99 Food),
 * sobrescreve os valores do monthly manual com a soma dos importados.
 * Custos da indústria (Cozina/Loja) permanecem manuais.
 */
function mergeMonthly(
  manual: UnitMonthly,
  fin: Awaited<ReturnType<typeof getFinanceiroResumoForMonth>>,
  nine: Awaited<ReturnType<typeof getNinefoodResumoForMonth>>,
): UnitMonthly {
  if (!fin.hasData && !nine.hasData) return manual

  // Soma totais reais; quando uma plataforma não tem dado, usa o manual da
  // própria plataforma (do array platforms) como fallback.
  const ifoodBruto = fin.hasData
    ? fin.bruto
    : manual.platforms.find((p) => p.id === "ifood")?.bruto ?? 0
  const ifoodLiquido = fin.hasData
    ? fin.liquido
    : manual.platforms.find((p) => p.id === "ifood")?.liquido ?? 0
  const ifoodPedidos = fin.hasData ? fin.pedidosUnicos : 0
  const ifoodCancel = fin.hasData
    ? fin.cancelamentoTotalQtd + fin.cancelamentoParcialQtd
    : 0

  const nineBruto = nine.hasData
    ? nine.bruto
    : manual.platforms.find((p) => p.id === "99food")?.bruto ?? 0
  const nineLiquido = nine.hasData
    ? nine.liquido
    : manual.platforms.find((p) => p.id === "99food")?.liquido ?? 0
  const ninePedidos = nine.hasData ? nine.pedidos : 0
  const nineCancel = nine.hasData ? nine.cancelamentosQtd : 0

  const keetaBruto =
    manual.platforms.find((p) => p.id === "keeta")?.bruto ?? 0
  const keetaLiquido =
    manual.platforms.find((p) => p.id === "keeta")?.liquido ?? 0

  const bruto = ifoodBruto + nineBruto + keetaBruto
  const liquido = ifoodLiquido + nineLiquido + keetaLiquido
  const pedidos = ifoodPedidos + ninePedidos
  const cancelados = ifoodCancel + nineCancel
  const ticketMedio = pedidos > 0 ? bruto / pedidos : 0
  const totalLiquido = liquido
  const custoTotal = manual.custoProdutosCozina + (manual.custoProdutosLoja ?? 0)
  const margemLiquida = totalLiquido - custoTotal
  const margemLucroPct = bruto > 0 ? (margemLiquida / bruto) * 100 : 0

  // platforms[] atualizado pras 2 plataformas com dado real
  const platforms = manual.platforms.map((p) => {
    if (p.id === "ifood" && fin.hasData) {
      const pctLoja = fin.bruto > 0 ? (fin.liquido / fin.bruto) * 100 : 0
      return { ...p, bruto: fin.bruto, liquido: fin.liquido, pctLoja }
    }
    if (p.id === "99food" && nine.hasData) {
      return { ...p, bruto: nine.bruto, liquido: nine.liquido, pctLoja: nine.pctLoja }
    }
    return p
  })

  return {
    ...manual,
    pedidos,
    pedidosCancelados: cancelados,
    ticketMedio,
    faturamentoBruto: bruto,
    faturamentoLiquido: liquido,
    totalLiquido,
    // Esses campos abaixo são herdados do iFood (não temos equivalente do 99
    // Food granular por taxa). Pra Receita tab, 99 Food entra agregado.
    cancelamentosReembolsos: fin.hasData ? Math.abs(fin.perdaCancelamento) : manual.cancelamentosReembolsos,
    taxaEntregaIfood: fin.hasData ? Math.abs(fin.taxaEntrega) : manual.taxaEntregaIfood,
    promocoes: fin.hasData ? Math.abs(fin.promocaoLoja) : manual.promocoes,
    taxaComissaoIfood: fin.hasData
      ? Math.abs(fin.comissaoIfood) +
        Math.abs(fin.taxaTransacao) +
        Math.abs(fin.taxaServicoCliente)
      : manual.taxaComissaoIfood,
    outrosDescontosIfood: fin.hasData
      ? Math.abs(fin.pacoteAnuncios)
      : manual.outrosDescontosIfood,
    margemLiquida,
    margemLucroPct,
    platforms,
  }
}
