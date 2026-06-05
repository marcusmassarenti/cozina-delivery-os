import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  ChevronRight,
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

type Grupo = {
  code: string
  name: string
  items: AttentionItem[]
}

/**
 * Painel "Precisa de atenção": uma linha discreta por loja (loja + nº de
 * alertas). Clicar na loja expande os alertas dela (faturamento caindo,
 * cancelamento, CMV, parou de importar, nota baixa). Vazio = estado positivo.
 *
 * Usa <details>/<summary> nativo → colapsável sem "use client".
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

  // Agrupa por loja preservando a ordem de severidade já vinda do data layer.
  const byUnit = new Map<string, Grupo>()
  for (const it of items) {
    let g = byUnit.get(it.unitId)
    if (!g) {
      g = { code: it.unitCode, name: it.unitName, items: [] }
      byUnit.set(it.unitId, g)
    }
    g.items.push(it)
  }
  const temAlta = (g: Grupo) => g.items.some((i) => i.severity === "alta")
  const lojas = [...byUnit.values()].sort(
    (a, b) =>
      Number(temAlta(b)) - Number(temAlta(a)) || b.items.length - a.items.length,
  )

  const urgentes = items.filter((i) => i.severity === "alta").length

  return (
    <div className="overflow-hidden rounded-xl border border-amber-200 bg-card dark:border-amber-900/50">
      {/* Rotação do chevron + sem o triângulo nativo do <summary> */}
      <style>{`.atencao summary{list-style:none}.atencao summary::-webkit-details-marker{display:none}.atencao details[open] .chev{transform:rotate(90deg)}`}</style>

      <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-amber-900/50 dark:bg-amber-950/30">
        <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
        <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Precisa de atenção
        </h2>
        <span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
          {lojas.length} loja{lojas.length !== 1 ? "s" : ""}
          {urgentes > 0 ? ` · ${urgentes} urgente${urgentes !== 1 ? "s" : ""}` : ""}
        </span>
      </div>

      <ul className="atencao divide-y">
        {lojas.map((loja) => {
          const isAlta = temAlta(loja)
          // tipos distintos pra mostrar ícones-resumo na linha colapsada
          const tipos = [...new Set(loja.items.map((i) => i.type))]
          return (
            <li key={loja.code}>
              <details>
                <summary className="flex cursor-pointer select-none items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-muted/50">
                  <ChevronRight className="chev size-4 shrink-0 text-muted-foreground transition-transform" />
                  <span
                    className={`size-2 shrink-0 rounded-full ${
                      isAlta ? "bg-red-500" : "bg-amber-500"
                    }`}
                  />
                  <span className="truncate text-sm font-medium">
                    {loja.name}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      #{loja.code}
                    </span>
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-1.5">
                    <span className="hidden items-center gap-1 text-muted-foreground sm:flex">
                      {tipos.map((t) => {
                        const Icon = ICON[t]
                        return <Icon key={t} className="size-3.5" />
                      })}
                    </span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                        isAlta
                          ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                      }`}
                    >
                      {loja.items.length}
                    </span>
                  </span>
                </summary>

                <div className="border-t bg-muted/20 px-4 py-3">
                  <ul className="space-y-2">
                    {loja.items.map((it, i) => {
                      const Icon = ICON[it.type]
                      const itAlta = it.severity === "alta"
                      return (
                        <li key={`${it.type}-${i}`} className="flex items-start gap-2.5">
                          <span
                            className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
                              itAlta
                                ? "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                            }`}
                          >
                            <Icon className="size-3.5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <span
                              className={`text-xs font-semibold ${
                                itAlta
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-amber-700 dark:text-amber-400"
                              }`}
                            >
                              {it.title}
                            </span>
                            <p className="text-xs text-muted-foreground">
                              {it.detail}
                            </p>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                  <Link
                    href={`/unidades/${loja.code}`}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Abrir loja
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </details>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
