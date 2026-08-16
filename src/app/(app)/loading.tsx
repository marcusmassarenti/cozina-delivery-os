/**
 * Skeleton genérico mostrado enquanto Server Components carregam.
 * Cobre / (Dashboard) e as telas de formato parecido.
 *
 * ⚠️ NÃO serve pra tudo: ele desenha SEIS CARTÕES DE KPI, que é o formato do
 * Dashboard. Em /unidades isso prometia uma tela que não vinha (lá é tabela) e
 * o Marcus estranhou, com razão — skeleton só ajuda quando ANTECIPA o layout.
 * Rota cujo formato difere ganha o `loading.tsx` dela (ver unidades/loading.tsx).
 * (Next 16 rebobina pra rota mais próxima quando navega.)
 */
export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <div className="h-7 w-48 animate-pulse rounded bg-muted" />
          <div className="h-4 w-64 animate-pulse rounded bg-muted/70" />
        </div>
        <div className="h-9 w-44 animate-pulse rounded-md bg-muted" />
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border bg-card p-4 shadow-sm"
          >
            <div className="size-9 animate-pulse rounded-lg bg-muted" />
            <div className="mt-4 h-3 w-24 animate-pulse rounded bg-muted/70" />
            <div className="mt-2 h-6 w-32 animate-pulse rounded bg-muted" />
            <div className="mt-1 h-3 w-28 animate-pulse rounded bg-muted/50" />
          </div>
        ))}
      </div>

      {/* Conteúdo abaixo */}
      <div className="rounded-xl border bg-card p-5">
        <div className="space-y-3">
          <div className="h-4 w-40 animate-pulse rounded bg-muted/70" />
          <div className="h-32 w-full animate-pulse rounded bg-muted/50" />
        </div>
      </div>

      <p className="self-center text-xs text-muted-foreground">
        Carregando dados…
      </p>
    </div>
  )
}
