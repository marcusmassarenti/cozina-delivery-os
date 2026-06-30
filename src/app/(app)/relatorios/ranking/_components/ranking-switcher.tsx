"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useNavigate } from "@/components/shared/navigation-progress"

import { cn } from "@/lib/utils"

export const RANKING_METRICAS = [
  { key: "faturamento", label: "Faturamento" },
  { key: "ticket", label: "Ticket médio" },
  { key: "margem", label: "Margem" },
  { key: "pedidos", label: "Pedidos" },
] as const

export type RankingMetrica = (typeof RANKING_METRICAS)[number]["key"]

export function RankingSwitcher({ current }: { current: RankingMetrica }) {
  const navigate = useNavigate()
  const pathname = usePathname()
  const sp = useSearchParams()

  const go = (m: string) => {
    const params = new URLSearchParams(sp.toString())
    params.set("metrica", m)
    navigate(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="inline-flex rounded-lg border bg-card p-0.5">
      {RANKING_METRICAS.map((m) => (
        <button
          key={m.key}
          type="button"
          onClick={() => go(m.key)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            current === m.key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}
