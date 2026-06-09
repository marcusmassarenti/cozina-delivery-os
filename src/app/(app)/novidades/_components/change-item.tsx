"use client"

import * as React from "react"
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  ChevronDown,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react"

import type { ChangeItem as ChangeItemType, ChangeKind } from "@/lib/changelog"

const KIND: Record<ChangeKind, { icon: LucideIcon; cls: string; label: string }> = {
  novo: { icon: Sparkles, cls: "text-primary", label: "Novo" },
  melhoria: { icon: Wrench, cls: "text-sky-600", label: "Melhoria" },
  correcao: { icon: Bug, cls: "text-rose-600", label: "Correção" },
}

export function ChangeItem({ item }: { item: ChangeItemType }) {
  const [open, setOpen] = React.useState(false)
  const k = KIND[item.kind]
  const Icon = k.icon
  const expandable = !!(item.antes || item.depois)

  if (!expandable) {
    return (
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <Icon className={`mt-0.5 size-4 shrink-0 ${k.cls}`} />
        <div className="min-w-0">
          <span className="text-sm font-medium">{item.title}</span>
          {item.desc && (
            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`rounded-lg border transition-colors ${open ? "border-foreground/20" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <Icon className={`size-4 shrink-0 ${k.cls}`} />
        <span className="flex-1 text-sm font-medium">{item.title}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
        <div className="space-y-2.5 px-3 pb-3 pl-9 text-sm leading-relaxed">
          {item.antes && (
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Antes:</span> {item.antes}
              </p>
            </div>
          )}
          {item.depois && (
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Depois:</span> {item.depois}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
