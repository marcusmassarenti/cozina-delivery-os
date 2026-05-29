import {
  CalendarRange,
  DollarSign,
  Receipt,
  ShoppingBag,
  TrendingUp,
  XCircle,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type { DailyReportMatrix } from "@/lib/data/relatorio-diario"
import { fmtBRL, fmtBRLShort, fmtNum, fmtPct } from "@/lib/format"

/**
 * KPIs de resumo do mês (sempre faturamento-cêntricos, independente do
 * switcher de métrica). Derivados da matriz.
 */
export function RelatorioKpis({ matrix }: { matrix: DailyReportMatrix }) {
  const { totalFaturamento, totalPedidos, totalCancelamentos, networkByDay } =
    matrix

  const ticket = totalPedidos > 0 ? totalFaturamento / totalPedidos : 0
  const cancelPct =
    totalPedidos > 0 ? (totalCancelamentos / totalPedidos) * 100 : 0

  // Dias com venda + melhor dia
  const diasComVenda = matrix.days.filter(
    (d) => (networkByDay.faturamento[d] ?? 0) > 0,
  )
  const mediaDia =
    diasComVenda.length > 0 ? totalFaturamento / diasComVenda.length : 0
  let melhorDia = 0
  let melhorVal = 0
  for (const d of matrix.days) {
    const v = networkByDay.faturamento[d] ?? 0
    if (v > melhorVal) {
      melhorVal = v
      melhorDia = d
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Kpi
        icon={DollarSign}
        label="Faturamento do mês"
        value={fmtBRLShort(totalFaturamento)}
        hint="bruto · todas as lojas"
      />
      <Kpi
        icon={ShoppingBag}
        label="Pedidos"
        value={fmtNum(totalPedidos)}
        hint="no mês"
      />
      <Kpi
        icon={Receipt}
        label="Ticket médio"
        value={ticket > 0 ? fmtBRL(ticket) : "—"}
        hint="por pedido"
      />
      <Kpi
        icon={XCircle}
        label="Cancelamento"
        value={fmtPct(cancelPct)}
        hint={`${fmtNum(totalCancelamentos)} pedidos`}
        tone={cancelPct >= 5 ? "warning" : "neutral"}
      />
      <Kpi
        icon={TrendingUp}
        label="Média por dia"
        value={fmtBRLShort(mediaDia)}
        hint={`${diasComVenda.length} dias com venda`}
      />
      <Kpi
        icon={CalendarRange}
        label="Melhor dia"
        value={melhorDia > 0 ? `Dia ${String(melhorDia).padStart(2, "0")}` : "—"}
        hint={melhorVal > 0 ? fmtBRLShort(melhorVal) : "sem dados"}
        tone="positive"
      />
    </div>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: LucideIcon
  label: string
  value: string
  hint: string
  tone?: "neutral" | "positive" | "warning"
}) {
  const accent =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground"
  return (
    <div className="rounded-xl border bg-card p-3.5 shadow-sm">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-foreground">
        <Icon className="size-3.5" />
      </div>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-bold tracking-tight tabular-nums">
        {value}
      </p>
      <p className={`mt-0.5 text-[10px] font-medium ${accent}`}>{hint}</p>
    </div>
  )
}
