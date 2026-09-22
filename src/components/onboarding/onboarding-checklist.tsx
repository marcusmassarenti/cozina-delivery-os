"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Palette,
  Plug,
  Rocket,
  Store,
  Upload,
  X,
} from "lucide-react"

import type { OnboardingProgress } from "@/lib/data/onboarding"
import { WhatsappMarcus } from "@/components/onboarding/whatsapp-marcus"

const BRAND = "oklch(0.65 0.21 35)"

type StepKey = "units" | "import" | "conexao"

/**
 * O roteiro vai até o PRIMEIRO NÚMERO, na ordem que dá número mais cedo
 * (22/09/26). Antes o passo 1 era o logo — que não mostra nada — e o 3
 * empurrava a conexão por API, que no iFood leva dias e depende do nosso time.
 * Subir um relatório leva minutos: é ele que mostra o painel no primeiro dia,
 * enquanto a conexão corre em paralelo.
 */
const STEPS: {
  key: StepKey
  icon: React.ComponentType<{ className?: string }>
  title: string
  desc: string
  href: string
  cta: string
}[] = [
  {
    key: "units",
    icon: Store,
    title: "Cadastre sua loja",
    desc: "Nome, CNPJ e onde ela vende. Digite o CNPJ e a Receita preenche o resto.",
    href: "/unidades",
    cta: "Cadastrar loja",
  },
  {
    key: "import",
    icon: Upload,
    title: "Veja os números da sua loja hoje",
    desc: "Baixe o relatório de vendas no portal do iFood (ou do 99 ou da Keeta) e suba aqui, do jeito que ele vem. Em poucos minutos aparecem faturamento, taxas e quanto sobra pra você.",
    href: "/importacao?comecar=1",
    cta: "Subir relatório",
  },
  {
    key: "conexao",
    icon: Plug,
    title: "Deixe tudo atualizando sozinho",
    desc: "Conecte a loja às plataformas e o dado passa a entrar todo dia, sem planilha.",
    href: "/unidades",
    cta: "Conectar",
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
    units: progress.hasUnits,
    import: progress.hasImported,
    conexao: progress.hasConnection,
  }
  const hrefDe = (s: (typeof STEPS)[number]) =>
    s.key === "conexao" && progress.primeiraLoja
      ? `/conectar-loja/${encodeURIComponent(progress.primeiraLoja)}`
      : s.href
  // Pedido do iFood em aberto: diz de quem é a vez. Silêncio aqui fazia o
  // cliente achar que o sistema não funciona — ou que o problema era dele.
  const avisoIfood =
    progress.ifoodEspera === "nossa"
      ? "iFood: estamos liberando a sua loja no portal do iFood — em até 24h. Você recebe um e-mail quando for a sua vez de aprovar. Enquanto isso, o passo 2 já mostra seus números."
      : progress.ifoodEspera === "cliente"
        ? "iFood: chegou a sua vez — aprove o Delivery OS no Portal do Parceiro (Integrações). Os dados começam a entrar em até 15 minutos."
        : null
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
          <p className="text-sm font-semibold">
            Veja os números da sua loja em 3 passos
          </p>
          <p className="text-xs text-muted-foreground">
            {progress.done} de {progress.total} concluídos · os dois primeiros
            levam uns 10 minutos
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
                  {!done && s.key === "conexao" && avisoIfood && (
                    <p className="mt-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                      {avisoIfood}
                    </p>
                  )}
                </div>
                {!done && (
                  <Link
                    href={hrefDe(s)}
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
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#25D366]/[0.06] px-5 py-3">
            <p className="text-xs text-muted-foreground">
              <b className="font-semibold text-foreground">
                Prefere fazer com a gente?
              </b>{" "}
              Fale direto com o Marcus, fundador do Delivery OS.
            </p>
            <WhatsappMarcus empresa={progress.empresa} variante="linha" />
          </div>
          <div className="px-5 py-2.5 text-[11px] text-muted-foreground">
            Depois disso, explore <b>Relatórios</b>, <b>DRE</b> e{" "}
            <b>Avaliações</b> — tudo se preenche a cada importação.
            {!progress.hasLogo && (
              <>
                {" "}
                Quer a sua marca no sistema?{" "}
                <Link
                  href="/minha-conta/personalizacao"
                  className="font-medium text-foreground underline"
                >
                  <Palette className="mr-0.5 inline size-3" />
                  Personalizar
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
