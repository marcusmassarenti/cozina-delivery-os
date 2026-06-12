"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  BarChart3,
  FileUp,
  Palette,
  Rocket,
  Sparkles,
  Store,
  Upload,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { markOnboarded } from "./actions"

type Slide = {
  icon: React.ComponentType<{ className?: string }>
  title: string
  body: string
}

export function WelcomeTour({
  initialOnboarded,
  brandName,
}: {
  initialOnboarded: boolean
  brandName: string
}) {
  const [open, setOpen] = React.useState(!initialOnboarded)
  const [step, setStep] = React.useState(0)
  const router = useRouter()

  // Permite rever o tour com ?tour=1 (sem causar mismatch de hidratação) ou
  // pelo botão de ajuda (evento "deliveryos:open-tour").
  React.useEffect(() => {
    if (typeof window !== "undefined" && window.location.search.includes("tour=1"))
      setOpen(true)
    const reopen = () => {
      setStep(0)
      setOpen(true)
    }
    window.addEventListener("deliveryos:open-tour", reopen)
    return () => window.removeEventListener("deliveryos:open-tour", reopen)
  }, [])

  const slides: Slide[] = [
    {
      icon: Sparkles,
      title: `Bem-vindo${brandName ? ` à ${brandName}` : ""}! 👋`,
      body: "Este é o seu painel de gestão de delivery. Em menos de 1 minuto a gente mostra o essencial.",
    },
    {
      icon: BarChart3,
      title: "Acompanhe tudo num lugar",
      body: "Dashboard, Relatórios e DRE: faturamento, pedidos, avaliações e resultado da sua operação — atualizados a cada importação.",
    },
    {
      icon: FileUp,
      title: "Importe os relatórios",
      body: "Suba os relatórios do iFood, 99 Food e Keeta na tela de Importação — o sistema organiza e consolida tudo automaticamente.",
    },
    {
      icon: Rocket,
      title: "Seus primeiros passos",
      body: "Pronto pra começar? Sugerimos: personalizar seu logo, conferir suas lojas e fazer a 1ª importação.",
    },
  ]

  if (!open) return null

  const isLast = step === slides.length - 1
  const slide = slides[step]
  const Icon = slide.icon

  async function finish() {
    setOpen(false)
    await markOnboarded()
    router.refresh()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border bg-card shadow-2xl">
        {/* Fechar/pular */}
        <button
          type="button"
          onClick={finish}
          aria-label="Pular tour"
          className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>

        {/* Header com ícone */}
        <div className="flex flex-col items-center gap-3 bg-gradient-to-b from-primary/10 to-transparent px-6 pb-2 pt-8 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Icon className="size-7" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">{slide.title}</h2>
        </div>

        <div className="px-6 pb-2 text-center text-sm text-muted-foreground">
          {slide.body}
        </div>

        {/* Atalhos só no último slide */}
        {isLast && (
          <div className="grid grid-cols-3 gap-2 px-6 pt-3">
            <Shortcut icon={Palette} label="Logo" />
            <Shortcut icon={Store} label="Lojas" />
            <Shortcut icon={Upload} label="Importar" />
          </div>
        )}

        {/* Dots */}
        <div className="flex items-center justify-center gap-1.5 px-6 py-4">
          {slides.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>

        {/* Navegação */}
        <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-6 py-4">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
              Voltar
            </Button>
          ) : (
            <Button variant="ghost" onClick={finish}>
              Pular
            </Button>
          )}
          {isLast ? (
            <Button onClick={finish}>
              <Rocket className="size-4" />
              Começar
            </Button>
          ) : (
            <Button onClick={() => setStep((s) => s + 1)}>Próximo</Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Shortcut({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border bg-card py-2.5 text-[11px] text-muted-foreground">
      <Icon className="size-4 text-foreground/70" />
      {label}
    </div>
  )
}
