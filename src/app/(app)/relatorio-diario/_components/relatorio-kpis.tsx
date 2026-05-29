import {
  CalendarRange,
  DollarSign,
  Percent,
  Receipt,
  ShoppingBag,
  TrendingUp,
  XCircle,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import type { DailyReportMatrix } from "@/lib/data/relatorio-diario"
import type { DailyMetric } from "@/lib/data/relatorio-diario-types"
import { fmtBRL, fmtBRLShort, fmtNum, fmtPct } from "@/lib/format"

type KpiDef = {
  icon: LucideIcon
  label: string
  value: string
  hint: string
  tone?: "neutral" | "positive" | "warning"
}

/**
 * KPIs do mês — contextuais por métrica:
 *  - Faturamento → conjunto completo
 *  - Pedidos → só cards de pedido
 *  - Cancelamentos → só cards de cancelamento
 */
export function RelatorioKpis({
  matrix,
  metric,
}: {
  matrix: DailyReportMatrix
  metric: DailyMetric
}) {
  const { totalFaturamento, totalPedidos, totalCancelamentos, networkByDay, days } =
    matrix

  const ticket = totalPedidos > 0 ? totalFaturamento / totalPedidos : 0
  const cancelPct =
    totalPedidos > 0 ? (totalCancelamentos / totalPedidos) * 100 : 0

  // Melhor/pior dia por dimensão
  const best = (rec: Record<number, number>) => {
    let bd = 0
    let bv = 0
    for (const d of days) {
      const v = rec[d] ?? 0
      if (v > bv) {
        bv = v
        bd = d
      }
    }
    return { day: bd, value: bv }
  }
  const diasFat = days.filter((d) => (networkByDay.faturamento[d] ?? 0) > 0)
  const diasPed = days.filter((d) => (networkByDay.pedidos[d] ?? 0) > 0)
  const melhorFat = best(networkByDay.faturamento)
  const melhorPed = best(networkByDay.pedidos)

  // Pior dia de cancelamento = maior taxa (cancel/pedidos) no dia
  let piorCancelDia = 0
  let piorCancelRate = 0
  for (const d of days) {
    const c = networkByDay.cancelamentos[d] ?? 0
    const p = networkByDay.pedidos[d] ?? 0
    const rate = p > 0 ? (c / p) * 100 : 0
    if (rate > piorCancelRate) {
      piorCancelRate = rate
      piorCancelDia = d
    }
  }

  const dia = (d: number) => `Dia ${String(d).padStart(2, "0")}`

  let kpis: KpiDef[]

  if (metric === "pedidos") {
    kpis = [
      {
        icon: ShoppingBag,
        label: "Pedidos do mês",
        value: fmtNum(totalPedidos),
        hint: "todas as lojas",
      },
      {
        icon: TrendingUp,
        label: "Média por dia",
        value: diasPed.length > 0 ? fmtNum(Math.round(totalPedidos / diasPed.length)) : "—",
        hint: `${diasPed.length} dias com pedido`,
      },
      {
        icon: CalendarRange,
        label: "Melhor dia",
        value: melhorPed.day > 0 ? dia(melhorPed.day) : "—",
        hint: melhorPed.value > 0 ? `${fmtNum(melhorPed.value)} pedidos` : "sem dados",
        tone: "positive",
      },
      {
        icon: Receipt,
        label: "Ticket médio",
        value: ticket > 0 ? fmtBRL(ticket) : "—",
        hint: "por pedido",
      },
    ]
  } else if (metric === "cancelamentos") {
    kpis = [
      {
        icon: Percent,
        label: "Taxa de cancelamento",
        value: fmtPct(cancelPct),
        hint: "sobre os pedidos do mês",
        tone: cancelPct >= 5 ? "warning" : "neutral",
      },
      {
        icon: XCircle,
        label: "Pedidos cancelados",
        value: fmtNum(totalCancelamentos),
        hint: `de ${fmtNum(totalPedidos)} pedidos`,
        tone: "warning",
      },
      {
        icon: CalendarRange,
        label: "Pior dia",
        value: piorCancelDia > 0 ? dia(piorCancelDia) : "—",
        hint: piorCancelRate > 0 ? `${fmtPct(piorCancelRate)} de cancelamento` : "sem cancelamentos",
        tone: "warning",
      },
      {
        icon: ShoppingBag,
        label: "Pedidos no mês",
        value: fmtNum(totalPedidos),
        hint: "base de cálculo",
      },
    ]
  } else {
    // faturamento → conjunto completo
    kpis = [
      {
        icon: DollarSign,
        label: "Faturamento do mês",
        value: fmtBRLShort(totalFaturamento),
        hint: "bruto · todas as lojas",
      },
      {
        icon: ShoppingBag,
        label: "Pedidos",
        value: fmtNum(totalPedidos),
        hint: "no mês",
      },
      {
        icon: Receipt,
        label: "Ticket médio",
        value: ticket > 0 ? fmtBRL(ticket) : "—",
        hint: "por pedido",
      },
      {
        icon: Percent,
        label: "Cancelamento",
        value: fmtPct(cancelPct),
        hint: `${fmtNum(totalCancelamentos)} pedidos`,
        tone: cancelPct >= 5 ? "warning" : "neutral",
      },
      {
        icon: TrendingUp,
        label: "Média por dia",
        value: fmtBRLShort(diasFat.length > 0 ? totalFaturamento / diasFat.length : 0),
        hint: `${diasFat.length} dias com venda`,
      },
      {
        icon: CalendarRange,
        label: "Melhor dia",
        value: melhorFat.day > 0 ? dia(melhorFat.day) : "—",
        hint: melhorFat.value > 0 ? fmtBRLShort(melhorFat.value) : "sem dados",
        tone: "positive",
      },
    ]
  }

  return (
    <div
      className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${
        kpis.length === 6 ? "lg:grid-cols-6" : "lg:grid-cols-4"
      }`}
    >
      {kpis.map((k) => (
        <Kpi key={k.label} {...k} />
      ))}
    </div>
  )
}

function Kpi({ icon: Icon, label, value, hint, tone = "neutral" }: KpiDef) {
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
