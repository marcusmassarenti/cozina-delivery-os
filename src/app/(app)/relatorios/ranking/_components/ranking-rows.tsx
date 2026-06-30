"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import type { RankingRow } from "@/lib/data/ranking"
import type { RankingMetrica } from "./ranking-switcher"

const PLATS_ORDER: PlatformId[] = ["ifood", "99food", "keeta"]
const PLAT_LABEL: Record<PlatformId, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
}

const medal = (pos: number) =>
  pos === 0 ? "🥇" : pos === 1 ? "🥈" : pos === 2 ? "🥉" : null

/**
 * Corpo da tabela do Ranking. As plataformas de cada loja ficam RECOLHIDAS por
 * padrão (pra não ficar gigante) — clicar na linha da loja abre/fecha.
 */
export function RankingRows({
  rows,
  metrica,
}: {
  rows: RankingRow[]
  metrica: RankingMetrica
}) {
  const [open, setOpen] = React.useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const isCol = (c: RankingMetrica) =>
    metrica === c ? "font-semibold text-foreground" : "text-muted-foreground"
  const colBg = (c: RankingMetrica) => (metrica === c ? "bg-primary/5" : "")

  return (
    <tbody>
      {rows.map((r, i) => {
        const expanded = open.has(r.unitId)
        const plats = PLATS_ORDER.filter((p) => r.perPlatform[p] > 0)
        return (
          <React.Fragment key={r.unitId}>
            <tr
              className="cursor-pointer border-t hover:bg-muted/30"
              onClick={() => toggle(r.unitId)}
            >
              <td className="px-3 py-2.5 text-center tabular-nums">
                {medal(i) ?? (
                  <span className="text-muted-foreground">{i + 1}</span>
                )}
              </td>
              <td className="px-3 py-2.5">
                <span className="flex items-center gap-1.5">
                  <ChevronRight
                    className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${
                      expanded ? "rotate-90" : ""
                    } ${plats.length === 0 ? "invisible" : ""}`}
                  />
                  <Link
                    href={`/unidades/${r.unitCode}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-medium hover:underline"
                  >
                    #{r.unitCode} · {r.unitName}
                  </Link>
                </span>
              </td>
              <td className={`px-3 py-2.5 text-right tabular-nums ${colBg("faturamento")} ${isCol("faturamento")}`}>
                {fmtBRL(r.bruto)}
              </td>
              <td className={`px-3 py-2.5 text-right tabular-nums ${colBg("ticket")} ${isCol("ticket")}`}>
                {fmtBRL(r.ticket)}
              </td>
              <td className={`px-3 py-2.5 text-right tabular-nums ${colBg("pedidos")} ${isCol("pedidos")}`}>
                {fmtNum(r.pedidos)}
              </td>
              <td className={`px-3 py-2.5 text-right tabular-nums ${colBg("margem")} ${isCol("margem")}`}>
                {r.margemPct != null ? fmtPct(r.margemPct) : "—"}
              </td>
            </tr>
            {expanded &&
              plats.map((p) => (
                <tr
                  key={p}
                  className="bg-muted/10 text-xs text-muted-foreground"
                >
                  <td />
                  <td className="py-1 pl-9 pr-3">
                    <span className="inline-flex items-center gap-1.5">
                      <PlatformLogo platform={p} size="sm" />
                      {PLAT_LABEL[p]}
                    </span>
                  </td>
                  <td className={`px-3 py-1 text-right tabular-nums ${colBg("faturamento")}`}>
                    {fmtBRL(r.perPlatform[p])}
                    <span className="ml-1.5 text-[10px] text-muted-foreground/70">
                      {r.bruto > 0
                        ? fmtPct((r.perPlatform[p] / r.bruto) * 100)
                        : ""}
                    </span>
                  </td>
                  <td />
                  <td />
                  <td />
                </tr>
              ))}
          </React.Fragment>
        )
      })}
    </tbody>
  )
}
