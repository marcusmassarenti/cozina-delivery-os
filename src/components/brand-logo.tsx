import { Store } from "lucide-react"

import { cn } from "@/lib/utils"

type Size = "sm" | "md" | "lg"

const sizeClass: Record<Size, string> = {
  sm: "h-6 w-6",
  md: "h-9 w-9",
  lg: "h-12 w-12",
}

const textClass: Record<Size, string> = {
  sm: "text-[11px]",
  md: "text-sm",
  lg: "text-lg",
}

const iconClass: Record<Size, string> = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-6",
}

/**
 * Avatar da loja. White-label:
 *  - `logoUrl` (logo da empresa, da Personalização) → mostra a imagem;
 *  - senão, a inicial do nome da loja (avatar neutro);
 *  - sem nada, um ícone de loja.
 * Nunca usa marca fixa de terceiros.
 */
export function BrandLogo({
  size = "md",
  className,
  logoUrl = null,
  name,
}: {
  size?: Size
  className?: string
  logoUrl?: string | null
  name?: string | null
}) {
  if (logoUrl) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background ring-1 ring-border",
          sizeClass[size],
          className,
        )}
        title={name ?? undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl} alt={name ?? "Logo"} className="size-full object-cover" />
      </span>
    )
  }

  const initial = name?.trim()?.[0]?.toUpperCase()
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg bg-muted font-semibold text-muted-foreground ring-1 ring-border",
        sizeClass[size],
        textClass[size],
        className,
      )}
      title={name ?? undefined}
    >
      {initial ?? <Store className={iconClass[size]} strokeWidth={2} />}
    </span>
  )
}
