import { getAttentionItems } from "@/lib/data/attention"

import { AttentionPanel } from "./attention-panel"

type UnitLite = { id: string; code: string; name: string; active: boolean }

/**
 * Seção "Precisa de atenção" como componente assíncrono próprio — busca os
 * dados aqui (não no page.tsx). Assim o painel fica num boundary de Suspense:
 * as queries pesadas dele (resumo das 3 plataformas × mês atual + anterior +
 * avaliações) NÃO seguram o resto do dashboard, que renderiza antes.
 */
export async function AttentionSection({
  units,
  year,
  month,
  lojasLabel,
}: {
  units: UnitLite[]
  year: number
  month: number
  lojasLabel: string
}) {
  const items = await getAttentionItems(units, year, month)
  return <AttentionPanel items={items} lojasLabel={lojasLabel} />
}

/** Esqueleto exibido enquanto o painel carrega (mesma altura aproximada). */
export function AttentionSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <div className="size-4 animate-pulse rounded bg-muted" />
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-12 animate-pulse rounded-md border bg-muted/40"
          />
        ))}
      </div>
    </div>
  )
}
