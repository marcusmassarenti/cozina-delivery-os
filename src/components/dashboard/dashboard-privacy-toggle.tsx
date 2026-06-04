"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { Eye, EyeOff } from "lucide-react"

const KEY = "cozina:dash-privacy"

/**
 * "Olho" de privacidade no topbar (só no Dashboard `/`). Ao ligar, borra os
 * números do dashboard (valores R$, contagens) — útil pra mostrar a tela com
 * alguém olhando sem revelar o faturamento. Estado salvo em localStorage.
 *
 * Liga/desliga o atributo `data-privacy="on"` no <html>; a CSS em globals.css
 * (escopada a [data-dashboard-root]) faz o blur só dentro do dashboard.
 */
export function DashboardPrivacyToggle() {
  const pathname = usePathname()
  const isDashboard = pathname === "/"
  const [hidden, setHidden] = React.useState(false)
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    setHidden(localStorage.getItem(KEY) === "1")
    setReady(true)
  }, [])

  React.useEffect(() => {
    if (!ready) return
    document.documentElement.dataset.privacy =
      isDashboard && hidden ? "on" : "off"
  }, [isDashboard, hidden, ready])

  React.useEffect(() => {
    if (ready) localStorage.setItem(KEY, hidden ? "1" : "0")
  }, [hidden, ready])

  if (!isDashboard) return null

  return (
    <>
      {/* Regra global do blur (injetada aqui pra não depender do pipeline do
          Tailwind no globals.css). Só vale dentro do dashboard e com privacy on. */}
      <style>{`html[data-privacy="on"] [data-dashboard-root] .tabular-nums{filter:blur(7px);transition:filter .12s ease;-webkit-user-select:none;user-select:none}`}</style>
    <button
      type="button"
      aria-label={hidden ? "Mostrar valores" : "Ocultar valores"}
      aria-pressed={hidden}
      title={hidden ? "Mostrar valores" : "Ocultar valores"}
      onClick={() => setHidden((v) => !v)}
      data-active={hidden}
      className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[active=true]:bg-muted data-[active=true]:text-foreground"
    >
      {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
    </>
  )
}
