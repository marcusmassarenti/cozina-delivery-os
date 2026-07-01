"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { simularPagamento } from "../../_actions"

export function SimuladoActions({ sub }: { sub: string }) {
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const router = useRouter()

  async function aprovar() {
    setPending(true)
    setError(null)
    const res = await simularPagamento(sub)
    if (res.ok) {
      router.push("/?assinou=1")
      router.refresh()
    } else {
      setPending(false)
      setError(res.message ?? "Erro ao simular.")
    }
  }

  return (
    <div className="mt-6 space-y-3">
      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          {error}
        </div>
      )}
      <Button className="w-full" onClick={aprovar} disabled={pending}>
        {pending ? "Confirmando..." : "✓ Aprovar pagamento (teste)"}
      </Button>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => router.push("/assinatura")}
        disabled={pending}
      >
        Cancelar
      </Button>
    </div>
  )
}
