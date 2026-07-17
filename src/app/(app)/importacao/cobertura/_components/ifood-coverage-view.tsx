import {
  Award,
  CreditCard,
  Gauge,
  Handshake,
  Info,
  Receipt,
  Star,
  Ticket,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react"

import type {
  CoverageCell,
  CoverageMatrix,
  CoverageStatus,
} from "@/lib/data/ifood-imported"
import type { ReportKey } from "@/lib/reports-catalog"

import { GapsByUnit, type UnitGap } from "./gaps-by-unit"
import {
  CoverageBadge,
  LegendItem,
  StatCard,
  StatusLegend,
} from "./coverage-shared"

type Tone = "blue" | "amber" | "emerald" | "rose" | "violet"

type Col = {
  key: ReportKey
  label: string
  name: string
  tone: Tone
  icon: LucideIcon
  status: (c: CoverageCell) => CoverageStatus
  tooltip: (c: CoverageCell) => string
}

const ALL_COLS: Col[] = [
  {
    key: "ifood_cardapio",
    label: "C",
    name: "Cardápio",
    tone: "blue",
    icon: UtensilsCrossed,
    status: (c) => c.cardapio.status,
    tooltip: cardapioTooltip,
  },
  {
    key: "ifood_financeiro",
    label: "F",
    name: "Financeiro",
    tone: "amber",
    icon: Receipt,
    status: (c) => c.financeiro.status,
    tooltip: financeiroTooltip,
  },
  {
    key: "ifood_avaliacoes",
    label: "A",
    name: "Avaliações",
    tone: "emerald",
    icon: Star,
    status: (c) => c.avaliacoes.status,
    tooltip: (c) =>
      c.avaliacoes.count > 0
        ? `${c.avaliacoes.count} avaliações`
        : "Sem Avaliações",
  },
  {
    key: "ifood_pedidos",
    label: "P",
    name: "Pedidos (VR)",
    tone: "violet",
    icon: CreditCard,
    status: (c) => c.pedidos.status,
    tooltip: (c) =>
      c.pedidos.imported
        ? "Relatório de pedidos (VR) importado"
        : "Sem Relatório de pedidos (VR)",
  },
  {
    key: "ifood_qualidade",
    label: "Q",
    name: "Qualidade",
    tone: "blue",
    icon: Gauge,
    status: (c) => c.qualidade.status,
    tooltip: (c) =>
      c.qualidade.status === "complete"
        ? "Qualidade da operação importada"
        : "Sem Qualidade da operação",
  },
  {
    key: "ifood_promocoes",
    label: "Pr",
    name: "Promoções",
    tone: "emerald",
    icon: Ticket,
    status: (c) => c.promocoes.status,
    tooltip: (c) =>
      c.promocoes.status === "complete"
        ? "Promoções importadas"
        : "Sem Promoções",
  },
  {
    key: "ifood_super",
    label: "S",
    name: "Super",
    tone: "amber",
    icon: Award,
    status: (c) => c.super.status,
    tooltip: (c) =>
      c.super.status === "complete"
        ? "Super Restaurante importado"
        : "Sem Super Restaurante",
  },
  {
    key: "ifood_negociacoes",
    label: "N",
    name: "Negociações",
    tone: "violet",
    icon: Handshake,
    status: (c) => c.negociacoes.status,
    tooltip: (c) =>
      c.negociacoes.status === "complete"
        ? "Negociações importadas"
        : "Sem Negociações",
  },
]

/**
 * View da matriz de cobertura iFood. Mostra só os relatórios que a operação
 * habilitou (Minha conta → Relatórios).
 */
export function IfoodCoverageView({
  matrix,
  enabled,
}: {
  matrix: CoverageMatrix
  enabled: ReportKey[]
}) {
  const enabledSet = new Set(enabled)
  const cols = ALL_COLS.filter((c) => enabledSet.has(c.key))
  const activeUnits = matrix.units.filter((u) => u.active)

  // Contagem por coluna (só células aplicáveis).
  let totalCells = 0
  const complete: Record<string, number> = {}
  const partial: Record<string, number> = {}
  for (const c of cols) {
    complete[c.key] = 0
    partial[c.key] = 0
  }
  for (const u of activeUnits) {
    for (const m of matrix.months) {
      const cell = u.cells[m.key]
      if (!cell.applicable) continue
      totalCells++
      for (const col of cols) {
        const s = col.status(cell)
        if (s === "complete") complete[col.key]++
        else if (s === "partial") partial[col.key]++
      }
    }
  }

  const financeiroOn = enabledSet.has("ifood_financeiro")

  return (
    <div className="flex flex-col gap-6">
      {/* Stats por relatório ligado */}
      {cols.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {cols.map((c) => (
            <StatCard
              key={c.key}
              icon={c.icon}
              label={c.name}
              complete={complete[c.key]}
              partial={partial[c.key]}
              total={totalCells}
              color={c.tone}
            />
          ))}
        </div>
      )}

      {/* Aviso: por que o Financeiro aparece "parcial" */}
      {financeiroOn && partial["ifood_financeiro"] > 0 && (
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

      {cols.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhum relatório do iFood habilitado. Ligue em{" "}
          <a href="/minha-conta/relatorios" className="underline">
            Minha conta → Relatórios
          </a>
          .
        </div>
      ) : (
        <>
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
                      const cell = u.cells[m.key]
                      if (!cell.applicable) {
                        return (
                          <td key={m.key} className="px-2 py-2 text-center">
                            <span
                              className="text-[10px] text-muted-foreground/40"
                              title="Não se aplica: loja não usa essa plataforma, ou está fora do período de operação."
                            >
                              N/A
                            </span>
                          </td>
                        )
                      }
                      return (
                        <td key={m.key} className="px-2 py-2 text-center">
                          <div className="flex flex-wrap items-center justify-center gap-0.5">
                            {cols.map((col) => (
                              <CoverageBadge
                                key={col.key}
                                status={col.status(cell)}
                                label={col.label}
                                tone={col.tone}
                                tooltip={col.tooltip(cell)}
                              />
                            ))}
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
          {/* O flex-wrap precisa estar TAMBÉM nas linhas de dentro: o pai
              quebrar não adianta, porque cada linha interna é um item só —
              os 7 tipos em nowrap vazavam 405px no mobile. */}
          <div className="flex flex-wrap items-center gap-4 rounded-md border bg-card p-3 text-[11px]">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                Tipo
              </span>
              {cols.map((c) => (
                <LegendItem key={c.key} label={c.label} name={c.name} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:border-l sm:pl-4">
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
          <GapsByUnit gaps={buildGapsByUnit(matrix, cols)} />
        </>
      )}
    </div>
  )
}

function buildGapsByUnit(matrix: CoverageMatrix, cols: Col[]): UnitGap[] {
  const out: UnitGap[] = []
  for (const u of matrix.units) {
    if (!u.active) continue
    const months: UnitGap["months"] = []
    let totalMissing = 0
    let totalPartial = 0
    for (const m of matrix.months) {
      const c = u.cells[m.key]
      if (!c.applicable) continue
      const items: UnitGap["months"][number]["items"] = []
      for (const col of cols) {
        const s = col.status(c)
        if (s === "empty") {
          items.push({ label: col.name, severity: "missing" })
        } else if (s === "partial") {
          // Só Cardápio e Financeiro têm "parcial" com detalhe.
          if (col.key === "ifood_cardapio") {
            items.push({
              label: `Cardápio parcial (${c.cardapio.dailyDays}d)`,
              severity: "partial",
            })
          } else if (col.key === "ifood_financeiro") {
            const ate = c.financeiro.lastData
              ? ` · até ${formatDate(c.financeiro.lastData)}`
              : ""
            items.push({
              label: `Financeiro ${c.financeiro.diasComVenda}/${c.financeiro.diasNoMes}d${ate}`,
              severity: "partial",
            })
          } else {
            items.push({ label: `${col.name} parcial`, severity: "partial" })
          }
        }
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
    if (a.totalMissing !== b.totalMissing) return b.totalMissing - a.totalMissing
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

export type { CoverageStatus }
