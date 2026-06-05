import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  ChevronDown,
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
 * Painel "Precisa de atenção": grade compacta de cards, um por loja (lado a
 * lado pra economizar espaço). O card fechado mostra loja + nº de alertas;
 * clicar abre os alertas dela e o link "Abrir loja". Vazio = estado positivo.
 *
 * <details>/<summary> nativo → expansão sem "use client".
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

  // Agrupa por loja preservando a ordem de severidade vinda do data layer.
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
    <div className="flex flex-col gap-2">
      {/* gira o chevron quando o card abre (sem JS no cliente) */}
      <style>{`.atencao summary{list-style:none}.atencao summary::-webkit-details-marker{display:none}.atencao details[open] .chev{transform:rotate(180deg)}`}</style>

      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
        <h2 className="text-sm font-semibold">Precisa de atenção</h2>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {lojas.length} loja{lojas.length !== 1 ? "s" : ""}
          {urgentes > 0 ? ` · ${urgentes} urgente${urgentes !== 1 ? "s" : ""}` : ""}
        </span>
      </div>

      <div className="atencao grid grid-cols-1 items-start gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {lojas.map((loja) => {
          const isAlta = temAlta(loja)
          const tipos = [...new Set(loja.items.map((i) => i.type))]
          return (
            <details
              key={loja.code}
              className={`group overflow-hidden rounded-lg border bg-card ${
                isAlta
                  ? "border-red-200 dark:border-red-900/50"
                  : "border-amber-200 dark:border-amber-900/50"
              }`}
            >
              <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/50">
                <span
                  className={`size-2 shrink-0 rounded-full ${
                    isAlta ? "bg-red-500" : "bg-amber-500"
                  }`}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {loja.name}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    #{loja.code}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                  {tipos.map((t) => {
                    const Icon = ICON[t]
                    return <Icon key={t} className="size-3.5" />
                  })}
                </span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                    isAlta
                      ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                  }`}
                >
                  {loja.items.length}
                </span>
                <ChevronDown className="chev size-4 shrink-0 text-muted-foreground transition-transform" />
              </summary>

              <div className="border-t bg-muted/20 px-3 py-2.5">
                <ul className="space-y-2">
                  {loja.items.map((it, i) => {
                    const Icon = ICON[it.type]
                    const itAlta = it.severity === "alta"
                    return (
                      <li key={`${it.type}-${i}`} className="flex items-start gap-2">
                        <Icon
                          className={`mt-0.5 size-3.5 shrink-0 ${
                            itAlta
                              ? "text-red-600 dark:text-red-400"
                              : "text-amber-700 dark:text-amber-400"
                          }`}
                        />
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
                          <p className="text-[11px] leading-snug text-muted-foreground">
                            {it.detail}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
                <Link
                  href={`/unidades/${loja.code}`}
                  className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Abrir loja
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </details>
          )
        })}
      </div>
    </div>
  )
}
