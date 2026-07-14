import { CalendarClock, Check, Clock } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { fmtBRL } from "@/lib/format"
import type { KeetaRepasseResumo } from "@/lib/data/keeta-repasses"

function fmtDia(d: string | null) {
  if (!d) return "—"
  const [, m, day] = d.split("-")
  return `${day}/${m}`
}

/**
 * Recebíveis da Keeta — "quando cai o dinheiro" (repasse da Fatura). Card
 * discreto no padrão dos outros da aba. Só Keeta: iFood/99 não disponibilizam
 * repasse em relatório, então nem entram (avisado no rodapé).
 */
export function RecebiveisPlataforma({ keeta }: { keeta: KeetaRepasseResumo }) {
  if (keeta.ciclos.length === 0) return null
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Recebíveis da Keeta · quando cai</h3>
        <span className="ml-auto">
          <PlatformLogo platform="keeta" size="sm" />
        </span>
      </div>
      <p className="mb-2 text-xs tabular-nums text-muted-foreground">
        a liquidar <b className="text-amber-600">{fmtBRL(keeta.aLiquidar)}</b> ·
        liquidado <b className="text-emerald-600">{fmtBRL(keeta.liquidado)}</b>
      </p>
      <ul className="grid gap-1 text-xs sm:grid-cols-2">
        {keeta.ciclos.map((c, i) => (
          <li
            key={c.ciclo ?? c.dataLiquidacao ?? i}
            className="flex items-center justify-between gap-2 rounded border bg-muted/20 px-2 py-1"
          >
            <span className="flex items-center gap-1.5">
              {c.liquidado ? (
                <Check className="size-3 text-emerald-600" strokeWidth={3} />
              ) : (
                <Clock className="size-3 text-amber-600" />
              )}
              Cai {fmtDia(c.dataLiquidacao)}
            </span>
            <span className="font-medium tabular-nums">{fmtBRL(c.valor)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] text-muted-foreground">
        iFood e 99 não aparecem aqui — não disponibilizam o repasse em relatório.
      </p>
    </div>
  )
}
