import Link from "next/link"
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-2 font-medium">Campanha</th>
                  <th className="px-3 py-2 text-right font-medium">Pedidos</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Custo (loja)
                  </th>
                  <th className="px-5 py-2 text-right font-medium">
                    Custo/pedido
                  </th>
                </tr>
              </thead>
              <tbody>
                {promocoes.campanhas.map((c) => (
                  <tr key={c.regra} className="border-t hover:bg-muted/30">
                    <td className="px-5 py-2">
                      <span className="line-clamp-2 text-xs" title={c.regra}>
                        {c.regra}
                      </span>
                      {c.campanhas > 1 && (
                        <span className="text-[10px] text-muted-foreground">
                          {c.campanhas} atos
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtNum(c.pedidos)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-700 dark:text-rose-400">
                      {fmtBRL(c.despesa)}
                    </td>
                    <td className="px-5 py-2 text-right font-semibold tabular-nums">
                      {fmtBRL(c.custoPorPedido)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-muted/30 text-xs font-semibold">
                  <td className="px-5 py-2">
                    Total · {promocoes.campanhas.length} campanha
                    {promocoes.campanhas.length === 1 ? "" : "s"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtNum(promocoes.totalPedidos)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtBRL(promocoes.totalDespesa)}
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums">
                    {fmtBRL(promocoes.custoPorPedidoMedio)}
                  </td>
                </tr>
              </tfoot>
            </table>
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

/**
 * Versão discreta (dashboard): 1 card pequeno com o custo total de promoções
 * Keeta no mês + custo/pedido, e a campanha mais eficiente. Clica → Pedidos.
 * Não renderiza nada quando não há dado.
 */
export function KeetaRoiMini({ promocoes }: { promocoes: KeetaPromocaoResumo }) {
  if (!promocoes.hasData || promocoes.campanhas.length === 0) return null

  // Mais eficiente = menor custo/pedido entre campanhas com CUSTO real
  // (despesa > 0, pra não eleger o balde "Sem regra" de custo zero) e volume
  // relevante (>= 20 pedidos, pra não pegar uma campanha de 1 pedido barata).
  const comCusto = promocoes.campanhas.filter((c) => c.despesa > 0)
  const comVolume = comCusto.filter((c) => c.pedidos >= 20)
  const base = comVolume.length > 0 ? comVolume : comCusto
  const eficiente =
    base.length > 0
      ? base.reduce((best, c) =>
          c.custoPorPedido < best.custoPorPedido ? c : best,
        )
      : null

  return (
    <Link
      href="/pedidos?plataforma=keeta"
      className="group flex flex-col justify-between rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-violet-300 hover:bg-violet-50/40 dark:hover:bg-violet-950/20"
    >
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400">
          <Megaphone className="size-4" />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Promoções Keeta
        </span>
      </div>
      <div className="mt-3">
        <p className="text-xl font-bold tracking-tight tabular-nums">
          {fmtBRL(promocoes.totalDespesa)}
        </p>
        <p className="text-[11px] text-muted-foreground">
          de custo · {fmtBRL(promocoes.custoPorPedidoMedio)}/pedido
        </p>
      </div>
      {eficiente && (
        <p
          className="mt-2 line-clamp-1 text-[10px] text-muted-foreground"
          title={eficiente.regra}
        >
          + eficiente: {eficiente.regra} ({fmtBRL(eficiente.custoPorPedido)}/ped)
        </p>
      )}
    </Link>
  )
}
