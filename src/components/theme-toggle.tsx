"use client"

import * as React from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

type Mode = "light" | "dark" | "system"

const order: Mode[] = ["light", "dark", "system"]

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => setMounted(true), [])

  const current = (mounted ? theme : "system") as Mode
  const Icon =
    current === "dark" ? Moon : current === "system" ? Monitor : Sun

  const cycle = () => {
    const i = order.indexOf(current)
    const next = order[(i + 1) % order.length]
    setTheme(next)
  }

  const label =
    current === "dark"
      ? "Tema: escuro"
      : current === "system"
        ? "Tema: sistema"
        : "Tema: claro"

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`${label}. Clique para alternar.`}
      title={label}
      className="relative flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Icon className="size-4" suppressHydrationWarning />
    </button>
  )
}
