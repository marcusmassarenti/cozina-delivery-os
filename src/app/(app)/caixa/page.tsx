import { Coins, TrendingDown, TrendingUp, Wallet } from "lucide-react"

import { fmtBRL } from "@/lib/format"
import { formatPeriodLabel, parsePeriodParam } from "@/lib/period"
import { PeriodSelector } from "@/components/shared/period-selector"
import {
  getAccounts,
  getCaixaHoldingId,
  getCaixaSummary,
  getCategoriesFlat,
  getEntries,
} from "@/lib/data/caixa"

import { LancamentoDialog } from "./_components/lancamento-dialog"
import { ConfigDialog } from "./_components/config-dialog"
import { EntriesList } from "./_components/entries-list"
import { bankColor } from "./_components/fin-icon"

export default async function CaixaPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>
}) {
  const holdingId = await getCaixaHoldingId()
  if (!holdingId) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        Nenhum cliente associado ao seu usuário.
      </div>
    )
  }

  const sp = await searchParams
  const { year, month } = parsePeriodParam(sp.periodo)

  const [accounts, categories, entries, summary] = await Promise.all([
    getAccounts(holdingId),
    getCategoriesFlat(holdingId),
    getEntries(holdingId, { year, month }),
    getCaixaSummary(holdingId, year, month),
  ])

  // opções de período: 2 à frente + atual + 12 atrás
  const now = new Date()
  const periods: { year: number; month: number }[] = []
  for (let i = -2; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    periods.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }

  const kpis = [
    { label: "Saldo em conta", value: summary.saldo, icon: Wallet, tone: summary.saldo < 0 ? "neg" : "pos" },
    { label: "A receber", value: summary.aReceber, icon: TrendingUp, tone: "pos" },
    { label: "A pagar", value: summary.aPagar, icon: TrendingDown, tone: "neg" },
    {
      label: "Vencido (a pagar)",
      value: summary.vencidoPagar,
      icon: TrendingDown,
      tone: "alert",
    },
  ]

  return (
    <div className="flex flex-1 flex-col gap-5 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Coins className="size-6 text-muted-foreground" />
            Fluxo de Caixa
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Contas a pagar e receber, custos e saldo · {formatPeriodLabel({ year, month })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PeriodSelector current={{ year, month }} options={periods} />
          <ConfigDialog accounts={accounts} categoriesFlat={categories} />
          <LancamentoDialog accounts={accounts} categories={categories} />
        </div>
      </div>

      {categories.length === 0 && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-300">
          👋 Comece em <strong>Configurar</strong>: crie as categorias padrão de restaurante e
          suas contas bancárias.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <k.icon className="size-4" />
              {k.label}
            </div>
            <div
              className={`mt-1 text-2xl font-semibold tabular-nums ${
                k.tone === "neg"
                  ? "text-rose-600"
                  : k.tone === "alert"
                    ? "text-amber-600"
                    : "text-emerald-600"
              }`}
            >
              {fmtBRL(k.value)}
            </div>
          </div>
        ))}
      </div>

      {accounts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {accounts.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm shadow-sm"
            >
              <span className={`size-5 rounded-md ${bankColor(a.bank)}`} />
              <span className="font-medium">{a.name}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {fmtBRL(a.initialBalance)}
              </span>
            </div>
          ))}
        </div>
      )}

      <EntriesList entries={entries} categories={categories} accounts={accounts} />
    </div>
  )
}
