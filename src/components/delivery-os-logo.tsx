import { BarChart3 } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Marca do PRODUTO (Delivery OS) — quadrado laranja com ícone de gráfico.
 * É o fallback de marca quando a empresa não subiu o próprio logo (white-label).
 * Passe o tamanho via `className` (ex.: "size-8").
 */
export function DeliveryOsMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-lg bg-[#ff4d1c] text-white",
        className,
      )}
      aria-hidden
    >
      <BarChart3 className="size-[60%]" strokeWidth={2.2} />
    </span>
  )
}

/**
 * Marca + nome "Delivery OS". O texto herda a cor do contexto (funciona no
 * claro e no escuro). `subtitle` mostra "Gestão de Delivery" embaixo.
 */
export function DeliveryOsWordmark({
  className,
  subtitle = true,
}: {
  className?: string
  subtitle?: boolean
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <DeliveryOsMark className="size-8 shrink-0" />
      <div className="leading-tight">
        <div className="text-base font-semibold tracking-tight">Delivery OS</div>
        {subtitle && (
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Gestão de Delivery
          </div>
        )}
      </div>
    </div>
  )
}
