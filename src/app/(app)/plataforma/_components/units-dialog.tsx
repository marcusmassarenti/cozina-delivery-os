"use client"

import * as React from "react"
import { Store } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { HoldingUnit } from "@/lib/data/plataforma"

export function UnitsDialog({ name, units }: { name: string; units: HoldingUnit[] }) {
  const [open, setOpen] = React.useState(false)
  const active = units.filter((u) => u.active).length

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="rounded-md px-2 py-0.5 font-medium tabular-nums transition-colors hover:bg-muted hover:underline"
          >
            {units.length}
          </button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="size-5 text-primary" />
            Lojas de {name}
          </DialogTitle>
          <DialogDescription>
            {units.length} loja{units.length !== 1 ? "s" : ""} · {active} ativa
            {active !== 1 ? "s" : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto">
          {units.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma loja cadastrada.
            </p>
          ) : (
            <div className="divide-y">
              {units.map((u) => (
                <div key={u.id} className="flex items-center gap-2.5 py-2 text-sm">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-semibold text-muted-foreground">
                    {u.code ?? "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{u.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {[u.city, u.state].filter(Boolean).join(" / ") || "—"}
                    </div>
                  </div>
                  {!u.active && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      inativa
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
