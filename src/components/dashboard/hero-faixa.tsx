import { ArrowDownRight, ArrowUpRight } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"

export type HeroMetric = {
  label: string
  value: string
  sub?: string
  /** Variação % vs o mesmo período do mês passado (null = sem base pra comparar). */
  delta?: number | null
  /**
   * Cobertura por plataforma: mostra as 3, apagando (cinza) a que não tem dado
   * no período. Fica claro num relance se todas entraram.
   */
  platformCoverage?: { id: PlatformId; on: boolean }[]
}

function DeltaSeta({ delta }: { delta: number | null | undefined }) {
  if (delta == null || !isFinite(delta)) return null
  const sobe = delta >= 0
  const Icon = sobe ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={`inline-flex items-center text-[11px] font-semibold tabular-nums ${
        sobe
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-rose-600 dark:text-rose-400"
      }`}
      title="vs. mesmo período do mês passado"
    >
      <Icon className="size-3" />
      {Math.abs(delta).toFixed(0)}%
    </span>
  )
}

// Colunas fixas (Tailwind precisa das classes estáticas).
const COLS_CLASS: Record<number, string> = {
  4: "grid-cols-2 sm:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
}

/**
 * Faixa-herói: números-manchete num bloco LIMPO e seamless (hairlines entre as
 * células via `gap-px`, sem borda/ícone por card). Cada célula traz os logos
 * das plataformas, apagando a que não tem dado no período.
 *
 * `cols` fixa quantas colunas por linha (4 pro topo, 5 pra operação); `big`
 * usa o número maior (pros cards de dinheiro).
 */
export function HeroFaixa({
  metrics,
  cols = 5,
  big = false,
}: {
  metrics: HeroMetric[]
  cols?: 4 | 5
  big?: boolean
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className={`grid gap-px bg-border ${COLS_CLASS[cols]}`}>
        {metrics.map((m) => (
          <div key={m.label} className="flex flex-col gap-1 bg-card p-3.5">
            <div className="flex items-start justify-between gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {m.label}
              </span>
              {m.platformCoverage && m.platformCoverage.length > 0 && (
                <span className="flex shrink-0 items-center gap-0.5">
                  {m.platformCoverage.map((p) => (
                    <PlatformLogo
                      key={p.id}
                      platform={p.id}
                      size="sm"
                      className={`size-4 ${p.on ? "" : "opacity-25 grayscale"}`}
                    />
                  ))}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-baseline gap-x-1.5">
              <span
                className={`${big ? "text-2xl" : "text-xl"} font-semibold tracking-tight tabular-nums`}
              >
                {m.value}
              </span>
              <DeltaSeta delta={m.delta} />
            </div>
            {m.sub && (
              <span className="text-[11px] leading-tight text-muted-foreground">
                {m.sub}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
