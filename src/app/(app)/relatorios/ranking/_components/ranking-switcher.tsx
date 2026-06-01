"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { cn } from "@/lib/utils"

export const RANKING_METRICAS = [
  { key: "faturamento", label: "Faturamento" },
  { key: "ticket", label: "Ticket médio" },
  { key: "margem", label: "Margem" },
  { key: "pedidos", label: "Pedidos" },
] as const

export type RankingMetrica = (typeof RANKING_METRICAS)[number]["key"]

export function RankingSwitcher({ current }: { current: RankingMetrica }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const go = (m: string) => {
    const params = new URLSearchParams(sp.toString())
    params.set("metrica", m)
    router.push(`${pathname}?${params.toString()}`)
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
