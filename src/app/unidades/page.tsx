import Link from "next/link"
import { ChevronRight, Plus, Search } from "lucide-react"

import {
  fmtBRL,
  fmtPct,
  fmtNum,
  units,
} from "@/lib/sample-data"

export default function UnidadesPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Unidades</h1>
            <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent-foreground">
              {units.length} no total · {units.filter((u) => u.active).length} ativas
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Visão por loja · Maio/2026
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Buscar unidade..."
              className="h-9 w-48 rounded-md border bg-card pl-8 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
            />
          </div>
          <select className="h-9 rounded-md border bg-card px-3 text-xs font-medium outline-none">
            <option>Maio/2026</option>
            <option>Abril/2026</option>
            <option>Março/2026</option>
          </select>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="size-3.5" />
            Nova Unidade
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="grid grid-cols-[60px_minmax(0,2.5fr)_minmax(0,1fr)_repeat(3,minmax(0,1fr))_auto] items-center gap-4 border-b px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div>Código</div>
          <div>Nome</div>
          <div>Cidade</div>
          <div className="text-right">Pedidos</div>
          <div className="text-right">Faturamento</div>
          <div className="text-right">Margem %</div>
          <div></div>
        </div>

        {units.map((unit, idx) => {
          const m = unit.monthly
          const hasData = m.pedidos > 0
          return (
            <Link
              key={unit.code}
              href={`/unidades/${unit.code}`}
              className={`grid grid-cols-[60px_minmax(0,2.5fr)_minmax(0,1fr)_repeat(3,minmax(0,1fr))_auto] items-center gap-4 px-5 py-4 text-sm transition-colors hover:bg-muted/50 ${
                idx < units.length - 1 ? "border-b" : ""
              } ${!unit.active ? "opacity-60" : ""}`}
            >
              <div className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <span className="text-[11px] font-bold tabular-nums">
                  {unit.code}
                </span>
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium">{unit.name}</p>
                {!unit.active && (
                  <span className="text-[10px] text-muted-foreground">
                    Inativa
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">{unit.city}</div>
              <div className="text-right tabular-nums">
                {hasData ? fmtNum(m.pedidos) : "—"}
              </div>
              <div className="text-right tabular-nums font-semibold">
                {hasData ? fmtBRL(m.faturamentoBruto) : "—"}
              </div>
              <div className="text-right tabular-nums">
                {hasData ? (
                  <span
                    className={`font-semibold ${
                      m.margemLucroPct >= 30
                        ? "text-emerald-600 dark:text-emerald-400"
                        : m.margemLucroPct >= 20
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    {fmtPct(m.margemLucroPct)}
                  </span>
                ) : (
                  "—"
                )}
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
