import { fmtBRL } from "@/lib/format"
import { formatPeriodLabel, formatRangeLabel } from "@/lib/period"
import { readPeriod } from "@/lib/period-helpers"
import { AlertTriangle } from "lucide-react"
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

import {
  getAReceberDelivery,
  somarPlataformas,
} from "@/lib/data/a-receber-delivery"
import { PlatformLogo } from "@/components/platform-logo"

import { EntriesList } from "../_components/entries-list"
import { OfxImport } from "../_components/ofx-import"

export default async function LancamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; inicio?: string; fim?: string; loja?: string }>
}) {
  const holdingId = await getCaixaHoldingId()
  if (!holdingId) return null

  const sp = await searchParams
  const loja = sp.loja
  const { range: periodRange, year, month, isFullMonth } = readPeriod(sp)

  const [accounts, categories, cardIds, contacts, units, summary, porLoja] =
    await Promise.all([
      getAccounts(holdingId),
      getCategoriesFlat(holdingId),
      getCardAccountIds(holdingId),
      getContacts(holdingId),
      getCaixaUnits(),
      getCaixaSummary(holdingId, year, month, loja),
      getAReceberDelivery(loja),
    ])
  const delivery = somarPlataformas(porLoja)
  // Compras de cartão ficam na aba Cartões (não na lista do caixa).
  const entries = await getEntries(holdingId, { year, month, excludeAccountIds: cardIds, loja })
  // Contas vencidas e não pagas de QUALQUER mês — senão uma conta em atraso de
  // um mês anterior sumia da lista (vive na competência dela).
  const monthIds = new Set(entries.map((e) => e.id))
  const emAberto = (
    await getEntries(holdingId, { openOverdue: true, excludeAccountIds: cardIds, loja })
  ).filter((e) => !monthIds.has(e.id))
  const totalEmAberto = emAberto.reduce(
    (s, e) => s + (e.kind === "despesa" ? e.value : -e.value),
    0,
  )

  const now = new Date()
  const periods: { year: number; month: number }[] = []
  for (let i = -2; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    periods.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }

  // Repasse de delivery que ainda não caiu. Aqui, ao contrário do comparativo
  // da Visão Geral (que é consolidado), a quebra por plataforma aparece: é a
  // tela da loja, e quem cobra repasse cobra de um marketplace por vez.
  const plataformas = (
    [
      { id: "ifood", nome: "iFood", valor: delivery.ifood },
      { id: "99food", nome: "99 Food", valor: delivery.ninefood },
      { id: "keeta", nome: "Keeta", valor: delivery.keeta },
    ] as const
  ).filter((p) => p.valor > 0)

  const chips = [
    { label: "Recebido", value: summary.receitaEfetivada, cls: "text-emerald-600" },
    { label: "Pago", value: summary.despesaEfetivada, cls: "text-rose-600" },
    {
      label: "A receber",
      value: summary.aReceber + delivery.total,
      cls: "text-emerald-500",
      plataformas,
    },
    { label: "A pagar", value: summary.aPagar, cls: "text-amber-600" },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Movimentação de {formatRangeLabel(periodRange)}
        </p>
        <div className="flex items-center gap-2">
          <OfxImport accounts={accounts} />
          <PeriodSelector current={periodRange} options={periods} enableRange />
        </div>
      </div>

      {!isFullMonth && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          <span>
            Caixa lista o <strong>mês inteiro</strong>. Mostrando <strong>{formatPeriodLabel({ year, month })}</strong>.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {chips.map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-3 shadow-sm">
            <div className="text-[11px] font-medium text-muted-foreground">{c.label}</div>
            <div className={`mt-0.5 text-lg font-semibold tabular-nums ${c.cls}`}>
              {fmtBRL(c.value)}
            </div>
            {c.plataformas && c.plataformas.length > 0 && (
              <div className="mt-2 flex flex-col gap-1 border-t pt-2">
                {c.plataformas.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
                  >
                    <span className="flex items-center gap-1.5">
                      <PlatformLogo platform={p.id} className="size-3.5 rounded-[3px]" />
                      {p.nome}
                    </span>
                    <span className="tabular-nums">{fmtBRL(p.valor)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {emAberto.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-900/40 dark:bg-rose-950/20">
          <div className="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-400">
            <AlertTriangle className="size-4" />
            Em aberto de meses anteriores ({emAberto.length}) ·{" "}
            <span className="tabular-nums">{fmtBRL(Math.abs(totalEmAberto))}</span>
            {totalEmAberto >= 0 ? " a pagar" : " a receber"}
          </div>
          <EntriesList
            entries={emAberto}
            categories={categories}
            accounts={accounts}
            contacts={contacts}
            units={units}
          />
        </div>
      )}

      <EntriesList entries={entries} categories={categories} accounts={accounts} contacts={contacts} units={units} />
    </div>
  )
}
