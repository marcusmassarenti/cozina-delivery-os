"use client"

import * as React from "react"
import Link from "next/link"
import {
  LifeBuoy,
  Mail,
  MessageCircle,
  Rocket,
  Headphones,
  X,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Contatos de suporte — AJUSTE AQUI.
 *  - whatsapp: só dígitos, com DDI (ex.: "5511999999999"). Vazio = esconde.
 *  - email: e-mail de atendimento.
 *  - helpUrl: link da central de ajuda (interno ou externo).
 */
const SUPPORT = {
  email: "suporte@deliveryos.food",
  whatsapp: "5511995125139", // só dígitos com DDI
  helpUrl: "/seguranca",
}

type Action = {
  icon: LucideIcon
  label: string
  href: string
  /** abre em nova aba / link externo */
  external?: boolean
  /** dispara um evento em vez de navegar */
  onClick?: () => void
}

/**
 * Botão flutuante de ajuda (canto inferior direito), sempre visível no app.
 * Abre um menu com: mensagem, WhatsApp, central de ajuda e "começando".
 */
export function HelpFab() {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora ou apertar Esc.
  React.useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const actions: Action[] = [
    { icon: Mail, label: "Deixe uma mensagem", href: `mailto:${SUPPORT.email}`, external: true },
    ...(SUPPORT.whatsapp
      ? [
          {
            icon: MessageCircle,
            label: "Falar por WhatsApp",
            href: `https://wa.me/${SUPPORT.whatsapp}`,
            external: true,
          } as Action,
        ]
      : []),
    { icon: LifeBuoy, label: "Central de ajuda", href: SUPPORT.helpUrl },
    {
      icon: Rocket,
      label: "Começando no Delivery OS",
      href: "#",
      onClick: () => window.dispatchEvent(new Event("deliveryos:open-tour")),
    },
  ]

  return (
    <div
      ref={ref}
      className="fixed bottom-5 right-5 z-50 flex flex-col items-end print:hidden"
    >
      {open && (
        <div className="mb-3 w-72 origin-bottom-right rounded-2xl border bg-card p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-muted-foreground">
              Precisa de ajuda?
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {actions.map((a) => (
              <HelpCard key={a.label} action={a} onDone={() => setOpen(false)} />
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Ajuda"
        className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 active:scale-95"
      >
        {open ? <X className="size-6" /> : <Headphones className="size-6" />}
      </button>
    </div>
  )
}

function HelpCard({ action, onDone }: { action: Action; onDone: () => void }) {
  const Icon = action.icon
  const inner = (
    <>
      <Icon className="size-5 text-primary" strokeWidth={1.9} />
      <span className="text-center text-xs font-medium leading-tight text-foreground">
        {action.label}
      </span>
    </>
  )
  const cls = cn(
    "flex flex-col items-center justify-center gap-2 rounded-xl border bg-card px-2 py-4 text-center transition-colors hover:border-primary/40 hover:bg-muted/50",
  )

  if (action.onClick) {
    return (
      <button
        type="button"
        onClick={() => {
          action.onClick?.()
          onDone()
        }}
        className={cls}
      >
        {inner}
      </button>
    )
  }
  if (action.external) {
    return (
      <a href={action.href} target="_blank" rel="noopener noreferrer" onClick={onDone} className={cls}>
        {inner}
      </a>
    )
  }
  return (
    <Link href={action.href} onClick={onDone} className={cls}>
      {inner}
    </Link>
  )
}
