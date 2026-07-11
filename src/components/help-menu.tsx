"use client"

import * as React from "react"
import Link from "next/link"
import {
  HelpCircle,
  LifeBuoy,
  Mail,
  MessageCircle,
  Rocket,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { OPEN_HELP_EVENT } from "@/app/(app)/ajuda/_components/help-dialog"

/**
 * Contatos de suporte — AJUSTE AQUI.
 *  - whatsapp: só dígitos, com DDI (ex.: "5511999999999"). Vazio = esconde.
 *  - email: e-mail de atendimento.
 */
const SUPPORT = {
  email: "suporte@deliveryos.food",
  whatsapp: "", // só dígitos com DDI. Vazio = esconde a opção.
}

type Action = {
  icon: LucideIcon
  label: string
  href: string
  external?: boolean
  onClick?: () => void
}

/**
 * Menu de ajuda ANCORADO NO TOPO (substitui o antigo botão flutuante do canto
 * inferior direito, que atrapalhava). Abre um dropdown com: central de ajuda,
 * mensagem, WhatsApp e o tour "Começando".
 */
export function HelpMenu() {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

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
    {
      icon: LifeBuoy,
      label: "Central de ajuda",
      href: "#",
      onClick: () => window.dispatchEvent(new Event(OPEN_HELP_EVENT)),
    },
    {
      icon: Rocket,
      label: "Começando no Delivery OS",
      href: "#",
      onClick: () => window.dispatchEvent(new Event("deliveryos:open-tour")),
    },
    {
      icon: Mail,
      label: "Deixe uma mensagem",
      href: `mailto:${SUPPORT.email}`,
      external: true,
    },
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
  ]

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Central de ajuda"
        title="Central de ajuda"
        aria-expanded={open}
        className={cn(
          "relative flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          open && "bg-muted text-foreground",
        )}
      >
        <HelpCircle className="size-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-64 origin-top-right rounded-2xl border bg-card p-3 shadow-2xl">
          <div className="mb-2 px-1">
            <span className="text-xs font-semibold text-muted-foreground">
              Precisa de ajuda?
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {actions.map((a) => (
              <HelpCard key={a.label} action={a} onDone={() => setOpen(false)} />
            ))}
          </div>
        </div>
      )}
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
      <a
        href={action.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onDone}
        className={cls}
      >
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
