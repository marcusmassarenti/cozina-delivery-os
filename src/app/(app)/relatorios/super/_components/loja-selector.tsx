"use client"

import { useRouter, useSearchParams } from "next/navigation"

/**
 * Seletor de loja do relatório do Super.
 *
 * Navega por querystring (`?loja=<code>`) em vez de guardar estado: o
 * relatório é Server Component, o PDF sai do que está na tela, e link com a
 * loja escolhida precisa poder ser copiado e mandado pra outra pessoa.
 */
export function LojaSelector({
  lojas,
  atual,
}: {
  lojas: { code: string; name: string }[]
  atual: string | null
}) {
  const router = useRouter()
  const params = useSearchParams()

  return (
    <select
      value={atual ?? ""}
      onChange={(e) => {
        const q = new URLSearchParams(params.toString())
        if (e.target.value) q.set("loja", e.target.value)
        else q.delete("loja")
        router.push(`/relatorios/super${q.toString() ? `?${q}` : ""}`)
      }}
      className="h-9 rounded-lg border bg-card px-3 text-sm font-medium"
      aria-label="Escolher loja"
    >
      <option value="">Todas as lojas</option>
      {lojas.map((l) => (
        <option key={l.code} value={l.code}>
          {l.name}
        </option>
      ))}
    </select>
  )
}
