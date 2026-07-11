import {
  CreditCard,
  Receipt,
  Star,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react"

import type {
  NinefoodCoverageCell,
  NinefoodCoverageMatrix,
} from "@/lib/data/ninefood-imported"
import type { CoverageStatus } from "@/lib/data/ifood-imported"

import { GapsByUnit, type UnitGap } from "./gaps-by-unit"
import {
  CoverageBadge,
  LegendItem,
  StatCard,
  StatusLegend,
} from "./coverage-shared"

type Tone = "blue" | "amber" | "emerald" | "rose" | "violet"
type ColId = "loja" | "item" | "pedido" | "recentes"

export type NineShow = Record<ColId, boolean>

type NineCol = {
  id: ColId
  label: string
  name: string
  tone: Tone
  icon: LucideIcon
  status: (c: NinefoodCoverageCell) => CoverageStatus
  partialGap: (c: NinefoodCoverageCell) => string | null
  tooltip: (c: NinefoodCoverageCell) => string
  gapLabel: string
}

const ALL_COLS: NineCol[] = [
  {
    id: "loja",
    label: "L",
    name: "Dados da loja",
    tone: "amber",
    icon: Receipt,
    status: (c) => c.loja.status,
    partialGap: (c) =>
      c.loja.status === "partial"
        ? `Loja parcial (${c.loja.diasImportados}/${c.loja.diasNoMes}d)`
        : null,
    tooltip: (c) =>
      c.loja.diasImportados === 0
        ? "Sem Dados da loja importado"
        : `Loja: ${c.loja.diasImportados} de ${c.loja.diasNoMes} dias importados`,
    gapLabel: "Dados da loja",
  },
  {
    id: "item",
    label: "I",
    name: "Dados do item",
    tone: "blue",
    icon: UtensilsCrossed,
    status: (c) => c.item.status,
    partialGap: (c) =>
      c.item.status === "partial"
        ? `Item parcial (${c.item.diasImportados}d)`
        : null,
    tooltip: (c) =>
      c.item.diasImportados === 0
        ? "Sem Dados do item importado"
        : `Item: ${c.item.diasImportados} dia${c.item.diasImportados !== 1 ? "s" : ""} com cardápio`,
    gapLabel: "Dados do item",
  },
  {
    id: "pedido",
    label: "P",
    name: "Dados do pedido",
    tone: "emerald",
    icon: Star,
    status: (c) => c.pedido.status,
    partialGap: (c) =>
      c.pedido.status === "partial"
        ? `Pedido parcial (${c.pedido.diasComPedido}/${c.pedido.diasNoMes}d)`
        : null,
    tooltip: (c) =>
      c.pedido.totalPedidos === 0
        ? "Sem Dados do pedido importado"
        : `Pedido: ${c.pedido.totalPedidos} pedidos em ${c.pedido.diasComPedido} de ${c.pedido.diasNoMes} dias`,
    gapLabel: "Dados do pedido",
  },
  {
    id: "recentes",
    label: "R",
    name: "Pedidos recentes",
    tone: "violet",
    icon: CreditCard,
    status: (c) => c.recentes?.status ?? "empty",
    partialGap: () => null,
    tooltip: (c) =>
      (c.recentes?.totalPedidos ?? 0) > 0
        ? `Pedidos recentes: ${c.recentes!.totalPedidos} pedidos`
        : "Sem Pedidos recentes importado",
    gapLabel: "Pedidos recentes",
  },
]

/**
 * View da matriz 99 Food / Keeta. Mostra só as colunas cujos relatórios a
 * operação habilitou (Minha conta → Relatórios).
 */
export function NinefoodCoverageView({
  matrix,
  show,
}: {
  matrix: NinefoodCoverageMatrix
  /** Quais colunas exibir (por relatório habilitado). */
  show: NineShow
}) {
  const cols = ALL_COLS.filter((c) => show[c.id])
  const activeUnits = matrix.units.filter((u) => u.active)

  let totalCells = 0
  const complete: Record<string, number> = {}
  const partial: Record<string, number> = {}
  for (const c of cols) {
    complete[c.id] = 0
    partial[c.id] = 0
  }
  for (const u of activeUnits) {
    for (const m of matrix.months) {
      const cell = u.cells[m.key]
      if (!cell.applicable) continue
      totalCells++
      for (const col of cols) {
        const s = col.status(cell)
        if (s === "complete") complete[col.id]++
        else if (s === "partial") partial[col.id]++
      }
    }
  }

  if (cols.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        Nenhum relatório dessa plataforma habilitado. Ligue em{" "}
        <a href="/minha-conta/relatorios" className="underline">
          Minha conta → Relatórios
        </a>
        .
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cols.map((c) => (
          <StatCard
            key={c.id}
            icon={c.icon}
            label={c.name}
            complete={complete[c.id]}
            partial={partial[c.id]}
            total={totalCells}
            color={c.tone}
          />
        ))}
      </div>

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
                            key={col.id}
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
      <div className="flex flex-wrap items-center gap-4 rounded-md border bg-card p-3 text-[11px]">
        <div className="flex items-center gap-3">
          <span className="font-semibold uppercase tracking-wider text-muted-foreground">
            Tipo
          </span>
          {cols.map((c) => (
            <LegendItem key={c.id} label={c.label} name={c.name} />
          ))}
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
      <GapsByUnit gaps={buildGapsByUnit(matrix, cols)} />
    </div>
  )
}

function buildGapsByUnit(
  matrix: NinefoodCoverageMatrix,
  cols: NineCol[],
): UnitGap[] {
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
          items.push({ label: col.gapLabel, severity: "missing" })
        } else if (s === "partial") {
          const pg = col.partialGap(c)
          if (pg) items.push({ label: pg, severity: "partial" })
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
