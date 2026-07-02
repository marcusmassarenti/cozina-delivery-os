"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Palette,
  Rocket,
  Store,
  Upload,
  X,
} from "lucide-react"

import type { OnboardingProgress } from "@/lib/data/onboarding"

const BRAND = "oklch(0.65 0.21 35)"

type StepKey = "logo" | "units" | "import"

const STEPS: {
  key: StepKey
  icon: React.ComponentType<{ className?: string }>
  title: string
  desc: string
  href: string
  cta: string
}[] = [
  {
    key: "logo",
    icon: Palette,
    title: "Personalize sua conta",
    desc: "Suba o logo da sua empresa e ajuste o nome em Personalização.",
    href: "/personalizacao",
    cta: "Personalizar",
  },
  {
    key: "units",
    icon: Store,
    title: "Cadastre suas lojas",
    desc: "Adicione suas unidades em Unidades — tudo é organizado por loja.",
    href: "/unidades",
    cta: "Cadastrar loja",
  },
  {
    key: "import",
    icon: Upload,
    title: "Faça a 1ª importação",
    desc: "Comece pelo iFood: baixe os relatórios (Cardápio, Financeiro e Avaliações) e suba em Importação — vira lucro real na hora.",
    href: "/importacao?guia=1",
    cta: "Importar",
  },
]

export function OnboardingChecklist({
  progress,
}: {
  progress: OnboardingProgress
}) {
  const [collapsed, setCollapsed] = React.useState(false)
  const [dismissed, setDismissed] = React.useState(false)

  React.useEffect(() => {
    setCollapsed(localStorage.getItem("dos_onb_collapsed") === "1")
    setDismissed(localStorage.getItem("dos_onb_dismissed") === "1")
    // Reabrir pelo botão de ajuda ("Começando no Delivery OS").
    const reopen = () => {
      localStorage.removeItem("dos_onb_dismissed")
      localStorage.removeItem("dos_onb_collapsed")
      setDismissed(false)
      setCollapsed(false)
    }
    window.addEventListener("deliveryos:open-tour", reopen)
    return () => window.removeEventListener("deliveryos:open-tour", reopen)
  }, [])

  if (dismissed) return null

  const doneMap: Record<StepKey, boolean> = {
    logo: progress.hasLogo,
    units: progress.hasUnits,
    import: progress.hasImported,
  }
  const firstTodo = STEPS.find((s) => !doneMap[s.key])?.key
  const pct = Math.round((progress.done / progress.total) * 100)

  function toggleCollapse() {
    setCollapsed((c) => {
      const next = !c
      localStorage.setItem("dos_onb_collapsed", next ? "1" : "0")
      return next
    })
  }
  function dismiss() {
    localStorage.setItem("dos_onb_dismissed", "1")
    setDismissed(true)
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3 border-b bg-muted/30 px-5 py-3">
        <span
          className="flex size-9 items-center justify-center rounded-lg text-white"
          style={{ background: BRAND }}
        >
          <Rocket className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Primeiros passos</p>
          <p className="text-xs text-muted-foreground">
            {progress.done} de {progress.total} concluídos · configure sua conta
            em minutos
          </p>
        </div>
        {/* Barra de progresso */}
        <div className="hidden w-28 sm:block">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: BRAND }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={toggleCollapse}
          aria-label={collapsed ? "Expandir" : "Recolher"}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronDown
            className={`size-4 transition-transform ${collapsed ? "-rotate-90" : ""}`}
          />
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dispensar"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {!collapsed && (
        <div className="divide-y">
          {STEPS.map((s, i) => {
            const done = doneMap[s.key]
            const isCurrent = s.key === firstTodo
            return (
              <div
                key={s.key}
                className={`flex items-start gap-3 px-5 py-3.5 ${
                  isCurrent ? "bg-[oklch(0.65_0.21_35/0.07)]" : ""
                }`}
              >
                {done ? (
                  <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-emerald-600" />
                ) : (
                  <span
                    className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold"
                    style={
                      isCurrent
                        ? { borderColor: BRAND, color: BRAND }
                        : { color: "var(--muted-foreground)" }
                    }
                  >
                    {i + 1}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium ${done ? "text-muted-foreground line-through" : ""}`}
                  >
                    {s.title}
                  </p>
                  {!done && (
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {s.desc}
                    </p>
                  )}
                </div>
                {!done && (
                  <Link
                    href={s.href}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                      isCurrent
                        ? "text-white hover:-translate-y-0.5"
                        : "border text-foreground hover:bg-muted"
                    }`}
                    style={isCurrent ? { background: BRAND } : undefined}
                  >
                    {s.cta}
                    {isCurrent && <ArrowRight className="size-3.5" />}
                  </Link>
                )}
              </div>
            )
          })}
          <div className="px-5 py-2.5 text-[11px] text-muted-foreground">
            Depois disso, explore <b>Relatórios</b>, <b>DRE</b> e{" "}
            <b>Avaliações</b> — tudo se preenche a cada importação.
          </div>
        </div>
      )}
    </div>
  )
}
