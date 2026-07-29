import { Bike } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import type { QuemPagaEntrega } from "@/lib/data/taxa-entrega"

const NOME: Record<string, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
}

/**
 * Quem paga a entrega, pedido a pedido.
 *
 * Responde uma pergunta que o total de custo de entrega não responde: em
 * quantos pedidos o cliente pagou o frete e em quantos a loja bancou. A
 * diferença entre plataformas é grande — e é decisão de negócio, não detalhe.
 *
 * ⚠️ A barra é desenhada só sobre os pedidos COM dado. Pedido sem informação
 * aparece à parte, nunca somado ao "loja bancou": tratá-lo como entrega grátis
 * inverteria a conclusão, que foi o erro cometido na primeira leitura destes
 * números.
 */
export function QuemPagaEntregaCard({ dados }: { dados: QuemPagaEntrega[] }) {
  const comMovimento = dados.filter((d) => d.pedidos > 0)
  if (!comMovimento.length) return null

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b px-5 py-3">
        <Bike className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Quem paga a entrega</h2>
      </div>

      <div className="divide-y">
        {comMovimento.map((d) => {
          const base = d.pedidosComDado
          const pctCliente = base > 0 ? (d.clientePagou / base) * 100 : 0
          const pctLoja = base > 0 ? (d.lojaBancou / base) * 100 : 0
          // A loja bancar a maioria não é erro — é a troca "frete grátis por
          // visibilidade". Mas é dinheiro, então merece destaque.
          const lojaBancaMuito = pctLoja >= 50

          return (
            <div key={d.plataforma} className="px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <PlatformLogo platform={d.plataforma} className="size-4" />
                  <span className="text-sm font-medium">{NOME[d.plataforma]}</span>
                  <span className="text-xs text-muted-foreground">
                    {fmtNum(d.pedidos)} pedidos
                  </span>
                </div>
                {d.custoDaLoja > 0 && (
                  <span className="text-xs text-muted-foreground">
                    custo debitado da loja:{" "}
                    <strong className="text-foreground">{fmtBRL(d.custoDaLoja)}</strong>
                  </span>
                )}
              </div>

              {base > 0 ? (
                <>
                  <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="bg-emerald-500"
                      style={{ width: `${pctCliente}%` }}
                      title={`Cliente pagou: ${fmtNum(d.clientePagou)} pedidos`}
                    />
                    <div
                      className="bg-amber-500"
                      style={{ width: `${pctLoja}%` }}
                      title={`Loja bancou: ${fmtNum(d.lojaBancou)} pedidos`}
                    />
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-4 text-[11px] tabular-nums">
                    <span className="text-emerald-700 dark:text-emerald-400">
                      <strong>{fmtNum(d.clientePagou)}</strong> o cliente pagou (
                      {fmtPct(pctCliente)}) ·{" "}
                      <span className="text-muted-foreground">
                        {fmtBRL(d.valorPagoPeloCliente)}
                      </span>
                    </span>
                    <span
                      className={
                        lojaBancaMuito
                          ? "font-semibold text-amber-700 dark:text-amber-400"
                          : "text-amber-700 dark:text-amber-400"
                      }
                    >
                      <strong>{fmtNum(d.lojaBancou)}</strong> a loja bancou (
                      {fmtPct(pctLoja)})
                    </span>
                  </div>

                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    de cada 10 pedidos,{" "}
                    <strong className="text-foreground">
                      {(pctCliente / 10).toFixed(1)}
                    </strong>{" "}
                    o cliente pagou a entrega e{" "}
                    <strong className="text-foreground">
                      {(pctLoja / 10).toFixed(1)}
                    </strong>{" "}
                    saíram por conta da loja
                  </p>
                </>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  Sem informação de quem pagou a entrega neste período.
                </p>
              )}

              {d.pedidosSemDado > 0 && (
                <p className="mt-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  <strong className="text-foreground">
                    {fmtNum(d.pedidosSemDado)} pedidos
                  </strong>{" "}
                  ficaram fora desta conta: entraram pela API, que não informa a
                  taxa cobrada do cliente. Eles <strong>não</strong> são entrega
                  grátis — é dado que o iFood ainda não libera pra gente. O custo
                  debitado da loja, ao lado, cobre o mês inteiro.
                </p>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
