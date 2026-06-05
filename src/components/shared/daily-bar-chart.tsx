/**
 * Gráfico de barras diário reutilizável (faturamento ou pedidos por dia).
 * Server component — recebe a série pronta (Record<dia, valor>) e funções de
 * formatação. Mesmo visual do gráfico do detalhe da loja, mas parametrizável
 * pra R$ ou contagem de pedidos.
 */
export function DailyBarChart({
  dias,
  valores,
  format,
  formatShort,
  barClass = "bg-emerald-500/70 hover:bg-emerald-500",
  emptyLabel = "Sem dado diário no mês.",
}: {
  dias: number[]
  valores: Record<number, number>
  /** Formato no tooltip de cada barra (ex.: fmtBRL ou "X pedidos"). */
  format: (n: number) => string
  /** Formato compacto pro rodapé (total / pico). */
  formatShort: (n: number) => string
  /** Classes Tailwind da barra (literais — passar string completa). */
  barClass?: string
  emptyLabel?: string
}) {
  const max = Math.max(...dias.map((d) => valores[d] ?? 0), 1)
  const total = dias.reduce((a, d) => a + (valores[d] ?? 0), 0)
  if (total <= 0) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>
  }
  return (
    <div>
      <div className="flex h-28 items-end gap-px">
        {dias.map((d) => {
          const v = valores[d] ?? 0
          const h = v > 0 ? Math.max(3, (v / max) * 100) : 0
          return (
            <div
              key={d}
              className={`flex-1 rounded-t transition-colors ${barClass}`}
              style={{ height: `${h}%` }}
              title={`Dia ${String(d).padStart(2, "0")}: ${format(v)}`}
            />
          )
        })}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-muted-foreground">
        <span>dia 01</span>
        <span>
          {formatShort(total)} no mês · pico {formatShort(max)}
        </span>
        <span>dia {dias.length}</span>
      </div>
    </div>
  )
}
