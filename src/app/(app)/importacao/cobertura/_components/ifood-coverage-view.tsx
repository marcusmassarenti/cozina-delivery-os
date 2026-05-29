import { Info, Receipt, Star, UtensilsCrossed } from "lucide-react"

import type {
  CoverageCell,
  CoverageMatrix,
  CoverageStatus,
} from "@/lib/data/ifood-imported"

import { GapsByUnit, type UnitGap } from "./gaps-by-unit"
import {
  CoverageBadge,
  LegendItem,
  StatCard,
  StatusLegend,
} from "./coverage-shared"

/**
 * View da matriz de cobertura iFood — extraída pra suportar o
 * PlatformSwitcher na página principal.
 */
export function IfoodCoverageView({ matrix }: { matrix: CoverageMatrix }) {
  const activeUnits = matrix.units.filter((u) => u.active)
  const totalCells = activeUnits.length * matrix.months.length
  let cardapioComplete = 0
  let cardapioPartial = 0
  let financeiroComplete = 0
  let financeiroPartial = 0
  let avaliacoesComplete = 0
  for (const u of activeUnits) {
    for (const m of matrix.months) {
      const c = u.cells[m.key]
      if (c.cardapio.status === "complete") cardapioComplete++
      if (c.cardapio.status === "partial") cardapioPartial++
      if (c.financeiro.status === "complete") financeiroComplete++
      if (c.financeiro.status === "partial") financeiroPartial++
      if (c.avaliacoes.status === "complete") avaliacoesComplete++
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={UtensilsCrossed}
          label="Cardápio"
          complete={cardapioComplete}
          partial={cardapioPartial}
          total={totalCells}
          color="blue"
        />
        <StatCard
          icon={Receipt}
          label="Financeiro"
          complete={financeiroComplete}
          partial={financeiroPartial}
          total={totalCells}
          color="amber"
        />
        <StatCard
          icon={Star}
          label="Avaliações"
          complete={avaliacoesComplete}
          partial={0}
          total={totalCells}
          color="emerald"
        />
      </div>

      {/* Aviso: por que o Financeiro aparece "parcial" */}
      {financeiroPartial > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <strong>Financeiro &quot;parcial&quot; quase sempre não é dado
            faltando.</strong>{" "}
            O relatório de repasse do iFood fecha os últimos dias do mês só no
            relatório do mês seguinte (defasagem de liquidação). Por isso o dado
            costuma ir só até meados do mês — nas lacunas abaixo aparece até que
            dia cada loja tem importado. Pra completar, re-puxe o mês depois que
            o iFood liquidar tudo.
          </span>
        </div>
      )}

      {/* Matriz */}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="sticky left-0 z-10 bg-muted/40 px-4 py-3 text-left font-semibold">
                Unidade
              </th>
              {matrix.months.map((m) => (
                <th
                  key={m.key}
                  className="px-2 py-3 text-center font-semibold tabular-nums"
                >
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.units.map((u) => (
              <tr
                key={u.id}
                className={`border-t hover:bg-muted/20 ${!u.active ? "opacity-50" : ""}`}
              >
                <td className="sticky left-0 z-10 bg-card px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
                      #{u.code}
                    </span>
                    <span className="text-xs font-medium">{u.name}</span>
                    {!u.active && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                        Inativa
                      </span>
                    )}
                  </div>
                </td>
                {matrix.months.map((m) => {
                  const c = u.cells[m.key]
                  return (
                    <td key={m.key} className="px-2 py-2 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <CoverageBadge
                          status={c.cardapio.status}
                          label="C"
                          tone="blue"
                          tooltip={cardapioTooltip(c)}
                        />
                        <CoverageBadge
                          status={c.financeiro.status}
                          label="F"
                          tone="amber"
                          tooltip={financeiroTooltip(c)}
                        />
                        <CoverageBadge
                          status={c.avaliacoes.status}
                          label="A"
                          tone="emerald"
                          tooltip={
                            c.avaliacoes.count > 0
                              ? `${c.avaliacoes.count} avaliações`
                              : "Sem Avaliações"
                          }
                        />
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-4 rounded-md border bg-card p-3 text-[11px]">
        <div className="flex items-center gap-3">
          <span className="font-semibold uppercase tracking-wider text-muted-foreground">
            Tipo
          </span>
          <LegendItem label="C" name="Cardápio" />
          <LegendItem label="F" name="Financeiro" />
          <LegendItem label="A" name="Avaliações" />
        </div>
        <div className="flex items-center gap-3 border-l pl-4">
          <span className="font-semibold uppercase tracking-wider text-muted-foreground">
            Status
          </span>
          <StatusLegend status="complete" label="Completo" />
          <StatusLegend status="partial" label="Parcial" />
          <StatusLegend status="empty" label="Falta" />
        </div>
        <span className="ml-auto text-muted-foreground">
          Passa o mouse em cada badge pra ver detalhes
        </span>
      </div>

      {/* Lacunas */}
      <GapsByUnit gaps={buildGapsByUnit(matrix)} />
    </div>
  )
}

function buildGapsByUnit(matrix: CoverageMatrix): UnitGap[] {
  const out: UnitGap[] = []
  for (const u of matrix.units) {
    if (!u.active) continue
    const months: UnitGap["months"] = []
    let totalMissing = 0
    let totalPartial = 0
    for (const m of matrix.months) {
      const c = u.cells[m.key]
      const items: UnitGap["months"][number]["items"] = []
      if (c.cardapio.status === "empty") {
        items.push({ label: "Cardápio", severity: "missing" })
      } else if (c.cardapio.status === "partial") {
        items.push({
          label: `Cardápio parcial (${c.cardapio.dailyDays}d)`,
          severity: "partial",
        })
      }
      if (c.financeiro.status === "empty") {
        items.push({ label: "Financeiro", severity: "missing" })
      } else if (c.financeiro.status === "partial") {
        const ate = c.financeiro.lastData
          ? ` · até ${formatDate(c.financeiro.lastData)}`
          : ""
        items.push({
          label: `Financeiro ${c.financeiro.diasComVenda}/${c.financeiro.diasNoMes}d${ate}`,
          severity: "partial",
        })
      }
      if (c.avaliacoes.status === "empty") {
        items.push({ label: "Avaliações", severity: "missing" })
      }
      if (items.length === 0) continue
      for (const it of items) {
        if (it.severity === "missing") totalMissing++
        else totalPartial++
      }
      months.push({ monthLabel: m.label, items })
    }
    if (months.length === 0) continue
    out.push({
      unitCode: u.code,
      unitName: u.name,
      totalMissing,
      totalPartial,
      months,
    })
  }
  out.sort((a, b) => {
    if (a.totalMissing !== b.totalMissing)
      return b.totalMissing - a.totalMissing
    return b.totalPartial - a.totalPartial
  })
  return out
}

function cardapioTooltip(c: CoverageCell): string {
  const parts: string[] = []
  if (c.cardapio.dailyDays > 0) {
    parts.push(
      `${c.cardapio.dailyDays} dia${c.cardapio.dailyDays !== 1 ? "s" : ""} diário${c.cardapio.dailyDays !== 1 ? "s" : ""}`,
    )
  }
  if (c.cardapio.hasPeriodo) parts.push("snapshot do período")
  if (parts.length === 0) return "Sem Cardápio importado"
  return `Cardápio: ${parts.join(" + ")}`
}

function financeiroTooltip(c: CoverageCell): string {
  const f = c.financeiro
  if (f.diasComVenda === 0) return "Sem Financeiro importado"
  const range =
    f.firstData && f.lastData
      ? ` (${formatDate(f.firstData)} → ${formatDate(f.lastData)})`
      : ""
  const base = `Financeiro: ${f.diasComVenda} de ${f.diasNoMes} dias com vendas${range}`
  if (f.status === "partial") {
    return `${base} · iFood costuma fechar os últimos dias só no relatório do mês seguinte.`
  }
  return base
}

function formatDate(d: string): string {
  const [, mm, dd] = d.split("-")
  return `${dd}/${mm}`
}

// Re-export pra TS encontrar
export type { CoverageStatus }
