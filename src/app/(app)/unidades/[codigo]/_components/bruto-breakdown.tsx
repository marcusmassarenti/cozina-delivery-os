"use client"

import * as React from "react"
import { PieChart } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { fmtBRLShort } from "@/lib/format"

type Plat = { id: PlatformId; bruto: number; liquido: number }

/**
 * "Para onde vai o bruto" com seletor de plataforma. Em "Todas" usa o
 * consolidado da loja; por plataforma usa o bruto/líquido daquela plataforma
 * e RATEIA o CMV + custo de operação pela fatia do bruto (a loja lança o custo
 * total, não por plataforma) — assim dá pra ver a margem aproximada por app.
 */
export function BrutoBreakdown({
  platforms,
  totalBruto,
  totalLiquido,
  cmv,
  operacao,
}: {
  platforms: Plat[]
  totalBruto: number
  totalLiquido: number
  cmv: number
  operacao: number
}) {
  const [sel, setSel] = React.useState<"todas" | PlatformId>("todas")
  const multi = platforms.length > 1

  // Escopo selecionado
  let bruto: number
  let liquido: number
  let cmvScope: number
  let opScope: number
  if (sel === "todas") {
    bruto = totalBruto
    liquido = totalLiquido
    cmvScope = cmv
    opScope = operacao
  } else {
    const p = platforms.find((x) => x.id === sel)
    bruto = p?.bruto ?? 0
    liquido = p?.liquido ?? 0
    const share = totalBruto > 0 ? bruto / totalBruto : 0
    cmvScope = cmv * share
    opScope = operacao * share
  }
  const taxas = Math.max(0, bruto - liquido)
  const margem = liquido - cmvScope
  const resultado = margem - opScope

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PieChart className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Para onde vai o bruto</h3>
        <div className="ml-auto flex items-center gap-1">
          {multi && (
            <button
              type="button"
              onClick={() => setSel("todas")}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                sel === "todas"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Todas
            </button>
          )}
          {platforms.map((p) => {
            const active = sel === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSel(multi ? p.id : "todas")}
                aria-label={p.id}
                className={`flex items-center rounded-md p-1 transition-colors ${
                  active
                    ? "bg-primary/10 ring-1 ring-primary"
                    : multi
                      ? "hover:bg-muted"
                      : ""
                }`}
              >
                <PlatformLogo platform={p.id} size="sm" />
              </button>
            )
          })}
        </div>
      </div>

      <CompBar
        label="Líquido pra loja"
        value={liquido}
        base={bruto}
        color="bg-emerald-500"
      />
      <CompBar
        label="Taxas das plataformas"
        value={taxas}
        base={bruto}
        color="bg-rose-500"
      />
      {cmvScope > 0 && (
        <CompBar
          label="CMV (produtos)"
          value={cmvScope}
          base={bruto}
          color="bg-amber-500"
        />
      )}
      {opScope > 0 && (
        <CompBar
          label="Custo da operação"
          value={opScope}
          base={bruto}
          color="bg-orange-500"
        />
      )}
      {cmvScope > 0 && (
        <CompBar
          label={opScope > 0 ? "Resultado operacional" : "Margem líquida"}
          value={Math.max(0, opScope > 0 ? resultado : margem)}
          base={bruto}
          color="bg-blue-500"
          emphasis
        />
      )}

      {sel !== "todas" && cmv > 0 && (
        <p className="mt-2 text-[10px] text-muted-foreground">
          CMV e operação rateados pela fatia do bruto desta plataforma (a loja
          lança o custo total, não por app).
        </p>
      )}
    </div>
  )
}

function CompBar({
  label,
  value,
  base,
  color,
  emphasis,
}: {
  label: string
  value: number
  base: number
  color: string
  emphasis?: boolean
}) {
  const pct = base > 0 ? (value / base) * 100 : 0
  return (
    <div className="mb-2.5">
      <div className="mb-0.5 flex items-baseline justify-between">
        <span
          className={`text-xs ${emphasis ? "font-semibold" : "text-muted-foreground"}`}
        >
          {label}
        </span>
        <div className="flex items-baseline gap-2 tabular-nums">
          <span className="text-xs font-semibold">{fmtBRLShort(value)}</span>
          <span className="text-[10px] text-muted-foreground">
            {pct.toFixed(0)}%
          </span>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${color}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  )
}
