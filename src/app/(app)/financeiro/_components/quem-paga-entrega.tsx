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
 * Quem bancou a entrega, pedido a pedido.
 *
 * ⚠️ "O cliente foi cobrado" NÃO é o mesmo que "a loja não pagou". No iFood as
 * duas coisas convivem no mesmo pedido: o cliente paga o frete e a loja ainda
 * leva o débito da entrega no extrato. A primeira versão desta tela confundiu
 * as duas e mostrou "11 pedidos a loja bancou" com R$ 71.868 debitados dela no
 * mesmo mês — o número certo é 4.894.
 *
 * Por isso a leitura aqui é do EXTRATO, não da taxa cobrada do cliente.
 */
export function QuemPagaEntregaCard({ dados }: { dados: QuemPagaEntrega[] }) {
  const comMovimento = dados.filter((d) => d.pedidos > 0)
  if (!comMovimento.length) return null

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b px-5 py-3">
        <Bike className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Quem banca a entrega</h2>
      </div>

      <div className="divide-y">
        {comMovimento.map((d) => {
          // Na Keeta as duas coisas convivem em TODO pedido: o cliente paga a
          // taxa de entrega e a loja paga a "Taxa adicional de distância".
          // Não é um ou outro — então ali não se desenha barra de disputa, se
          // mostram os dois lados. (No iFood e na 99 existe lançamento que diz
          // explicitamente que a loja bancou AQUELA entrega, e aí a divisão
          // faz sentido.)
          const divisaoExcludente = d.plataforma !== "keeta"
          const base = d.lojaBancou + d.clientePagou
          const pctLoja = base > 0 ? (d.lojaBancou / base) * 100 : 0
          const pctCliente = base > 0 ? (d.clientePagou / base) * 100 : 0
          const lojaBancaMuito = pctLoja >= 50

          return (
            <div key={d.plataforma} className="px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <PlatformLogo platform={d.plataforma} className="size-4" />
                  <span className="text-sm font-medium">{NOME[d.plataforma]}</span>
                  <span className="text-xs text-muted-foreground">
                    {fmtNum(d.pedidos)} pedidos com entrega
                  </span>
                </div>
                {d.custoTotalEntrega > 0 && (
                  <span className="text-xs text-muted-foreground">
                    custo total de entrega:{" "}
                    <strong className="text-foreground">
                      {fmtBRL(d.custoTotalEntrega)}
                    </strong>
                  </span>
                )}
              </div>

              {!divisaoExcludente ? (
                <div className="mt-2 space-y-1.5 text-[11px] tabular-nums">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <span className="font-semibold text-amber-700 dark:text-amber-400">
                      A loja paga taxa de distância em{" "}
                      <strong>{fmtNum(d.lojaBancou)}</strong> pedidos
                      {d.pedidos > 0 && ` (${fmtPct((d.lojaBancou / d.pedidos) * 100)})`}
                    </span>
                    <span className="font-semibold text-amber-700 dark:text-amber-400">
                      {fmtBRL(d.valorBancadoPelaLoja)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <span className="text-emerald-700 dark:text-emerald-400">
                      O cliente pagou taxa de entrega em{" "}
                      <strong>{fmtNum(d.clientePagou)}</strong> pedidos
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-400">
                      {fmtBRL(d.valorPagoPeloCliente)}
                    </span>
                  </div>
                  <p className="pt-0.5 text-muted-foreground">
                    Na Keeta os dois acontecem no mesmo pedido: o cliente paga o
                    frete e a loja ainda leva a taxa de distância. O relatório
                    não diz em quantos pedidos a loja bancou o frete do cliente.
                  </p>
                </div>
              ) : base > 0 ? (
                <>
                  {/* Âmbar primeiro: o que sai do bolso da loja é o que
                      interessa, então ele abre a barra. */}
                  <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="bg-amber-500"
                      style={{ width: `${pctLoja}%` }}
                      title={`A loja bancou: ${fmtNum(d.lojaBancou)} pedidos`}
                    />
                    <div
                      className="bg-emerald-500"
                      style={{ width: `${pctCliente}%` }}
                      title={`O cliente pagou: ${fmtNum(d.clientePagou)} pedidos`}
                    />
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-4 text-[11px] tabular-nums">
                    <span
                      className={
                        lojaBancaMuito
                          ? "font-semibold text-amber-700 dark:text-amber-400"
                          : "text-amber-700 dark:text-amber-400"
                      }
                    >
                      <strong>{fmtNum(d.lojaBancou)}</strong> a loja bancou (
                      {fmtPct(pctLoja)})
                      {d.valorBancadoPelaLoja > 0 && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {fmtBRL(d.valorBancadoPelaLoja)}
                        </span>
                      )}
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-400">
                      <strong>{fmtNum(d.clientePagou)}</strong> o cliente pagou (
                      {fmtPct(pctCliente)})
                    </span>
                  </div>

                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    de cada 10 entregas,{" "}
                    <strong className="text-foreground">
                      {(pctLoja / 10).toFixed(1)}
                    </strong>{" "}
                    saíram por conta da loja
                  </p>
                </>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  Sem informação de quem bancou a entrega neste período.
                </p>
              )}

              {d.semInfo > 0 && divisaoExcludente && (
                <p className="mt-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  <strong className="text-foreground">{fmtNum(d.semInfo)} pedidos</strong>{" "}
                  {d.plataforma === "keeta"
                    ? "sem informação de frete no relatório da Keeta — não dá pra dizer quem bancou, então ficam fora da conta em vez de serem creditados a alguém."
                    : "sem custo de entrega identificado (retirada no balcão ou entrega própria)."}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <p className="border-t px-5 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        Fonte: extrato financeiro da plataforma. No iFood, o cliente pagar o frete{" "}
        <strong>não</strong> significa que a loja não pagou — o extrato cobra a
        entrega da loja e mostra à parte quanto dela a loja bancou como promoção.
      </p>
    </section>
  )
}
