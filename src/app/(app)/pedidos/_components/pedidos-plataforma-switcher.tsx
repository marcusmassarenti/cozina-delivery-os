"use client"

import { useRouter, useSearchParams } from "next/navigation"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"

/**
 * Seletor de plataforma da tela de Pedidos. iFood mostra VR/mix de pagamento;
 * Keeta mostra subsídio (Keeta×loja), taxas e campanhas — cada plataforma
 * expõe coisas diferentes. Mantém ?periodo e ?loja na URL.
 */
export function PedidosPlataformaSwitcher({
  current,
}: {
  current: "ifood" | "keeta"
}) {
  const router = useRouter()
  const sp = useSearchParams()

  const go = (p: "ifood" | "keeta") => {
    const params = new URLSearchParams(sp.toString())
    if (p === "ifood") params.delete("plataforma")
    else params.set("plataforma", p)
    const qs = params.toString()
    router.push(qs ? `/pedidos?${qs}` : "/pedidos")
  }

  const opts: { id: PlatformId & ("ifood" | "keeta"); label: string }[] = [
    { id: "ifood", label: "iFood" },
    { id: "keeta", label: "Keeta" },
  ]

  return (
    <div className="inline-flex items-center rounded-lg border bg-card p-0.5">
      {opts.map((o) => {
        const active = o.id === current
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => go(o.id)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-primary/10 text-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <PlatformLogo platform={o.id} size="sm" />
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
