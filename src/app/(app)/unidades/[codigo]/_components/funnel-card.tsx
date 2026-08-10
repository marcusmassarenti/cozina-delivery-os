/**
 * Card de etapa de funil (estilo "preenchido") — usado no Diagnóstico e na aba
 * Cardápio. O preenchimento sobe SÓ na metade de baixo (nunca cobre o texto do
 * topo, que fica sempre legível); o % em branco fica sobre a cor.
 */
import { fmtPct } from "@/lib/format"

export function FunnelCard({
  label,
  value,
  base,
  legenda,
  positive,
  deltaPct,
}: {
  label: string
  value: number
  base: number
  /** Subtítulo curto (ex.: "Visitaram o cardápio"). */
  legenda?: string
  /** true = etapa final (verde). */
  positive?: boolean
  /** Variação vs período anterior (%), quando houver. */
  deltaPct?: number | null
}) {
  const pct = base > 0 ? Math.max(0, Math.min(100, (value / base) * 100)) : 0
  const fill = Math.max(30, Math.min(50, pct * 0.5))
  const temDelta = deltaPct != null && Math.abs(deltaPct) >= 0.05
  const up = (deltaPct ?? 0) > 0
  return (
    <div className="diag-hover relative flex h-44 flex-col overflow-hidden rounded-xl border bg-card">
      <div
        className={`absolute inset-x-0 bottom-0 ${positive ? "bg-emerald-500" : "bg-[#EF4444]"}`}
        style={{ height: `${fill}%` }}
        aria-hidden
      />
      <div className="relative z-10 p-3">
        <div className="flex items-start justify-between gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {temDelta && (
            <span
              title="vs período anterior"
              className={`shrink-0 whitespace-nowrap text-[10px] font-bold tabular-nums ${
                up
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {up ? "▲ +" : "▼ "}
              {deltaPct!.toFixed(1)}%
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">
          {value.toLocaleString("pt-BR")}
        </p>
        {legenda && (
          <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
            {legenda}
          </p>
        )}
      </div>
      <div className="relative z-10 mt-auto p-3 text-center">
        <p
          className="text-lg font-bold tabular-nums text-white"
          style={{ textShadow: "0 1px 3px rgb(0 0 0 / 0.3)" }}
        >
          {/* 1 casa, não inteiro: com `toFixed(0)` uma etapa de 24,8% e outra
              de 25,4% viravam ambas "25%", e o funil existe justamente pra
              comparar etapa com etapa. */}
          {fmtPct(pct)}
        </p>
      </div>
    </div>
  )
}
