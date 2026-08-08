import Link from "next/link"
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CreditCard,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react"

import { fmtBRL } from "@/lib/format"
import { semCaps } from "@/lib/sem-caps"
import { formatPeriodLabel, formatRangeLabel } from "@/lib/period"
import { readPeriod } from "@/lib/period-helpers"
import { PeriodSelector } from "@/components/shared/period-selector"
import {
  getCaixaDashboard,
  getCaixaHoldingId,
  getCaixaPorLoja,
  getCategoriesFlat,
  getTopTitulares,
  type CategoryTotal,
  type DashPanel,
  type FinCategory,
  type FinEntry,
  type TitularTotal,
} from "@/lib/data/caixa"

import { getFluxoCaixa } from "@/lib/data/fluxo-caixa"

import { FinIcon } from "./_components/fin-icon"
import { BankBadge } from "./_components/bank-badge"
import { LojasComparativo } from "./_components/lojas-comparativo"
import { criarCronometro } from "@/lib/perf"

function fmtDiaLongo(iso: string): string {
  return new Date(`${iso}T12:00:00-03:00`).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  })
}

function fmtDate(d: string | null) {
  if (!d) return "—"
  const [y, m, day] = d.split("-")
  return `${day}/${m}/${y.slice(2)}`
}

export default async function VisaoGeralPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; inicio?: string; fim?: string; loja?: string }>
}) {
  const cron = criarCronometro("financeiro")
  const holdingId = await getCaixaHoldingId()
  if (!holdingId) return null
  cron.marca("holding")

  const sp = await searchParams
  const loja = sp.loja
  const { range: periodRange, year, month, isFullMonth } = readPeriod(sp)
  // No Consolidado, mostra o comparativo por loja.
  const consolidado = !loja || loja === "todas"

  // As cinco consultas são disparadas JUNTAS: nenhuma depende do resultado da
  // outra. Antes, o comparativo por loja e o fluxo projetado esperavam o
  // Promise.all acima terminar pra só então começar -- e o fluxo é o mais
  // pesado dos cinco, então a tela inteira ficava atrás dele.
  const pDash = getCaixaDashboard(holdingId, year, month, loja)
  const pCategories = getCategoriesFlat(holdingId)
  const pTop = getTopTitulares(holdingId, year, month, loja)
  const pLojas = consolidado
    ? getCaixaPorLoja(holdingId, year, month)
    : Promise.resolve([])
  // Resumo do fluxo de caixa projetado (30 dias) pro topo.
  const pFluxo = getFluxoCaixa(30, loja)

  // Disparar antes de aguardar cria uma janela: se uma das primeiras falhar, a
  // página estoura e a rejeição das últimas fica sem dono (unhandledRejection,
  // que no Node derruba o processo). Este catch vazio só marca a promise como
  // tratada -- o `await` abaixo continua estourando normalmente.
  pLojas.catch(() => {})
  pFluxo.catch(() => {})

  // Colhidas em etapas só pra o cronômetro conseguir separar quem demora.
  const [dash, categories, top] = await Promise.all([pDash, pCategories, pTop])
  cron.marca("dados")
  const lojas = await pLojas
  cron.marca("lojas")
  const fluxo = await pFluxo
  cron.marca("fluxo")
  cron.fim({ loja: loja ?? "todas", periodo: `${year}-${String(month).padStart(2, "0")}` })

  const now = new Date()
  const periods: { year: number; month: number }[] = []
  for (let i = -2; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    periods.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  const catById = new Map(categories.map((c) => [c.id, c]))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Base dos cards: {formatRangeLabel(periodRange)}
        </p>
        <PeriodSelector current={periodRange} options={periods} enableRange />
      </div>

      {!isFullMonth && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          <span>
            Caixa é organizado por <strong>mês</strong>. Mostrando dados de <strong>{formatPeriodLabel({ year, month })}</strong>.
          </span>
        </div>
      )}

      {categories.length === 0 && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-300">
          👋 Comece pela aba <Link href="/financeiro/categorias" className="font-semibold underline">Categorias</Link> (criar
          padrão de restaurante) e <Link href="/financeiro/contas" className="font-semibold underline">Contas</Link>.
        </div>
      )}

      {/* KPIs do período */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Receita do período" value={dash.receitaPeriodo} tone="pos" icon={TrendingUp} />
        <Kpi label="Despesa do período" value={dash.despesaPeriodo} tone="neg" icon={TrendingDown} />
        <Kpi
          label="Balanço do período"
          value={dash.balancoPeriodo}
          tone={dash.balancoPeriodo < 0 ? "neg" : "pos"}
          icon={Wallet}
        />
        <Kpi
          label="Saldo estimado em conta"
          value={dash.saldoTotal}
          tone={dash.saldoTotal < 0 ? "neg" : "pos"}
          icon={Wallet}
          highlight
        />
      </div>

      {/* Fluxo de caixa projetado (30 dias) — resumo + alerta de ruptura */}
      {fluxo && (
        <Link
          href={`/financeiro/fluxo${loja ? `?loja=${loja}` : ""}`}
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 shadow-sm transition-colors hover:bg-muted/40 ${
            fluxo.primeiroDiaNegativo
              ? "border-rose-300 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/20"
              : "bg-card"
          }`}
        >
          <div className="flex items-center gap-3">
            <TrendingUp className={`size-5 ${fluxo.primeiroDiaNegativo ? "text-rose-600" : "text-primary"}`} />
            <div>
              <div className="text-sm font-semibold">Fluxo de caixa · próximos 30 dias</div>
              {fluxo.primeiroDiaNegativo ? (
                <div className="text-xs font-medium text-rose-600">
                  ⚠ Saldo fica negativo em {fmtDiaLongo(fluxo.primeiroDiaNegativo)} (mín. {fmtBRL(fluxo.saldoMinimo)})
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Inclui {fmtBRL(fluxo.totalEntradasDelivery)} de repasses de delivery previstos
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-5">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Saldo hoje</div>
              <div className="text-sm font-semibold tabular-nums">{fmtBRL(fluxo.saldoAtual)}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Projetado 30d</div>
              <div className={`text-lg font-semibold tabular-nums ${fluxo.saldoProjetadoFim < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {fmtBRL(fluxo.saldoProjetadoFim)}
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* Comparativo por loja (só no Consolidado) */}
      {consolidado && <LojasComparativo lojas={lojas} periodo={sp.periodo} />}

      {/* Pagamentos / Recebimentos → abre o aging */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Link href={`/financeiro/aging${loja ? `?loja=${loja}` : ""}`} className="rounded-xl transition-colors hover:opacity-90">
          <PanelCard title="Pagamentos" panel={dash.pagamentos} tone="neg" />
        </Link>
        <Link href={`/financeiro/aging${loja ? `?loja=${loja}` : ""}`} className="rounded-xl transition-colors hover:opacity-90">
          <PanelCard title="Recebimentos" panel={dash.recebimentos} tone="pos" />
        </Link>
      </div>

      {/* Contas / Cartões */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Wallet className="size-4" /> Minhas Contas
          </h3>
          {dash.accounts.length === 0 ? (
            <Empty>Nenhuma conta. Cadastre em <Link href="/financeiro/contas" className="underline">Contas</Link>.</Empty>
          ) : (
            <div className="space-y-1.5">
              {dash.accounts.map((a) => (
                <div key={a.id} className="flex items-center gap-2.5">
                  <BankBadge bank={a.bank} logoUrl={a.logoUrl} size={28} />
                  <span className="flex-1 truncate text-sm font-medium">{a.name}</span>
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      (a.balance ?? 0) < 0 ? "text-rose-600" : "text-foreground"
                    }`}
                  >
                    {fmtBRL(a.balance ?? 0)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <CreditCard className="size-4" /> Meus Cartões
          </h3>
          {dash.cartoes.length === 0 ? (
            <Empty>Nenhum cartão. Cadastre em <Link href="/financeiro/cartoes" className="underline">Cartões</Link>.</Empty>
          ) : (
            <div className="space-y-1.5">
              {dash.cartoes.map(({ account, faturaAberta, disponivel }) => (
                <div key={account.id} className="flex items-center gap-2.5">
                  <BankBadge bank={account.bank} logoUrl={account.logoUrl} size={28} />
                  <div className="flex-1">
                    <div className="truncate text-sm font-medium">{account.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Fatura em aberto
                      {disponivel != null ? ` · disp. ${fmtBRL(disponivel)}` : ""}
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-rose-600">
                    {fmtBRL(faturaAberta)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Próximos vencimentos / recebimentos */}
      <div className="grid gap-3 lg:grid-cols-2">
        <UpcomingCard
          title="Próximos vencimentos"
          icon={AlertTriangle}
          entries={dash.proximosVencimentos}
          tone="neg"
          catById={catById}
        />
        <UpcomingCard
          title="Próximos recebimentos"
          icon={ArrowUpRight}
          entries={dash.proximosRecebimentos}
          tone="pos"
          catById={catById}
        />
      </div>

      {/* Curva ABC de despesas / maiores receitas */}
      <div className="grid gap-3 lg:grid-cols-2">
        <AbcCard items={dash.gastosAbc} />
        <BarsCard title="Maiores receitas do mês" items={dash.maioresReceitas} tone="pos" />
      </div>

      {/* Top clientes / fornecedores */}
      <div className="grid gap-3 lg:grid-cols-2">
        <TopCard title="Top 5 Clientes do mês" items={top.clientes} tone="pos" />
        <TopCard title="Top 5 Fornecedores do mês" items={top.fornecedores} tone="neg" />
      </div>

      {/* Últimos lançamentos */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Últimos lançamentos
        </h3>
        {dash.ultimosLancamentos.length === 0 ? (
          <Empty>Sem lançamentos neste período.</Empty>
        ) : (
          <div className="divide-y">
            {dash.ultimosLancamentos.map((e) => {
              const cat = e.categoryId ? catById.get(e.categoryId) : null
              const isDespesa = e.kind === "despesa"
              const texto = e.titular || e.description || cat?.name || "Lançamento"
              return (
                <div key={e.id} className="flex items-center gap-3 py-2">
                  <FinIcon name={cat?.icon ?? null} className="size-4 text-muted-foreground" />
                  {/* title = texto original: o histórico do extrato é
                      documento, `semCaps` só arruma a exibição. */}
                  <span className="flex-1 truncate text-sm" title={texto}>
                    {semCaps(texto)}
                  </span>
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      e.kind === "receita"
                        ? "text-emerald-600"
                        : isDespesa
                          ? "text-rose-600"
                          : "text-sky-600"
                    }`}
                  >
                    {isDespesa ? "−" : e.kind === "receita" ? "+" : ""}
                    {fmtBRL(e.value)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Kpi({
  label,
  value,
  tone,
  icon: Icon,
  highlight,
}: {
  label: string
  value: number
  tone: "pos" | "neg"
  icon: typeof Wallet
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-xl border p-4 shadow-sm ${
        highlight ? "bg-primary/5 border-primary/20" : "bg-card"
      }`}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-semibold tabular-nums ${
          tone === "neg" ? "text-rose-600" : "text-emerald-600"
        }`}
      >
        {fmtBRL(value)}
      </div>
    </div>
  )
}

function PanelCard({ title, panel, tone }: { title: string; panel: DashPanel; tone: "pos" | "neg" }) {
  const accent = tone === "neg" ? "text-rose-600" : "text-emerald-600"
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        <span className="text-[11px] text-muted-foreground">vencendo hoje</span>
      </div>
      <div className={`text-3xl font-bold tabular-nums ${accent}`}>
        {fmtBRL(panel.vencendoHoje.sum)}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {panel.vencendoHoje.count} lançamento(s)
      </div>
      <div className="mt-3 space-y-1.5 border-t pt-3 text-sm">
        <Row label="Em atraso" badge={panel.emAtraso.count} value={panel.emAtraso.sum} alert />
        <Row label="Próximos 7 dias" badge={panel.proximos7.count} value={panel.proximos7.sum} />
        <Row label="Próximos 30 dias" badge={panel.proximos30.count} value={panel.proximos30.sum} />
      </div>
    </div>
  )
}

function Row({
  label,
  badge,
  value,
  alert,
}: {
  label: string
  badge: number
  value: number
  alert?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {label}
        <span
          className={`inline-flex min-w-5 justify-center rounded-full px-1.5 text-[10px] font-semibold ${
            alert && badge > 0 ? "bg-rose-100 text-rose-700" : "bg-muted text-muted-foreground"
          }`}
        >
          {badge}
        </span>
      </span>
      <span className={`font-semibold tabular-nums ${alert && value > 0 ? "text-rose-600" : ""}`}>
        {fmtBRL(value)}
      </span>
    </div>
  )
}

function UpcomingCard({
  title,
  icon: Icon,
  entries,
  tone,
  catById,
}: {
  title: string
  icon: typeof AlertTriangle
  entries: FinEntry[]
  tone: "pos" | "neg"
  catById: Map<string, FinCategory>
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="size-4" /> {title}
      </h3>
      {entries.length === 0 ? (
        <Empty>Nada nos próximos dias.</Empty>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e) => {
            const cat = e.categoryId ? catById.get(e.categoryId) : null
            const atrasado = e.status === "atrasado"
            return (
              <div key={e.id} className="flex items-center gap-2.5">
                <div
                  className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${
                    atrasado ? "bg-rose-100 text-rose-600" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <FinIcon name={cat?.icon ?? null} className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {e.titular || e.description || cat?.name || "Lançamento"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {atrasado ? "atrasado · " : ""}vence {fmtDate(e.dueDate)}
                  </div>
                </div>
                <span
                  className={`text-sm font-semibold tabular-nums ${
                    tone === "neg" ? "text-rose-600" : "text-emerald-600"
                  }`}
                >
                  {fmtBRL(e.value)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function BarsCard({ title, items, tone }: { title: string; items: CategoryTotal[]; tone: "pos" | "neg" }) {
  const max = Math.max(1, ...items.map((i) => i.total))
  const bar = tone === "neg" ? "bg-rose-400" : "bg-emerald-400"
  const txt = tone === "neg" ? "text-rose-600" : "text-emerald-600"
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {tone === "neg" ? <ArrowDownRight className="size-4" /> : <ArrowUpRight className="size-4" />}
        {title}
      </h3>
      {items.length === 0 ? (
        <Empty>Sem dados neste período.</Empty>
      ) : (
        <div className="space-y-2.5">
          {items.map((i) => (
            <div key={i.categoryId ?? i.name}>
              <div className="mb-1 flex items-center gap-2 text-sm">
                <FinIcon name={i.icon} className="size-3.5 text-muted-foreground" />
                <span className="flex-1 truncate">{i.name}</span>
                <span className={`font-semibold tabular-nums ${txt}`}>{fmtBRL(i.total)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={`h-full ${bar}`} style={{ width: `${(i.total / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Curva ABC de despesas: categorias ordenadas + % acumulado + classe A/B/C.
 *  A = até 80% do gasto (o que mais pesa), B = 80–95%, C = cauda. */
function AbcCard({ items }: { items: CategoryTotal[] }) {
  const total = items.reduce((s, i) => s + i.total, 0)
  let acc = 0
  const linhas = items.map((i) => {
    acc += i.total
    const accPct = total > 0 ? (acc / total) * 100 : 0
    const classe = accPct <= 80 ? "A" : accPct <= 95 ? "B" : "C"
    return { ...i, accPct, sharePct: total > 0 ? (i.total / total) * 100 : 0, classe }
  })
  const classeCls: Record<string, string> = {
    A: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
    B: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    C: "bg-muted text-muted-foreground",
  }
  const nA = linhas.filter((l) => l.classe === "A").length
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <ArrowDownRight className="size-4" /> Curva ABC de despesas
        </h3>
        {nA > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {nA} categoria{nA !== 1 ? "s" : ""} = 80% do gasto
          </span>
        )}
      </div>
      {linhas.length === 0 ? (
        <Empty>Sem despesas neste período.</Empty>
      ) : (
        <div className="space-y-2">
          {linhas.slice(0, 12).map((l) => (
            <div key={l.categoryId ?? l.name} className="flex items-center gap-2 text-sm">
              <span className={`flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-bold ${classeCls[l.classe]}`}>
                {l.classe}
              </span>
              <FinIcon name={l.icon} className="size-3.5 text-muted-foreground" />
              <span className="flex-1 truncate">{l.name}</span>
              <span className="w-10 text-right text-[11px] tabular-nums text-muted-foreground">
                {fmtPctInt(l.sharePct)}
              </span>
              <span className="w-24 text-right font-semibold tabular-nums text-rose-600">{fmtBRL(l.total)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function fmtPctInt(n: number): string {
  return `${Math.round(n)}%`
}

function TopCard({ title, items, tone }: { title: string; items: TitularTotal[]; tone: "pos" | "neg" }) {
  const max = Math.max(1, ...items.map((i) => i.total))
  const bar = tone === "neg" ? "bg-rose-400" : "bg-emerald-400"
  const txt = tone === "neg" ? "text-rose-600" : "text-emerald-600"
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {items.length === 0 ? (
        <Empty>Sem dados neste período (preencha Cliente/Fornecedor nos lançamentos).</Empty>
      ) : (
        <div className="space-y-2.5">
          {items.map((i, n) => (
            <div key={i.name}>
              <div className="mb-1 flex items-center gap-2 text-sm">
                <span className="flex size-5 items-center justify-center rounded bg-muted text-[10px] font-bold text-muted-foreground">
                  {n + 1}
                </span>
                <span className="flex-1 truncate">{i.name}</span>
                <span className="text-[11px] text-muted-foreground">{i.count}x</span>
                <span className={`font-semibold tabular-nums ${txt}`}>{fmtBRL(i.total)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={`h-full ${bar}`} style={{ width: `${(i.total / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-4 text-center text-xs text-muted-foreground">{children}</p>
}
