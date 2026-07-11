import { Megaphone } from "lucide-react"

import type { KeetaPromocaoResumo } from "@/lib/data/keeta-promocoes"
import { fmtBRL, fmtNum } from "@/lib/format"

/**
 * ROI por campanha da Keeta (relatório "Dados da promoção"). Componente
 * compartilhado: usado na tela de Pedidos → Keeta, no detalhe da unidade e
 * onde mais fizer sentido. Mostra, por regra de desconto, os pedidos que a
 * campanha trouxe, o custo (dinheiro real da loja) e o custo por pedido.
 *
 * OBS importante (evita o mal-entendido do "faturamento inflado"): não somamos
 * "vendas de promoção", porque o mesmo pedido entra em várias campanhas e a
 * soma dá o dobro/triplo do faturamento real. O custo, sim, não sobrepõe.
 */
export function KeetaRoiCard({
  promocoes,
  showEmptyCta = true,
}: {
  promocoes: KeetaPromocaoResumo
  /** Quando não há dado, mostra o CTA "sobe o relatório". Off = não renderiza. */
  showEmptyCta?: boolean
}) {
  if (!promocoes.hasData && !showEmptyCta) return null
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <div className="flex items-center gap-2">
          <Megaphone className="size-4 text-violet-600" />
          <h3 className="text-sm font-semibold">ROI por campanha</h3>
        </div>
        {promocoes.hasData && (
          <span className="text-[10px] text-muted-foreground">
            {fmtBRL(promocoes.totalDespesa)} de custo em promoções ·{" "}
            {fmtBRL(promocoes.custoPorPedidoMedio)} por pedido de campanha
          </span>
        )}
      </div>
      {!promocoes.hasData ? (
        <p className="px-5 py-8 text-center text-xs text-muted-foreground">
          Sem &quot;Dados da promoção&quot; da Keeta neste mês. Sobe o relatório
          em{" "}
          <a href="/importacao" className="underline">
            /importacao
          </a>{" "}
          pra ver o custo por campanha.
        </p>
      ) : (
        <>
          <div className="flex flex-col divide-y">
            {promocoes.campanhas.map((c, i) => {
              const maxDespesa = Math.max(
                0,
                ...promocoes.campanhas.map((x) => x.despesa),
              )
              const share = maxDespesa > 0 ? (c.despesa / maxDespesa) * 100 : 0
              return (
                <div
                  key={c.regra}
                  className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/30"
                >
                  <RoiRank n={i + 1} />
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-xs font-medium" title={c.regra}>
                      {c.regra}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-rose-400/70"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {fmtNum(c.pedidos)} ped
                        {c.campanhas > 1 ? ` · ${c.campanhas} atos` : ""}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-bold tabular-nums text-rose-700 dark:text-rose-400">
                      {fmtBRL(c.despesa)}
                    </p>
                    <p className="text-[10px] tabular-nums text-muted-foreground">
                      {fmtBRL(c.custoPorPedido)}/ped
                    </p>
                  </div>
                </div>
              )
            })}
            {/* Total */}
            <div className="flex items-center gap-3 border-t-2 bg-muted/30 px-5 py-2.5 text-xs font-semibold">
              <div className="flex-1">
                Total · {promocoes.campanhas.length} campanha
                {promocoes.campanhas.length === 1 ? "" : "s"} ·{" "}
                {fmtNum(promocoes.totalPedidos)} pedidos
              </div>
              <div className="shrink-0 text-right">
                <p className="tabular-nums">{fmtBRL(promocoes.totalDespesa)}</p>
                <p className="text-[10px] font-normal tabular-nums text-muted-foreground">
                  {fmtBRL(promocoes.custoPorPedidoMedio)}/ped
                </p>
              </div>
            </div>
          </div>
          <p className="border-t px-5 py-2 text-[11px] text-muted-foreground">
            Cada linha é uma regra de desconto. <strong>Custo/pedido</strong> =
            quanto a loja gastou pra cada pedido que a campanha trouxe — quanto
            menor, mais eficiente. O <strong>custo</strong> é dinheiro real. Já
            os <strong>pedidos</strong> somam por campanha — um mesmo pedido pode
            entrar em várias, então o total não é o número de pedidos da Keeta.
          </p>
        </>
      )}
    </div>
  )
}

/** Selo de posição no ranking (por custo) — top 3 em destaque. */
function RoiRank({ n }: { n: number }) {
  return (
    <span
      className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums ${
        n <= 3
          ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {n}
    </span>
  )
}

