"use client"

import { cn } from "@/lib/utils"

export type PlatformId = "ifood" | "99food" | "keeta"

type Size = "sm" | "md" | "lg"

type Config = {
  label: string
  bg: string
  fg: string
  display: string
}

const config: Record<PlatformId, Config> = {
  ifood: { label: "iFood", bg: "#EA1D2C", fg: "#FFFFFF", display: "iFood" },
  "99food": { label: "99 Food", bg: "#FFD300", fg: "#D71D24", display: "99" },
  keeta: { label: "Keeta", bg: "#FFCD00", fg: "#0F7A3D", display: "k" },
}

const sizeClass: Record<Size, string> = {
  sm: "h-5 w-5 text-[9px]",
  md: "h-7 w-7 text-[11px]",
  lg: "h-10 w-10 text-base",
}

/**
 * Renders the official platform logo if available at /platforms/{id}.png,
 * with a styled brand-colored fallback as alt-text.
 * Drop logo files in public/platforms/ to override.
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
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded font-black",
        sizeClass[size],
        className,
      )}
      style={{ backgroundColor: c.bg, color: c.fg }}
      aria-label={c.label}
      title={c.label}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/platforms/${platform}.png`}
        alt={c.label}
        className="size-full object-contain"
        onError={(e) => {
          const target = e.currentTarget
          target.style.display = "none"
        }}
      />
      <span aria-hidden className="absolute leading-none">
        {c.display}
      </span>
    </span>
  )
}
