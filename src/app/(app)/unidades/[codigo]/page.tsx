import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FileText } from "lucide-react"

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
  getNinefoodAvaliacoesResumoForMonth,
  getNinefoodResumoForMonth,
  ninefoodHasAnyDataForMonth,
} from "@/lib/data/ninefood-imported"
import {
  getKeetaAvaliacoesResumoForMonth,
  getKeetaResumoForMonth,
} from "@/lib/data/keeta-imported"
import { getAccessibleUnitIds } from "@/lib/auth/roles"
import { userCan } from "@/lib/auth/permissions"
import { getCurrentUserContext } from "@/lib/auth/context"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import { emptyMonthly, type UnitMonthly } from "@/lib/mock-monthly"
import { getRealMonthlyForUnits } from "@/lib/data/lancamentos"
import { getImportCoverageForMonth } from "@/lib/data/relatorio-diario"
import {
  parseRangeFromSp,
  rangeIsFullMonth,
  formatRangeLabel,
  formatPeriodLabel,
} from "@/lib/period"
import { getRealMonthlyForUnitsForRange } from "@/lib/data/range-aggregation"
import { AlertTriangle } from "lucide-react"
import { PeriodSelector } from "@/components/shared/period-selector"
import { PlatformSwitcher } from "@/components/shared/platform-switcher"
import { EditUnitDialog } from "../_components/edit-unit-dialog"
import { AvaliacoesTab } from "./_components/avaliacoes-tab"
import { Avaliacoes99Tab } from "./_components/avaliacoes-99-tab"
import { AvaliacoesKeetaTab } from "./_components/avaliacoes-keeta-tab"
import { CardapioTab } from "./_components/cardapio-tab"
import { DiagnosticoTab } from "./_components/diagnostico-tab"
import { Cardapio99Tab } from "./_components/cardapio-99-tab"
import { CardapioKeetaTab } from "./_components/cardapio-keeta-tab"
import { FinanceiroLojaTab } from "./_components/financeiro-loja-tab"
import { UnitCoverageStrip } from "./_components/unit-coverage-strip"
import { mergeMonthly } from "./_components/merge-monthly"
import { FechamentoTab } from "./_components/fechamento-tab"
import { getFechamentos, type Fechamento } from "@/lib/data/fechamentos"

