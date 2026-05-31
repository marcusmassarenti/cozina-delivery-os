import { CreditCard, Receipt, Star, UtensilsCrossed } from "lucide-react"

import type {
  NinefoodCoverageCell,
  NinefoodCoverageMatrix,
} from "@/lib/data/ninefood-imported"

import { GapsByUnit, type UnitGap } from "./gaps-by-unit"
import {
  CoverageBadge,
  LegendItem,
  StatCard,
  StatusLegend,
} from "./coverage-shared"

/**
 * View da matriz 99 Food. 3 categorias:
 *  - L = Loja (financeiro diário) → ninefood_daily_loja
 *  - I = Item (cardápio diário) → ninefood_daily_item
 *  - P = Pedido (avaliações + cliente) → ninefood_pedidos
 */
export function NinefoodCoverageView({
  matrix,
  showRecentes = false,
}: {
  matrix: NinefoodCoverageMatrix
  /** Keeta: renderiza a 4ª coluna "Pedidos recentes" (R). 99 Food deixa false. */
  showRecentes?: boolean
}) {
  const activeUnits = matrix.units.filter((u) => u.active)
  const totalCells = activeUnits.length * matrix.months.length
  let lojaComplete = 0
  let lojaPartial = 0
  let itemComplete = 0
  let itemPartial = 0
  let pedidoComplete = 0
  let pedidoPartial = 0
  let recentesComplete = 0
  for (const u of activeUnits) {
    for (const m of matrix.months) {
      const c = u.cells[m.key]
      if (c.loja.status === "complete") lojaComplete++
      if (c.loja.status === "partial") lojaPartial++
      if (c.item.status === "complete") itemComplete++
      if (c.item.status === "partial") itemPartial++
      if (c.pedido.status === "complete") pedidoComplete++
      if (c.pedido.status === "partial") pedidoPartial++
      if (c.recentes?.status === "complete") recentesComplete++
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Stats */}
      <div className={`grid gap-3 sm:grid-cols-2 ${showRecentes ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <StatCard
          icon={Receipt}
          label="Dados da loja"
          complete={lojaComplete}
          partial={lojaPartial}
          total={totalCells}
          color="amber"
        />
        <StatCard
          icon={UtensilsCrossed}
          label="Dados do item"
          complete={itemComplete}
          partial={itemPartial}
          total={totalCells}
          color="blue"
        />
        <StatCard
          icon={Star}
          label="Dados do pedido"
          complete={pedidoComplete}
          partial={pedidoPartial}
          total={totalCells}
          color="emerald"
        />
        {showRecentes && (
          <StatCard
            icon={CreditCard}
            label="Pedidos recentes"
            complete={recentesComplete}
            partial={0}
            total={totalCells}
            color="violet"
          />
        )}
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
                  const c = u.cells[m.key]
                  return (
                    <td key={m.key} className="px-2 py-2 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <CoverageBadge
                          status={c.loja.status}
                          label="L"
                          tone="amber"
                          tooltip={lojaTooltip(c)}
                        />
                        <CoverageBadge
                          status={c.item.status}
                          label="I"
                          tone="blue"
                          tooltip={itemTooltip(c)}
                        />
                        <CoverageBadge
                          status={c.pedido.status}
                          label="P"
                          tone="emerald"
                          tooltip={pedidoTooltip(c)}
                        />
                        {showRecentes && (
                          <CoverageBadge
                            status={c.recentes?.status ?? "empty"}
                            label="R"
                            tone="violet"
                            tooltip={
                              (c.recentes?.totalPedidos ?? 0) > 0
                                ? `Pedidos recentes: ${c.recentes!.totalPedidos} pedidos`
                                : "Sem Pedidos recentes importado"
                            }
                          />
                        )}
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
          <LegendItem label="L" name="Loja (financeiro)" />
          <LegendItem label="I" name="Item (cardápio)" />
          <LegendItem label="P" name="Pedido (avaliação)" />
          {showRecentes && <LegendItem label="R" name="Pedidos recentes" />}
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
      <GapsByUnit gaps={buildGapsByUnit(matrix, showRecentes)} />
    </div>
  )
}

function buildGapsByUnit(
  matrix: NinefoodCoverageMatrix,
  showRecentes: boolean,
): UnitGap[] {
  const out: UnitGap[] = []
  for (const u of matrix.units) {
    if (!u.active) continue
    const months: UnitGap["months"] = []
    let totalMissing = 0
    let totalPartial = 0
    for (const m of matrix.months) {
      const c = u.cells[m.key]
      const items: UnitGap["months"][number]["items"] = []
      // Loja
      if (c.loja.status === "empty") {
        items.push({ label: "Dados da loja", severity: "missing" })
      } else if (c.loja.status === "partial") {
        items.push({
          label: `Loja parcial (${c.loja.diasImportados}/${c.loja.diasNoMes}d)`,
          severity: "partial",
        })
      }
      // Item
      if (c.item.status === "empty") {
        items.push({ label: "Dados do item", severity: "missing" })
      } else if (c.item.status === "partial") {
        items.push({
          label: `Item parcial (${c.item.diasImportados}d)`,
          severity: "partial",
        })
      }
      // Pedido
      if (c.pedido.status === "empty") {
        items.push({ label: "Dados do pedido", severity: "missing" })
      } else if (c.pedido.status === "partial") {
        items.push({
          label: `Pedido parcial (${c.pedido.diasComPedido}/${c.pedido.diasNoMes}d)`,
          severity: "partial",
        })
      }
      // Pedidos recentes (só Keeta)
      if (showRecentes && c.recentes?.status === "empty") {
        items.push({ label: "Pedidos recentes", severity: "missing" })
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

function lojaTooltip(c: NinefoodCoverageCell): string {
  if (c.loja.diasImportados === 0) return "Sem Dados da loja importado"
  return `Loja: ${c.loja.diasImportados} de ${c.loja.diasNoMes} dias importados`
}

function itemTooltip(c: NinefoodCoverageCell): string {
  if (c.item.diasImportados === 0) return "Sem Dados do item importado"
  return `Item: ${c.item.diasImportados} dia${c.item.diasImportados !== 1 ? "s" : ""} com cardápio`
}

function pedidoTooltip(c: NinefoodCoverageCell): string {
  if (c.pedido.totalPedidos === 0) return "Sem Dados do pedido importado"
  return `Pedido: ${c.pedido.totalPedidos} pedidos em ${c.pedido.diasComPedido} de ${c.pedido.diasNoMes} dias`
}
