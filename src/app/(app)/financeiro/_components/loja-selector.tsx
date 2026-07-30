"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useNavigate } from "@/components/shared/navigation-progress"
import { Store } from "lucide-react"

export function LojaSelector({ units }: { units: { id: string; name: string }[] }) {
  const sp = useSearchParams()
  const navigate = useNavigate()
  const pathname = usePathname()
  const loja = sp.get("loja") ?? "todas"

  function set(v: string) {
    const params = new URLSearchParams(sp.toString())
    if (v === "todas") params.delete("loja")
    else params.set("loja", v)
    const qs = params.toString()
    navigate(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <label className="inline-flex h-9 items-center gap-1.5 rounded-lg border bg-card px-2.5 text-sm shadow-sm">
      <Store className="size-4 text-muted-foreground" />
      <select
        value={loja}
        onChange={(e) => set(e.target.value)}
        className="cursor-pointer bg-transparent pr-1 font-medium outline-none"
      >
        <option value="todas">Consolidado ({units.length} lojas)</option>
        <option value="rede">Rede (geral)</option>
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </label>
  )
}
