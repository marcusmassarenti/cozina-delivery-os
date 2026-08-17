"use client"

import { useRouter, useSearchParams } from "next/navigation"

/**
 * Escolhe UMA loja. Não é o `LojaFilter` do resto do sistema de propósito —
 * aquele é multi-seleção, e aqui juntar lojas produziria preço médio de lugares
 * que cobram diferente (ver o comentário na página).
 */
export function SeletorLoja({
  units,
  atual,
}: {
  units: { code: string; name: string }[]
  atual: string
}) {
  const router = useRouter()
  const params = useSearchParams()

  return (
    <select
      value={atual}
      onChange={(e) => {
        const q = new URLSearchParams(params.toString())
        q.set("loja", e.target.value)
        router.push(`/ficha-tecnica?${q.toString()}`)
      }}
      className="h-9 rounded-lg border bg-background px-3 text-sm outline-none focus:border-ring"
      aria-label="Loja"
    >
      {units.map((u) => (
        <option key={u.code} value={u.code}>
          {u.name}
        </option>
      ))}
    </select>
  )
}
