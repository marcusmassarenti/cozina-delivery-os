"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { GraduationCap } from "lucide-react"

import { CoachTour, type CoachStep } from "./coach-tour"

const BRAND = "oklch(0.65 0.21 35)"

/**
 * Botão "Como funciona" — abre o tour guiado (coach-mark) da tela sempre que
 * clicado. Se `autoOpenParam` for passado e a URL tiver ?<param>=1, o tour
 * abre sozinho (ex.: vindo dos Primeiros passos).
 */
export function TourButton({
  steps,
  label = "Como funciona",
  autoOpenParam,
}: {
  steps: CoachStep[]
  label?: string
  autoOpenParam?: string
}) {
  const [open, setOpen] = React.useState(false)
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()

  React.useEffect(() => {
    if (autoOpenParam && params.get(autoOpenParam) === "1") {
      const t = setTimeout(() => setOpen(true), 400)
      return () => clearTimeout(t)
    }
  }, [params, autoOpenParam])

  function close() {
    setOpen(false)
    if (autoOpenParam && params.get(autoOpenParam) === "1") {
      router.replace(pathname)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-[oklch(0.65_0.21_35/0.08)]"
        style={{ borderColor: "oklch(0.65 0.21 35 / 0.4)", color: BRAND }}
      >
        <GraduationCap className="size-4" />
        {label}
      </button>
      <CoachTour steps={steps} open={open} onClose={close} />
    </>
  )
}
