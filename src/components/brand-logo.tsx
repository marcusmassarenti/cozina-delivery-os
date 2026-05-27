import { cn } from "@/lib/utils"

type Size = "sm" | "md" | "lg"

const sizeClass: Record<Size, string> = {
  sm: "h-6 w-6",
  md: "h-9 w-9",
  lg: "h-12 w-12",
}

/**
 * Avatar da marca Churrasco no Pote.
 * Usa /cnp.jpg com object-cover pra centralizar na chama quando pequeno.
 * Quando virarmos multi-marca, recebe o brand_id como prop e busca do banco.
 */
export function BrandLogo({
  size = "md",
  className,
}: {
  size?: Size
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg ring-1 ring-border",
        sizeClass[size],
        className,
      )}
      title="Churrasco no Pote"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/cnp.jpg"
        alt="Churrasco no Pote"
        className="size-full object-cover"
        style={{ objectPosition: "center 65%" }}
      />
    </span>
  )
}
