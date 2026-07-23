"use client"

import * as React from "react"
import { Plug, Store } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { PlatformLogo } from "@/components/platform-logo"
import type { HoldingUnit } from "@/lib/data/plataforma"

export function UnitsDialog({ name, units }: { name: string; units: HoldingUnit[] }) {
  const [open, setOpen] = React.useState(false)
  const active = units.filter((u) => u.active).length
  const comApi = units.filter((u) => u.ifoodApi || u.ninefoodApi).length

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
            {comApi > 0 && (
              <>
                {" · "}
                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                  {comApi} conectada{comApi !== 1 ? "s" : ""} via API
                </span>
              </>
            )}
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
                  {/* Plataformas habilitadas — logo esmaecido; quando conectada
                      via API, ganha um selo "API" ao lado. */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    {u.platforms.map((p) => {
                      const api =
                        (p === "ifood" && u.ifoodApi) ||
                        (p === "99food" && u.ninefoodApi)
                      return (
                        <span
                          key={p}
                          title={
                            api
                              ? `${p === "ifood" ? "iFood" : "99 Food"} conectado via API`
                              : `${p === "ifood" ? "iFood" : p === "99food" ? "99 Food" : "Keeta"} — só importação`
                          }
                          className={`inline-flex items-center gap-0.5 rounded-full px-1 py-0.5 ${
                            api
                              ? "bg-emerald-50 ring-1 ring-emerald-300 dark:bg-emerald-950/30 dark:ring-emerald-800"
                              : "opacity-45"
                          }`}
                        >
                          <PlatformLogo platform={p} size="sm" />
                          {api && (
                            <Plug className="size-2.5 text-emerald-600 dark:text-emerald-400" />
                          )}
                        </span>
                      )
                    })}
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
