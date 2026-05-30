"use client"

import { Store } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"

/**
 * Seletor de loja da tela Pedidos. "Todas" = consolidado da rede; ou uma
 * loja específica. Mantém o ?periodo na URL e usa ?loja=<code>.
 */
export function PedidosUnitFilter({
  units,
  current,
}: {
  units: { code: string; name: string; hasData: boolean }[]
  current: string | null
}) {
  const router = useRouter()
  const sp = useSearchParams()

  const onChange = (code: string) => {
    const params = new URLSearchParams(sp.toString())
    if (code) params.set("loja", code)
    else params.delete("loja")
    const qs = params.toString()
    router.push(qs ? `/pedidos?${qs}` : "/pedidos")
  }

  return (
    <div className="relative">
      <Store className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <select
        value={current ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border bg-card pl-8 pr-3 text-sm shadow-sm outline-none focus:border-ring"
      >
        <option value="">Todas as lojas</option>
        {units.map((u) => (
          <option key={u.code} value={u.code}>
            #{u.code} {u.name}
            {u.hasData ? "" : " · sem dados"}
          </option>
        ))}
      </select>
    </div>
  )
}
