import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FileText } from "lucide-react"

import { BrandLogo } from "@/components/brand-logo"
import { PlatformLogo, type PlatformId,
  ehMarketplace,
} from "@/components/platform-logo"
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
  getCancelamentoCestaForMonth,
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
import { isSuperadmin, userCan } from "@/lib/auth/permissions"
import { getCurrentUserContext } from "@/lib/auth/context"
import { lerFinanceiro, ROTULOS, DEFINICOES } from "@/lib/financeiro/regua"
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
import { createAdminClient } from "@/lib/supabase/admin"
import {
  EditUnitDialog,
  type IfoodApiCadastro,
} from "../_components/edit-unit-dialog"
import { AvaliacoesTab } from "./_components/avaliacoes-tab"
import {
  IfoodApiStatus,
  type IfoodApiEstado,
} from "./_components/ifood-api-status"
import { Avaliacoes99Tab } from "./_components/avaliacoes-99-tab"
import { AvaliacoesKeetaTab } from "./_components/avaliacoes-keeta-tab"
import { CardapioTab } from "./_components/cardapio-tab"
import { DiagnosticoTab } from "./_components/diagnostico-tab"
import { Cardapio99Tab } from "./_components/cardapio-99-tab"
import { CardapioKeetaTab } from "./_components/cardapio-keeta-tab"
import { CardapioCwTab } from "./_components/cardapio-cw-tab"
import { AvaliacoesCwTab } from "./_components/avaliacoes-cw-tab"
import { FinanceiroLojaTab } from "./_components/financeiro-loja-tab"
import { UnitCoverageStrip } from "./_components/unit-coverage-strip"
import { mergeMonthly } from "./_components/merge-monthly"
import { FechamentoTab } from "./_components/fechamento-tab"
import { getFechamentos, type Fechamento } from "@/lib/data/fechamentos"
import { getSuperCriterios } from "@/lib/data/super"
import { SuperBadge } from "@/components/shared/super-badge"
import { SuperCriteriosCard } from "@/components/shared/super-criterios-card"

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

  // Selo Super: só existe se o relatório do iFood tiver sido importado pra
  // essa loja. Sem ele o Map vem vazio e nada é renderizado.
  const superLoja = (await getSuperCriterios([unit.id])).get(unit.id) ?? null

  const canEditUnit = await userCan("unidades", "edit")
  const cadastroExigente = !(await isSuperadmin())

  // Situação da conexão iFood-via-API desta loja (faixa no cabeçalho):
  // vinculada (api_store_id) > última solicitação em aberto > nada.
  const adminDb = createAdminClient()
  const [
    { data: upIfood },
    { data: ultimaSolicitacao },
    { data: nineLink },
    { data: nine99Req },
  ] =
    await Promise.all([
    adminDb
      .from("unit_platforms")
      .select("api_store_id, active")
      .eq("unit_id", unit.id)
      .eq("platform", "ifood")
      .maybeSingle(),
    adminDb
      .from("ifood_activation_requests")
      .select("status, nota")
      .eq("unit_id", unit.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    adminDb
      .from("ninefood_store_links")
      .select("app_shop_id")
      .eq("unit_id", unit.id)
      .eq("active", true)
      .limit(1)
      .maybeSingle(),
    adminDb
      .from("ninefood_activation_requests")
      .select("status")
      .eq("unit_id", unit.id)
      .in("status", ["pendente", "solicitada"])
      .limit(1)
      .maybeSingle(),
  ])
  // Vinculada > pedido em aberto > disponível — mesma régua do iFood.
  const nineApi: "conectada" | "andamento" | "disponivel" = nineLink
    ? "conectada"
    : nine99Req
      ? "andamento"
      : "disponivel"
  const ifoodApiEstado: IfoodApiEstado = upIfood?.api_store_id
    ? { tipo: "conectada" }
    : ultimaSolicitacao?.status === "pendente"
      ? { tipo: "pendente" }
      : ultimaSolicitacao?.status === "solicitada"
        ? { tipo: "solicitada" }
        : ultimaSolicitacao?.status === "recusada"
          ? { tipo: "recusada", nota: ultimaSolicitacao.nota as string | null }
          : { tipo: "nenhuma" }
  // A FAIXA na página só aparece em estado transitório (tem ação em curso);
  // status permanente (conectada) e o convite moram no cadastro (Editar).
  const mostraFaixaIfood =
    Boolean(upIfood?.active) &&
    ["pendente", "solicitada", "recusada"].includes(ifoodApiEstado.tipo)
  // Resumo pro bloco dentro do Editar unidade.
  const ifoodApiCadastro: IfoodApiCadastro | undefined = upIfood?.active
    ? ifoodApiEstado.tipo === "conectada"
      ? "conectada"
      : ifoodApiEstado.tipo === "pendente" || ifoodApiEstado.tipo === "solicitada"
        ? "andamento"
        : "disponivel"
    : undefined

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
    cancelCesta,
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
    // Cesta dos cancelados iFood — o Bruto do hero mostra o total COM
    // cancelados ("Valor das vendas" do portal); os cálculos seguem na base
    // válida.
    getCancelamentoCestaForMonth(unit.id, year, month, queryRange),
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
                {/* Selo do iFood ao lado do nome, como no app deles. Loja sem
                    relatório importado não renderiza nada — ver SuperBadge. */}
                {superLoja && (
                  <SuperBadge
                    nivel={superLoja.nivel}
                    eSuper={superLoja.eSuper}
                    eElegivel={superLoja.eElegivel}
                    tamanho="sm"
                    titulo={
                      superLoja.periodoOficial
                        ? `Super Restaurante · ${superLoja.periodoOficial}`
                        : "Super Restaurante"
                    }
                  />
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
              ifoodApi={ifoodApiCadastro}
              nineApi={nineApi}
              cadastroExigente={cadastroExigente}
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

      {mostraFaixaIfood && (
        <IfoodApiStatus
          unitId={unit.id}
          unitCnpj={unit.cnpj}
          estado={ifoodApiEstado}
          podeSolicitar={canEditUnit}
        />
      )}

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
            platforms={platforms.filter(ehMarketplace)}
            mesEmAberto={
              year === new Date().getFullYear() &&
              month === new Date().getMonth() + 1
            }
          />
          <HeroKpis
            monthly={m}
            notaMedia={notaMediaMerged}
            notasCount={notasTotal}
            notaFonte={notaFonte}
            cancelCesta={cancelCesta}
          />
          <DetailTabs
            unit={unit}
            monthlyMerged={m}
            platforms={platforms}
            usaIfood={usaIfood}
            usa99={usa99}
            usaKeeta={usaKeeta}
            year={year}
            month={month}
            isFullMonth={isFullMonth}
            periodRange={periodRange}
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
  cancelCesta,
}: {
  monthly: UnitMonthly
  notaMedia: number
  notasCount: number
  notaFonte: string
  /** Cesta dos pedidos cancelados no iFood (pro Bruto "total" bater com o
   *  "Valor das vendas" do portal). */
  cancelCesta?: { qtd: number; valor: number }
}) {
  const cancelPct =
    m.pedidos > 0 ? (m.pedidosCancelados / m.pedidos) * 100 : 0

  /* Loja conectada por API cujo extrato ainda não chegou: o faturamento aqui é
   * a soma do "pago pelo cliente" de cada pedido (ver `ifoodBrutoDePedidos`).
   * Vale dizer na tela porque a régua é outra — este valor é DEPOIS das
   * promoções, a cesta do extrato é antes — e porque taxa e repasse, que só o
   * extrato traz, continuam sem existir. */
  const dePedidos = m.ifoodBrutoDePedidos === true
  const repasseDesconhecido = dePedidos && m.totalLiquido <= 0

  // Régua única (src/lib/financeiro/regua.ts). Este cabeçalho tinha conta
  // própria e por isso mostrava um "% repasse" MENOR que o "% que fica na
  // loja" do dashboard pra mesma loja: aqui não somava a venda direta e lá
  // somava. Duas telas, dois números, mesma pergunta.
  const fin = lerFinanceiro({
    bruto: m.faturamentoBruto,
    liquido: m.totalLiquido,
    recebidoDireto: m.platforms.reduce(
      (a, p) => a + (p.recebidoDireto ?? 0),
      0,
    ),
    cancelCesta: cancelCesta?.valor ?? 0,
    cmv: m.custoProdutosCozina + (m.custoProdutosLoja ?? 0),
    operacao: m.custoOperacao,
    totalRecebidoReal: m.totalRecebidoReal,
  })
  const stats: {
    label: string
    value: string
    sub?: string
    tone?: "pos" | "neg" | "warn"
    /** Tooltip (hover) — explica o conceito quando difere do portal. */
    title?: string
  }[] = [
    {
      // Bruto TOTAL (com cancelados) = "Valor das vendas" do portal iFood.
      // Marcus: o hero mostra o n\u00FAmero do portal; margem/taxas/percentuais
      // continuam calculados na base v\u00E1lida (ap\u00F3s cancelamentos), como o DRE.
      label: "Bruto",
      value: fmtBRL(fin.brutoTotal),
      title: dePedidos
        ? "Soma do que os clientes pagaram nos pedidos que a API do iFood j\u00E1 entregou. O extrato do m\u00EAs ainda n\u00E3o chegou \u2014 quando chegar este valor sobe, porque a cesta do extrato \u00E9 contada ANTES das promo\u00E7\u00F5es."
        : cancelCesta && cancelCesta.valor > 0
          ? "Vendas totais, igual ao \u201CValor das vendas\u201D do portal iFood (inclui os pedidos cancelados). O DRE desconta os cancelados antes de calcular taxas e margem."
          : "Vendas menos cancelamentos.",
      sub: dePedidos
        ? `${fmtNum(m.pedidos)} pedidos \u00B7 pago pelo cliente`
        : `${fmtNum(m.pedidos)} pedidos${
            cancelCesta && cancelCesta.qtd > 0
              ? ` \u00B7 ${fmtNum(cancelCesta.qtd)} cancelados`
              : ""
          }`,
    },
    {
      label: ROTULOS.ficaNaLoja,
      // Sem extrato não há taxa nem repasse — mostrar R$ 0,00 e 0% diria que o
      // iFood ficou com o faturamento inteiro da loja.
      value: repasseDesconhecido ? "—" : fmtBRL(fin.ficaNaLoja),
      sub: repasseDesconhecido
        ? "as taxas só vêm no extrato"
        : fin.vendaDireta > 0
          ? `${fmtPct(fin.pctFicaNaLoja)} · ${DEFINICOES.ficaNaLoja.curto}`
          : `${fmtPct(fin.pctFicaNaLoja)} do válido`,
      // Aqui dá pra mostrar os valores de verdade, então o hover é mais útil
      // que a definição genérica — mas diz a mesma coisa, com números.
      title:
        fin.vendaDireta > 0
          ? `Repasse ${fmtBRL(fin.repasse)} + venda direta ${fmtBRL(fin.vendaDireta)} (dinheiro, PIX e maquininha pagos na loja).`
          : DEFINICOES.ficaNaLoja.completo,
      tone: "pos",
    },
    {
      label: "Resultado",
      // Resultado nasce do que fica na loja. Sem repasse conhecido ele seria
      // só "menos o CMV", que não é resultado nenhum.
      value: repasseDesconhecido ? "—" : fmtBRL(fin.resultado),
      sub: repasseDesconhecido
        ? "depende do extrato"
        : m.custoProdutosCozina > 0
          ? fmtPct(fin.pctResultado)
          : "lance o CMV",
      tone: repasseDesconhecido
        ? undefined
        : fin.resultado >= 0
          ? "pos"
          : "neg",
    },
    {
      label: "Ticket médio",
      value: fmtBRL(m.ticketMedio),
      sub: dePedidos ? "sobre o pago pelo cliente" : undefined,
    },
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

  // Barra por plataforma: o segmento iFood também mostra o bruto TOTAL (com
  // cancelados) — assim a soma da barra bate com o card Bruto acima.
  const platsView = m.platforms.map((p) =>
    p.id === "ifood" && cancelCesta && cancelCesta.valor > 0
      ? { ...p, bruto: p.bruto + cancelCesta.valor }
      : p,
  )
  const totalBruto = platsView.reduce((a, p) => a + p.bruto, 0)
  const plats = platsView.filter((p) => p.bruto > 0)

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
          <div
            key={s.label}
            title={s.title}
            className={`bg-card px-3 py-2.5 ${s.title ? "cursor-help" : ""}`}
          >
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
  platforms,
  usaIfood,
  usa99,
  usaKeeta,
  year,
  month,
  isFullMonth,
  periodRange,
  fechamentos,
  canEditFechamento,
}: {
  unit: Unit
  monthlyMerged: UnitMonthly
  /** Plataformas habilitadas na loja (unit_platforms.active) — só essas viram chip. */
  platforms: PlatformId[]
  usaIfood: boolean
  usa99: boolean
  usaKeeta: boolean
  year: number
  month: number
  /** false quando o filtro é recorte de dias — a aba Financeiro avisa. */
  isFullMonth: boolean
  periodRange: { start: string; end: string }
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
    {
      // Único cardápio que NÃO depende de planilha: a API do Cardápio Web
      // devolve o catálogo inteiro, então a aba já nasce preenchida.
      platform: "cardapioweb" as const,
      empty: false,
      content: (
        <Suspense fallback={<TabSkeleton />}>
          <CardapioCwTab unitId={unit.id} year={year} month={month} />
        </Suspense>
      ),
    },
  ].filter((s) => platforms.includes(s.platform))
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
    {
      // Avaliação do canal próprio vem pela API, com sub-nota por dimensão —
      // atendimento, produto, embalagem, tempo e custo/benefício. Nenhum
      // marketplace abre esse detalhe.
      platform: "cardapioweb" as const,
      empty: false,
      content: (
        <Suspense fallback={<TabSkeleton />}>
          <AvaliacoesCwTab unitId={unit.id} year={year} month={month} />
        </Suspense>
      ),
    },
  ].filter((s) => platforms.includes(s.platform))

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
            periodoParcial={!isFullMonth}
            dateRange={isFullMonth ? undefined : periodRange}
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

