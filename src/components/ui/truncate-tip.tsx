"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

/**
 * Texto que trunca ("…") e, quando REALMENTE corta, mostra o nome inteiro num
 * tooltip instantâneo (delay 0, via TooltipProvider do layout). Substitui o
 * atributo `title` nativo — que demora ~1s e às vezes nem aparece.
 *
 * Visual DELICADO de propósito: fonte pequena, fundo cinza-escuro suave (não
 * preto puro) e sem seta, pra não pesar sobre o card. Só liga quando o
 * conteúdo está cortado (mede scrollWidth/Height vs client), então nome curto
 * não mostra balão redundante. O elemento de texto é SEMPRE o mesmo (não
 * remonta ao truncar) pra o ResizeObserver não se perder.
 */
export function TruncateTip({
  text,
  className,
  as: Tag = "span",
}: {
  text: string
  className?: string
  as?: "span" | "p" | "h3"
}) {
  const ref = React.useRef<HTMLElement | null>(null)
  const [truncado, setTruncado] = React.useState(false)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () =>
      setTruncado(
        el.scrollWidth - el.clientWidth > 1 ||
          el.scrollHeight - el.clientHeight > 1,
      )
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text])

  const alvo = (
    <Tag ref={ref as React.Ref<never>} className={className}>
      {text}
    </Tag>
  )

  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger render={alvo} />
      {truncado && (
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Positioner side="top" sideOffset={5} className="z-50">
            <TooltipPrimitive.Popup
              className={cn(
                "max-w-[16rem] rounded-md bg-neutral-800/95 px-2 py-1 text-[11px] font-medium leading-snug text-neutral-50 shadow-sm ring-1 ring-black/5 backdrop-blur-sm",
                "origin-(--transform-origin) transition-[transform,opacity] data-[state=delayed-open]:animate-in data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
              )}
            >
              {text}
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      )}
    </TooltipPrimitive.Root>
  )
}
