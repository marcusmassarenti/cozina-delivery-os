import { fmtBRL } from "@/lib/format"
import { formatPeriodLabel, parsePeriodParam } from "@/lib/period"
import { PeriodSelector } from "@/components/shared/period-selector"
import {
  getAccounts,
  getCaixaHoldingId,
  getCaixaSummary,
  getCaixaUnits,
  getCardAccountIds,
  getCategoriesFlat,
  getContacts,
  getEntries,
} from "@/lib/data/caixa"

import { EntriesList } from "../_components/entries-list"

export default async function LancamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; loja?: string }>
}) {
  const holdingId = await getCaixaHoldingId()
  if (!holdingId) return null

  const sp = await searchParams
  const loja = sp.loja
  const { year, month } = parsePeriodParam(sp.periodo)

  const [accounts, categories, cardIds, contacts, units, summary] = await Promise.all([
    getAccounts(holdingId),
    getCategoriesFlat(holdingId),
    getCardAccountIds(holdingId),
    getContacts(holdingId),
    getCaixaUnits(),
    getCaixaSummary(holdingId, year, month, loja),
  ])
  // Compras de cartão ficam na aba Cartões (não na lista do caixa).
  const entries = await getEntries(holdingId, { year, month, excludeAccountIds: cardIds, loja })

  const now = new Date()
  const periods: { year: number; month: number }[] = []
  for (let i = -2; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    periods.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }

  const chips = [
    { label: "Recebido", value: summary.receitaEfetivada, cls: "text-emerald-600" },
    { label: "Pago", value: summary.despesaEfetivada, cls: "text-rose-600" },
    { label: "A receber", value: summary.aReceber, cls: "text-emerald-500" },
    { label: "A pagar", value: summary.aPagar, cls: "text-amber-600" },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Movimentação de {formatPeriodLabel({ year, month })}
        </p>
        <PeriodSelector current={{ year, month }} options={periods} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {chips.map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-3 shadow-sm">
            <div className="text-[11px] font-medium text-muted-foreground">{c.label}</div>
            <div className={`mt-0.5 text-lg font-semibold tabular-nums ${c.cls}`}>
              {fmtBRL(c.value)}
            </div>
          </div>
        ))}
      </div>

      <EntriesList entries={entries} categories={categories} accounts={accounts} contacts={contacts} units={units} />
    </div>
  )
}
