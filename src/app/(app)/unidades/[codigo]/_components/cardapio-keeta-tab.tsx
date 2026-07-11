/**
 * Cardápio (Keeta) — top itens vendidos no mês + agregados.
 * Espelha o Cardapio99Tab. Dados de keeta_daily_item (receita derivada =
 * qtd × preço médio). Keeta traz Carrinho (%) como conversão.
 */
import { ShoppingBasket, TrendingUp, Utensils } from "lucide-react"

import { getKeetaItensRankingForMonth } from "@/lib/data/keeta-imported"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"

export async function CardapioKeetaTab({
  unitId,
  year,
  month,
}: {
  unitId: string
  year: number
  month: number
}) {
  const itens = await getKeetaItensRankingForMonth(unitId, year, month, 30)

  if (itens.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        Nenhum dado de cardápio do Keeta importado nesse mês.
        <br />
        Sobe o XLSX de &quot;Itens diário&quot; em{" "}
        <span className="font-medium">/importacao</span>.
      </div>
    )
  }

  const totalQtd = itens.reduce((s, it) => s + it.qtdVendida, 0)
  const totalReceita = itens.reduce((s, it) => s + it.receita, 0)
  const maxReceita = Math.max(0, ...itens.map((it) => it.receita))
  const top = itens[0]

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniKpi
          label="Itens distintos"
          value={fmtNum(itens.length)}
          hint={`top ${itens.length} por receita`}
          icon={<Utensils className="size-4" />}
        />
        <MiniKpi
          label="Volume total"
          value={fmtNum(totalQtd)}
          hint={`${fmtBRL(totalReceita)} de receita`}
          icon={<ShoppingBasket className="size-4" />}
        />
        <MiniKpi
          label="Top item"
          value={
            top.nomeItem.length > 24
              ? top.nomeItem.slice(0, 22) + "…"
              : top.nomeItem
          }
          hint={`${fmtNum(top.qtdVendida)} vendidos · ${fmtBRL(top.receita)}`}
          icon={<TrendingUp className="size-4" />}
        />
      </div>

      {/* Ranking */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <h3 className="text-sm font-semibold">Top itens vendidos (Keeta)</h3>
          <span className="text-[10px] text-muted-foreground">
            {itens.length} itens · ordenado por receita
          </span>
        </div>
        <div className="flex flex-col divide-y">
          {itens.map((it, idx) => {
            const share = maxReceita > 0 ? (it.receita / maxReceita) * 100 : 0
            return (
              <div
                key={`${it.nomeItem}-${idx}`}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/30"
              >
                <KeetaRank n={idx + 1} />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-xs font-medium">
                    {it.nomeItem}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-500/70"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {fmtNum(it.qtdVendida)} un
                      {it.precoMedio > 0 ? ` · ${fmtBRL(it.precoMedio)}` : ""}
                      {it.conversaoMedia != null
                        ? ` · ${fmtPct(it.conversaoMedia)} carrinho`
                        : ""}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-bold tabular-nums">
                    {fmtBRL(it.receita)}
                  </p>
                  <p className="text-[10px] tabular-nums text-muted-foreground">
                    {it.diasComVenda} dias
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Selo de posição no ranking — top 3 em destaque. */
function KeetaRank({ n }: { n: number }) {
  return (
    <span
      className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums ${
        n <= 3
          ? "bg-primary/15 text-primary"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {n}
    </span>
  )
}

function MiniKpi({
  label,
  value,
  hint,
  icon,
}: {
  label: string
  value: string
  hint?: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        {icon}
      </div>
      <p className="mt-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 truncate text-base font-bold tracking-tight">
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}