export default async function UnidadeDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string }>
  searchParams: Promise<{ periodo?: string; inicio?: string; fim?: string }>
}) {
  const { codigo } = await params
  const sp = await searchParams
  const unit = await getUnitByCode(codigo)
  if (!unit) notFound()

  // Logo da empresa (white-label) pro avatar da loja.
  const brandLogoUrl = (await getCurrentUserContext()).logoUrl

  // Escopo: franqueado só abre a própria loja. accessibleIds === null =
  // admin/gerente (vê tudo). Loja fora do escopo → 404 (não revela que existe).
  const accessibleIds = await getAccessibleUnitIds()
  if (accessibleIds !== null && !accessibleIds.includes(unit.id)) notFound()

  const canEditUnit = await userCan("unidades", "edit")

  // Fechamento de sociedade (acerto 50/50) — só na JK por enquanto.
  const isJK = (unit.name ?? "").trim().toUpperCase() === "JK"
  const [fechamentos, canEditFechamento] = isJK
    ? await Promise.all([getFechamentos(unit.id), userCan("financeiro", "edit")])
    : [[], false]

  const periodRange = parseRangeFromSp(sp)
  const isFullMonth = rangeIsFullMonth(periodRange)
  const year = Number(periodRange.start.slice(0, 4))
  const month = Number(periodRange.start.slice(5, 7))
  // Quando o range é o mês inteiro, queryRange=undefined (caminho legado).
  // Quando é custom, passa pras queries que aceitam (KPIs por dia).
  const queryRange = isFullMonth ? undefined : periodRange
  const [
    platforms,
    fin,
    nine,
    keeta,
    nine99HasAny,
    avalResumo,
    avalNine,
    avalKeeta,
    availablePeriods,
    monthlyByUnit,
    coverage,
  ] = await Promise.all([
    getUnitPlatforms(unit.id),
    getFinanceiroResumoForMonth(unit.id, year, month, queryRange),
    getNinefoodResumoForMonth(unit.id, year, month, queryRange),
    getKeetaResumoForMonth(unit.id, year, month, queryRange),
    ninefoodHasAnyDataForMonth(unit.id, year, month),
    getAvaliacoesResumoForMonth(unit.id, year, month),
    getNinefoodAvaliacoesResumoForMonth(unit.id, year, month),
    getKeetaAvaliacoesResumoForMonth(unit.id, year, month),
    getAvailablePeriods(),
    // Monthly canônico DO PERÍODO SELECIONADO. Quando range custom, usa o
    // agregador cross-month (que ainda assim pega CMV mensal do banco).
    isFullMonth
      ? getRealMonthlyForUnits([unit.id], year, month)
      : getRealMonthlyForUnitsForRange([unit.id], periodRange),
    // Cobertura de importação DESTA loja no mês (até que dia cada plataforma).
    getImportCoverageForMonth(year, month, [unit.id]),
  ])

  // Nota média da loja = média ponderada (por nº de avaliações) das 3
  // plataformas com dado — antes o Hero mostrava só iFood.
  const notaParts: Array<{ plat: string; total: number; nota: number }> = []
  if (avalResumo.total > 0)
    notaParts.push({ plat: "iFood", total: avalResumo.total, nota: avalResumo.notaMedia })
  if (avalNine.total > 0)
    notaParts.push({ plat: "99 Food", total: avalNine.total, nota: avalNine.notaMedia })
  if (avalKeeta.total > 0)
    notaParts.push({ plat: "Keeta", total: avalKeeta.total, nota: avalKeeta.notaMedia })
  const notasTotal = notaParts.reduce((acc, p) => acc + p.total, 0)
  const notaMediaMerged =
    notasTotal > 0
      ? notaParts.reduce((acc, p) => acc + p.nota * p.total, 0) / notasTotal
      : 0
  const notaFonte = notaParts.map((p) => p.plat).join(" + ")

  // m = monthly mesclado: soma plataformas importadas (iFood + 99 + Keeta).
  // Usa o monthly do PERÍODO SELECIONADO (não o unit.monthly, que é do mês
  // corrente e zerava o DRE ao olhar meses passados).
  const periodMonthly = monthlyByUnit.get(unit.id) ?? emptyMonthly
  const m = mergeMonthly(periodMonthly, fin, nine, keeta)
  // hasData inclui Cardápio 99 (item) — só Loja não cobre quando Marcus
  // importou só o cardápio, sem o financeiro.
  const hasData =
    m.pedidos > 0 ||
    fin.hasData ||
    nine.hasData ||
    keeta.hasData ||
    nine99HasAny
  const usaIfood = fin.hasData
  // "usa99" aqui significa "tem qualquer dado 99 Food" — Loja OU Item.
  // Usado pelo PlatformSwitcher pra decidir se o chip aparece com dados
  // ou com "sem dados". Considera os 2 tipos pra cobertura ficar coerente.
  const usa99 = nine.hasData || nine99HasAny
  const usaKeeta = keeta.hasData

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
            <BrandLogo size="lg" logoUrl={unit.logoUrl ?? brandLogoUrl} name={unit.name} />
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
            current={periodRange}
            options={availablePeriods}
            enableRange
          />
          <Link
            href={`/unidades/${unit.code}/relatorio?periodo=${year}-${String(month).padStart(2, "0")}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-xs font-medium transition-colors hover:bg-muted"
          >
            <FileText className="size-3.5" />
            Relatório do mês
          </Link>
          {canEditUnit && (
            <EditUnitDialog
              unit={{
                unitId: unit.id,
                code: unit.code,
                name: unit.name,
                city: unit.city,
                state: unit.state,
                cnpj: unit.cnpj,
                active: unit.active,
                dataInauguracao: unit.data_inauguracao,
                dataEncerramento: unit.data_encerramento,
                platforms,
                externalStoreIds: unit.externalStoreIds,
                platformInauguracoes: unit.platformInauguracoes,
                logoUrl: unit.logoUrl,
              }}
            />
          )}
        </div>
      </div>

      {!isFullMonth && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          <span>
            Período personalizado <strong>{formatRangeLabel(periodRange)}</strong> — KPIs e DRE filtram por dia. <span className="opacity-70">Avaliações, cardápio e custos mensais (CMV/operação) continuam do mês inteiro ({formatPeriodLabel({ year, month })}).</span>
          </span>
        </div>
      )}

      {hasData || isJK ? (
        <>
          <UnitCoverageStrip
            coverage={coverage}
            month={month}
            periodLabel={formatPeriodLabel({ year, month })}
            platforms={["ifood", "99food", "keeta"]}
          />
          <HeroKpis
            monthly={m}
            notaMedia={notaMediaMerged}
            notasCount={notasTotal}
            notaFonte={notaFonte}
          />
          <DetailTabs
            unit={unit}
            monthlyMerged={m}
            usaIfood={usaIfood}
            usa99={usa99}
            usaKeeta={usaKeeta}
            year={year}
            month={month}
            fechamentos={fechamentos}
            canEditFechamento={canEditFechamento}
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

const PLAT_BAR_COLOR: Record<string, string> = {
  ifood: "bg-red-500",
  "99food": "bg-yellow-400",
  keeta: "bg-teal-500",
}

function HeroKpis({
  monthly: m,
  notaMedia,
  notasCount,
  notaFonte,
}: {
  monthly: UnitMonthly
  notaMedia: number
  notasCount: number
  notaFonte: string
}) {
  const cancelPct =
    m.pedidos > 0 ? (m.pedidosCancelados / m.pedidos) * 100 : 0
  const repassePct =
    m.faturamentoBruto > 0 ? (m.totalLiquido / m.faturamentoBruto) * 100 : 0
  // VR é pago à parte pelo iFood (fora do repasse) — é receita real que entra
  // na conta. O "Resultado" da loja = margem operacional + VR líquido, mesma
  // definição do /resultado (que já soma o VR). Assim as duas telas batem.
  // Se o "recebido real" foi lançado manualmente, ele JÁ inclui o VR — não
  // soma de novo (evita double-count). Senão, soma o VR líquido por cima.
  const vrLiquido =
    m.totalRecebidoReal > 0 ? 0 : Math.max(0, m.vrRecebido - m.vrTaxaMedia8)
  const resultadoComVr = m.margemLiquida + vrLiquido
  const resultadoPct =
    m.faturamentoBruto > 0 ? (resultadoComVr / m.faturamentoBruto) * 100 : 0

  const stats: {
    label: string
    value: string
    sub?: string
    tone?: "pos" | "neg" | "warn"
  }[] = [
    {
      label: "Bruto",
      value: fmtBRL(m.faturamentoBruto),
      sub: `${fmtNum(m.pedidos)} pedidos`,
    },
    {
      label: "Líquido",
      value: fmtBRL(m.totalLiquido),
      sub: `${fmtPct(repassePct)} repasse`,
      tone: "pos",
    },
    {
      label: "Resultado",
      value: fmtBRL(resultadoComVr),
      sub:
        vrLiquido > 0
          ? m.custoProdutosCozina > 0
            ? `${fmtPct(resultadoPct)} · c/ VR`
            : "c/ VR · lance o CMV"
          : m.custoProdutosCozina > 0
            ? fmtPct(m.margemLucroPct)
            : "lance o CMV",
      tone: resultadoComVr >= 0 ? "pos" : "neg",
    },
    { label: "Ticket médio", value: fmtBRL(m.ticketMedio) },
    {
      label: "Cancelamento",
      value: fmtPct(cancelPct),
      sub: `${fmtNum(m.pedidosCancelados)} ped`,
      tone: cancelPct > 5 ? "warn" : undefined,
    },
    {
      label: "Nota média",
      value: notaMedia > 0 ? `${notaMedia.toFixed(2)} ★` : "—",
      sub: notasCount > 0 ? `${fmtNum(notasCount)} · ${notaFonte}` : "sem aval.",
    },
  ]

  const totalBruto = m.platforms.reduce((a, p) => a + p.bruto, 0)
  const plats = m.platforms.filter((p) => p.bruto > 0)

  const toneCls = (t?: "pos" | "neg" | "warn") =>
    t === "pos"
      ? "text-emerald-600 dark:text-emerald-400"
      : t === "neg"
        ? "text-rose-600 dark:text-rose-400"
        : t === "warn"
          ? "text-amber-600 dark:text-amber-400"
          : ""

  return (
    <div className="space-y-3">
      {/* Faixa de KPIs densa */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="bg-card px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {s.label}
            </p>
            <p
              className={`mt-0.5 text-lg font-bold tracking-tight tabular-nums ${toneCls(s.tone)}`}
            >
              {s.value}
            </p>
            {s.sub && (
              <p className="truncate text-[10px] text-muted-foreground">
                {s.sub}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Barra de plataformas */}
      {totalBruto > 0 && (
        <div className="rounded-xl border bg-card px-4 py-3">
          <div className="mb-2 flex h-2 overflow-hidden rounded-full bg-muted">
            {plats.map((p) => (
              <div
                key={p.id}
                className={PLAT_BAR_COLOR[p.id] ?? "bg-muted-foreground"}
                style={{ width: `${(p.bruto / totalBruto) * 100}%` }}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {plats.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1.5 text-[11px]"
              >
                <PlatformLogo platform={p.id} size="sm" />
                <span className="font-semibold tabular-nums">
                  {fmtBRL(p.bruto)}
                </span>
                <span className="text-muted-foreground">
                  {((p.bruto / totalBruto) * 100).toFixed(0)}%
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
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
  usaKeeta,
  year,
  month,
  fechamentos,
  canEditFechamento,
}: {
  unit: Unit
  monthlyMerged: UnitMonthly
  usaIfood: boolean
  usa99: boolean
  usaKeeta: boolean
  year: number
  month: number
  fechamentos: Fechamento[]
  canEditFechamento: boolean
}) {
  const m = monthlyMerged
  const isJK = (unit.name ?? "").trim().toUpperCase() === "JK"

  // Fechamentos só do mês selecionado (a semana aparece no mês que ela cobre).
  const mm = String(month).padStart(2, "0")
  const mesIni = `${year}-${mm}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const mesFim = `${year}-${mm}-${String(lastDay).padStart(2, "0")}`
  const fechamentosDoMes = fechamentos.filter(
    (f) => f.periodoInicio <= mesFim && f.periodoFim >= mesIni,
  )
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
    {
      platform: "keeta" as const,
      empty: !usaKeeta,
      content: (
        <Suspense fallback={<TabSkeleton />}>
          <CardapioKeetaTab unitId={unit.id} year={year} month={month} />
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
    {
      platform: "keeta" as const,
      empty: !usaKeeta,
      content: (
        <Suspense fallback={<TabSkeleton />}>
          <AvaliacoesKeetaTab unitId={unit.id} year={year} month={month} />
        </Suspense>
      ),
    },
  ]

  return (
    <Tabs defaultValue="financeiro">
      {/* No mobile as 5 abas não cabem em 375px: sem o scroll aqui, elas
          empurravam a página inteira e a última ("Fechamento") ficava
          cortada e inalcançável. */}
      <div className="-mx-1 overflow-x-auto px-1">
        <TabsList>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="cardapio">Cardápio</TabsTrigger>
          <TabsTrigger value="avaliacoes">Avaliações</TabsTrigger>
          <TabsTrigger value="diagnostico">Diagnóstico</TabsTrigger>
          {isJK && <TabsTrigger value="fechamento">Fechamento</TabsTrigger>}
        </TabsList>
      </div>

      {/* Financeiro = DRE completo da loja (Receita + Financeiro + Custos) */}
      <TabsContent value="financeiro" className="mt-4">
        <Suspense fallback={<TabSkeleton />}>
          <FinanceiroLojaTab
            unitId={unit.id}
            monthly={m}
            year={year}
            month={month}
          />
        </Suspense>
      </TabsContent>

      {/* Cardápio */}
      <TabsContent value="cardapio" className="mt-4">
        <PlatformSwitcher slots={cardapioSlots} />
      </TabsContent>

      {/* Avaliações */}
      <TabsContent value="avaliacoes" className="mt-4">
        <PlatformSwitcher slots={avaliacoesSlots} />
      </TabsContent>

      {/* Diagnóstico da loja (estilo plano de ação) */}
      <TabsContent value="diagnostico" className="mt-4">
        <Suspense fallback={<TabSkeleton />}>
          <DiagnosticoTab
            unitId={unit.id}
            unitName={unit.name}
            unitCode={unit.code}
            monthly={m}
            year={year}
            month={month}
          />
        </Suspense>
      </TabsContent>

      {/* Fechamento de sociedade (só JK) */}
      {isJK && (
        <TabsContent value="fechamento" className="mt-4">
          <FechamentoTab
            unitId={unit.id}
            unitCode={unit.code}
            fechamentos={fechamentosDoMes}
            canEdit={canEditFechamento}
          />
        </TabsContent>
      )}
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

function formatCnpj(c: string): string {
  const d = c.replace(/\D/g, "")
  if (d.length !== 14) return c
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
}

