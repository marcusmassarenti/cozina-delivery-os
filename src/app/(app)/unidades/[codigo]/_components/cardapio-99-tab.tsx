/**
 * Cardápio (99 Food) — top itens vendidos no mês + a composição do ticket.
 *
 * ⚠️ ESTE ARQUIVO DIZIA "sem complementos (a plataforma não traz)". Trazia: o
 * complemento sempre veio na comanda do webhook e era descartado na extração.
 * Desde 25/08/26 a comanda está guardada, e com ela dá pra responder o que
 * NENHUMA planilha responde — a "Dados do item" é agregada por dia e não sabe
 * o que estava no mesmo pedido.
 */
import { ShoppingBasket, TrendingUp, Utensils } from "lucide-react"

import {
  getNinefoodComposicaoTicket,
  getNinefoodItensRankingForMonth,
  getNinefoodResumoForMonth,
} from "@/lib/data/ninefood-imported"
import { ComposicaoTicket } from "./composicao-ticket"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"

export async function Cardapio99Tab({
  unitId,
  year,
  month,
}: {
  unitId: string
  year: number
  month: number
}) {
  const [resumo, itens, ticket] = await Promise.all([
    getNinefoodResumoForMonth(unitId, year, month),
    getNinefoodItensRankingForMonth(unitId, year, month, 30),
    getNinefoodComposicaoTicket(unitId, year, month),
  ])

  // Sem ranking MAS com comanda: a loja está conectada por API e ainda não
  // subiu o "Dados do item". Mostrar o vazio ali seria esconder o que já
  // temos — a composição do ticket não depende da planilha.
  if (itens.length === 0 && ticket) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-dashed bg-card p-4 text-center text-xs text-muted-foreground">
          O ranking de itens vem do relatório &quot;Dados do item&quot;, que
          ainda não foi importado neste mês. O que está abaixo vem da comanda
          dos pedidos, que entra sozinha.
        </div>
        <ComposicaoTicket t={ticket} />
      </div>
    )
  }

  if (itens.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        Nenhum dado de cardápio do 99 Food importado nesse mês.
        <br />
        Sobe o XLSX de &quot;Dados do item&quot; em{" "}
        <span className="font-medium">/importacao</span>.
      </div>
    )
  }

  const totalQtd = itens.reduce((s, it) => s + it.qtdVendida, 0)
  const totalReceita = itens.reduce((s, it) => s + it.receita, 0)
  const top = itens[0]

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-3">
        <MiniKpi
          label="Itens distintos"
          value={fmtNum(itens.length)}
          hint={`em ${resumo.diasComDados || itens[0]?.diasComVenda || "—"} dia(s)`}
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
          value={top.nomeItem.length > 24 ? top.nomeItem.slice(0, 22) + "…" : top.nomeItem}
          hint={`${fmtNum(top.qtdVendida)} vendidos · ${fmtBRL(top.receita)}`}
          icon={<TrendingUp className="size-4" />}
        />
      </div>

      {/* Ranking */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <h3 className="text-sm font-semibold">Top itens vendidos (99 Food)</h3>
          <span className="text-[10px] text-muted-foreground">
            {itens.length} itens · ordenado por receita
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">#</th>
                <th className="px-3 py-2 text-left font-semibold">Item</th>
                <th className="px-3 py-2 text-right font-semibold">Qtd</th>
                <th className="px-3 py-2 text-right font-semibold">Receita</th>
                <th className="px-3 py-2 text-right font-semibold">Preço médio</th>
                <th className="px-3 py-2 text-right font-semibold">Conv. carrinho</th>
                <th className="px-3 py-2 text-right font-semibold">Dias</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {itens.map((it, idx) => (
                <tr key={`${it.nomeItem}-${idx}`} className="hover:bg-muted/30">
                  <td className="px-3 py-1.5 text-muted-foreground tabular-nums">
                    {idx + 1}
                  </td>
                  <td className="px-3 py-1.5 font-medium">{it.nomeItem}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {fmtNum(it.qtdVendida)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                    {fmtBRL(it.receita)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {it.precoMedio > 0 ? fmtBRL(it.precoMedio) : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {it.conversaoMedia != null
                      ? fmtPct(it.conversaoMedia)
                      : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {it.diasComVenda}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {ticket && <ComposicaoTicket t={ticket} />}
    </div>
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
