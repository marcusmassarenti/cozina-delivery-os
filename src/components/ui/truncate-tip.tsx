"use client"

import * as React from "react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * Texto que trunca ("…") e, quando REALMENTE corta, mostra o nome inteiro num
 * tooltip instantâneo (delay 0, via TooltipProvider do layout). Substitui o
 * atributo `title` nativo — que demora ~1s pra aparecer e às vezes nem aparece.
 *
 * Só liga o tooltip quando o conteúdo está cortado (mede scrollWidth/Height vs
 * client), então nome curto não mostra balão redundante. O elemento de texto é
 * SEMPRE o mesmo (não remonta ao truncar) pra o ResizeObserver não se perder.
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
    <Tooltip>
      <TooltipTrigger render={alvo} />
      {truncado && <TooltipContent>{text}</TooltipContent>}
    </Tooltip>
  )
}
