"use client"

import * as React from "react"
import { CalendarClock, Check, Clock } from "lucide-react"

import { fmtBRL } from "@/lib/format"
import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import type { KeetaRepasseResumo } from "@/lib/data/keeta-repasses"

const PLATS: { id: PlatformId; label: string; soon?: boolean }[] = [
  { id: "keeta", label: "Keeta" },
  { id: "ifood", label: "iFood", soon: true },
  { id: "99food", label: "99 Food", soon: true },
]

function fmtDate(d: string | null) {
  if (!d) return "—"
  const [y, m, day] = d.split("-")
  return `${day}/${m}/${y.slice(2)}`
}

/**
 * Recebíveis por plataforma — "quando cai o dinheiro". Hoje só a Keeta tem o
 * repasse (aba Fatura); iFood/99 entram quando lermos o repasse deles.
 */
export function RecebiveisPlataforma({ keeta }: { keeta: KeetaRepasseResumo }) {
  const [plat, setPlat] = React.useState<PlatformId>("keeta")

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <CalendarClock className="size-4" /> Recebíveis das plataformas
        </h3>
        <div className="inline-flex items-center gap-1 rounded-full border bg-background p-0.5">
          {PLATS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlat(p.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                plat === p.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <PlatformLogo platform={p.id} size="sm" className="rounded-[3px]" />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {plat === "keeta" ? (
        keeta.ciclos.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Sem repasse da Keeta neste mês. Suba a <strong>Fatura</strong> da
            Keeta na Importação.
          </p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-3 gap-2 text-center">
              <Resumo label="Total" value={keeta.total} />
              <Resumo label="A liquidar" value={keeta.aLiquidar} accent="amber" />
              <Resumo label="Liquidado" value={keeta.liquidado} accent="emerald" />
            </div>
            <ul className="divide-y">
              {keeta.ciclos.map((c, i) => (
                <li
                  key={c.ciclo ?? c.dataLiquidacao ?? i}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      {c.liquidado ? (
                        <Check className="size-3.5 text-emerald-600" strokeWidth={3} />
                      ) : (
                        <Clock className="size-3.5 text-amber-600" />
                      )}
                      Cai em {fmtDate(c.dataLiquidacao)}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      Ciclo {c.ciclo ?? "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">
                      {fmtBRL(c.valor)}
                    </p>
                    <p
                      className={`text-[10px] font-medium ${
                        c.liquidado ? "text-emerald-600" : "text-amber-600"
                      }`}
                    >
                      {c.liquidado ? "liquidado" : "a receber"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )
      ) : (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Em breve — a gente ainda não lê o repasse do{" "}
          {PLATS.find((p) => p.id === plat)?.label}.
        </p>
      )}
    </div>
  )
}

function Resumo({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: "amber" | "emerald"
}) {
  const tone =
    accent === "amber"
      ? "text-amber-600"
      : accent === "emerald"
        ? "text-emerald-600"
        : "text-foreground"
  return (
    <div className="rounded-md border bg-background px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`text-sm font-semibold tabular-nums ${tone}`}>
        {fmtBRL(value)}
      </p>
    </div>
  )
}
