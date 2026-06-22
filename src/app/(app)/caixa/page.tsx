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

import { FinIcon } from "./_components/fin-icon"
import { BankBadge } from "./_components/bank-badge"
import { LojasComparativo } from "./_components/lojas-comparativo"

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
  const holdingId = await getCaixaHoldingId()
  if (!holdingId) return null

  const sp = await searchParams
  const loja = sp.loja
  const { range: periodRange, year, month, isFullMonth } = readPeriod(sp)
  const [dash, categories, top] = await Promise.all([
    getCaixaDashboard(holdingId, year, month, loja),
    getCategoriesFlat(holdingId),
    getTopTitulares(holdingId, year, month, loja),
  ])
  // No Consolidado, mostra o comparativo por loja.
  const consolidado = !loja || loja === "todas"
  const lojas = consolidado ? await getCaixaPorLoja(holdingId, year, month) : []

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
          👋 Comece pela aba <Link href="/caixa/categorias" className="font-semibold underline">Categorias</Link> (criar
          padrão de restaurante) e <Link href="/caixa/contas" className="font-semibold underline">Contas</Link>.
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

      {/* Comparativo por loja (só no Consolidado) */}
      {consolidado && <LojasComparativo lojas={lojas} periodo={sp.periodo} />}

      {/* Pagamentos / Recebimentos */}
      <div className="grid gap-3 lg:grid-cols-2">
        <PanelCard title="Pagamentos" panel={dash.pagamentos} tone="neg" />
        <PanelCard title="Recebimentos" panel={dash.recebimentos} tone="pos" />
      </div>

      {/* Contas / Cartões */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Wallet className="size-4" /> Minhas Contas
          </h3>
          {dash.accounts.length === 0 ? (
            <Empty>Nenhuma conta. Cadastre em <Link href="/caixa/contas" className="underline">Contas</Link>.</Empty>
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
            <Empty>Nenhum cartão. Cadastre em <Link href="/caixa/cartoes" className="underline">Cartões</Link>.</Empty>
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

      {/* Maiores gastos / receitas */}
      <div className="grid gap-3 lg:grid-cols-2">
        <BarsCard title="Maiores gastos do mês" items={dash.maioresGastos} tone="neg" />
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
              return (
                <div key={e.id} className="flex items-center gap-3 py-2">
                  <FinIcon name={cat?.icon ?? null} className="size-4 text-muted-foreground" />
                  <span className="flex-1 truncate text-sm">
                    {e.titular || e.description || cat?.name || "Lançamento"}
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
