import { cn } from "@/lib/utils"

export type PlatformId = "ifood" | "99food" | "keeta"

type Size = "sm" | "md" | "lg"

type Config = {
  label: string
  bg: string
}

// Brand colors usados como fundo (caso a imagem falhe carregar)
const config: Record<PlatformId, Config> = {
  ifood: { label: "iFood", bg: "#EA1D2C" },
  "99food": { label: "99 Food", bg: "#FFD300" },
  keeta: { label: "Keeta", bg: "#FFCD00" },
}

const sizeClass: Record<Size, string> = {
  sm: "h-5 w-5",
  md: "h-7 w-7",
  lg: "h-10 w-10",
}

/**
 * Renderiza o logo oficial da plataforma a partir de /platforms/{id}.png.
 * Background usa a cor da marca como fallback se a imagem não carregar.
 */
export function PlatformLogo({
  platform,
  size = "md",
  className,
}: {
  platform: PlatformId
  size?: Size
  className?: string
}) {
  const c = config[platform]
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded",
        sizeClass[size],
        className,
      )}
      style={{ backgroundColor: c.bg }}
      aria-label={c.label}
      title={c.label}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/platforms/${platform}.png`}
        alt={c.label}
        className="size-full object-contain"
      />
    </span>
  )
}
