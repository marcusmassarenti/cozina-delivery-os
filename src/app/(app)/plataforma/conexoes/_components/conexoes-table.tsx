"use client"

import * as React from "react"
import Link from "next/link"
import { Check, Minus, Search } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"

export type ConexaoRow = {
  unitId: string
  unitCode: string | null
  unitName: string
  cidade: string | null
  ativa: boolean
  cliente: string
  clienteId: string
  platforms: PlatformId[]
  ifoodApi: boolean
  ninefoodApi: boolean
}

type Filtro = "todas" | "api" | "sem"

export function ConexoesTable({ rows }: { rows: ConexaoRow[] }) {
  const [query, setQuery] = React.useState("")
  const [filtro, setFiltro] = React.useState<Filtro>("todas")

  const filtradas = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      const temApi = r.ifoodApi || r.ninefoodApi
      if (filtro === "api" && !temApi) return false
      if (filtro === "sem" && temApi) return false
      if (!q) return true
      return (
        r.unitName.toLowerCase().includes(q) ||
        r.cliente.toLowerCase().includes(q) ||
        (r.cidade ?? "").toLowerCase().includes(q) ||
        (r.unitCode ?? "").toLowerCase().includes(q)
      )
    })
  }, [rows, query, filtro])

  const FILTROS: { id: Filtro; label: string }[] = [
    { id: "todas", label: "Todas" },
    { id: "api", label: "Conectadas via API" },
    { id: "sem", label: "Sem API" },
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar loja, cliente ou cidade…"
            className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm outline-none focus:border-ring"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border bg-card p-0.5">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                filtro === f.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 font-semibold">Loja</th>
              <th className="px-4 py-2.5 font-semibold">Cliente</th>
              <th className="px-4 py-2.5 font-semibold">Plataformas</th>
              <th className="px-3 py-2.5 text-center font-semibold">iFood API</th>
              <th className="px-3 py-2.5 text-center font-semibold">99 API</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtradas.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                >
                  Nenhuma loja encontrada.
                </td>
              </tr>
            ) : (
              filtradas.map((r) => (
                <tr key={r.unitId} className="hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
                        {r.unitCode ?? "—"}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-medium">
                            {r.unitName}
                          </span>
                          {!r.ativa && (
                            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                              inativa
                            </span>
                          )}
                        </div>
                        {r.cidade && (
                          <div className="text-[11px] text-muted-foreground">
                            {r.cidade}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/plataforma/${r.clienteId}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {r.cliente}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      {r.platforms.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        r.platforms.map((p) => (
                          <PlatformLogo key={p} platform={p} size="sm" />
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <ApiCell on={r.ifoodApi} />
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <ApiCell on={r.ninefoodApi} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ApiCell({ on }: { on: boolean }) {
  return on ? (
    <span
      title="Conectada via API"
      className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
    >
      <Check className="size-3.5" strokeWidth={3} />
    </span>
  ) : (
    <span
      title="Sem API — importação de planilha"
      className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground/50"
    >
      <Minus className="size-3.5" />
    </span>
  )
}
