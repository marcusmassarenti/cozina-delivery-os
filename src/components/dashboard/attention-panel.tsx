import Link from "next/link"
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Inbox,
  Star,
  TrendingDown,
  Wallet,
  type LucideIcon,
} from "lucide-react"

import type { AttentionItem, AttentionType } from "@/lib/data/attention"

const ICON: Record<AttentionType, LucideIcon> = {
  import: Inbox,
  faturamento: TrendingDown,
  cancelamento: Ban,
  cmv: Wallet,
  nota: Star,
}

/**
 * Painel "Precisa de atenção": lista compacta das lojas com sinal de problema
 * no mês (faturamento caindo, cancelamento alto, CMV alto, parou de importar,
 * nota baixa). Cada linha leva pra loja. Vazio = estado positivo (tudo certo).
 */
export function AttentionPanel({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
        <CheckCircle2 className="size-4 shrink-0" />
        Nenhum alerta este mês — todas as lojas no azul.
      </div>
    )
  }

  const altas = items.filter((i) => i.severity === "alta").length

  return (
    <div className="overflow-hidden rounded-xl border border-amber-200 bg-card dark:border-amber-900/50">
      <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/30">
        <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
        <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Precisa de atenção
        </h2>
        <span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
          {items.length}
          {altas > 0 ? ` · ${altas} urgente${altas !== 1 ? "s" : ""}` : ""}
        </span>
      </div>
      <ul className="divide-y">
        {items.map((it, i) => {
          const Icon = ICON[it.type]
          const isAlta = it.severity === "alta"
          return (
            <li key={`${it.unitId}-${it.type}-${i}`}>
              <Link
                href={`/unidades/${it.unitCode}`}
                className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
              >
                <span
                  className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${
                    isAlta
                      ? "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                  }`}
                >
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium">
                      {it.unitName}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        #{it.unitCode}
                      </span>
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        isAlta
                          ? "text-red-600 dark:text-red-400"
                          : "text-amber-700 dark:text-amber-400"
                      }`}
                    >
                      {it.title}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{it.detail}</p>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
