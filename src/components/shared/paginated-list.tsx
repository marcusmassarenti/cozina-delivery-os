"use client"

import { useState } from "react"

/**
 * Mostra os primeiros `pageSize` itens (já renderizados no servidor) e um
 * botão "carregar mais" pra revelar o próximo lote. Mantém listas longas
 * (ex.: comentários) curtas por padrão. Os itens vêm prontos como ReactNode[].
 */
export function PaginatedList({
  items,
  pageSize = 10,
  className,
  as = "div",
}: {
  items: React.ReactNode[]
  pageSize?: number
  className?: string
  as?: "div" | "ul"
}) {
  const [visible, setVisible] = useState(pageSize)
  const remaining = items.length - visible
  const Wrapper = as

  return (
    <>
      <Wrapper className={className}>{items.slice(0, visible)}</Wrapper>
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + pageSize)}
          className="w-full border-t bg-muted/20 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50"
        >
          Carregar mais {Math.min(pageSize, remaining)} ({remaining} restantes)
        </button>
      )}
    </>
  )
}
