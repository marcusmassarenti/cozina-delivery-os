import { Bike } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import type { DeliveryFee, QuemPagaEntrega } from "@/lib/data/taxa-entrega"

const NOME: Record<string, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
}

/**
 * Entrega da loja: quanto custou E quem bancou, no mesmo lugar.
 *
 * Antes eram dois cards em telas diferentes, e cada um respondia metade da
 * pergunta: o custo não dizia quem pagou, e "quem paga" não dizia quanto
 * custou. Juntos, viram a conta que interessa — quanto da entrega saiu do
 * bolso da loja.
 *
 * ⚠️ Duas armadilhas embutidas aqui, as duas já erradas antes:
 *  - Cliente pagar o frete NÃO significa que a loja não pagou. No iFood e na
 *    Keeta as duas coisas acontecem no mesmo pedido.
 *  - Na Keeta não existe lançamento dizendo que a loja bancou a entrega DE UM
 *    pedido específico. Ali mostramos os dois lados, sem dividir.
 */
export function EntregaCard({
  deliveryFee,
  quemPaga,
  bruto,
}: {
  deliveryFee: DeliveryFee
  quemPaga: QuemPagaEntrega[]
  bruto: number
}) {
  const comMovimento = quemPaga.filter((q) => q.pedidos > 0)

  // ⚠️ Na Keeta, deliveryFee.keeta é o frete que o CLIENTE pagou (coluna
  // taxa_entrega de keeta_pedidos) — não custo da loja. Usar aquele número
  // aqui diria que a loja gastou o que o cliente pagou. O custo real da loja
  // na Keeta é a taxa de distância, que vem em valorBancadoPelaLoja.
  const custoPorPlat: Record<string, number> = {
    ifood: deliveryFee.ifood,
    "99food": deliveryFee.ninefood,
    keeta: quemPaga.find((q) => q.plataforma === "keeta")?.valorBancadoPelaLoja ?? 0,
  }
  const custoTotalLoja =
    custoPorPlat.ifood + custoPorPlat["99food"] + custoPorPlat.keeta

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Bike className="size-4 text-amber-600" />
        <h3 className="text-sm font-semibold">Entrega — custo e quem bancou</h3>
        <span className="ml-auto text-base font-bold tabular-nums text-rose-700 dark:text-rose-400">
          − {fmtBRL(custoTotalLoja)}
        </span>
      </div>

      <div className="space-y-3">
        {comMovimento.map((q) => {
          const excludente = q.plataforma !== "keeta"
          const base = q.lojaBancou + q.clientePagou
          const pctLoja = base > 0 ? (q.lojaBancou / base) * 100 : 0
          const pctCliente = base > 0 ? (q.clientePagou / base) * 100 : 0
          const custo = custoPorPlat[q.plataforma] ?? 0

          return (
            <div key={q.plataforma} className="rounded-lg border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <PlatformLogo platform={q.plataforma} className="size-4" />
                  <span className="text-sm font-medium">{NOME[q.plataforma]}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {fmtNum(q.pedidos)} entregas
                  </span>
                </div>
                {custo > 0 && (
                  <span className="text-sm font-semibold tabular-nums text-rose-700 dark:text-rose-400">
                    − {fmtBRL(custo)}
                  </span>
                )}
              </div>

              {excludente && base > 0 ? (
                <>
                  <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="bg-amber-500" style={{ width: `${pctLoja}%` }} />
                    <div className="bg-emerald-500" style={{ width: `${pctCliente}%` }} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-[11px] tabular-nums">
                    <span className="font-semibold text-amber-700 dark:text-amber-400">
                      {fmtNum(q.lojaBancou)} a loja bancou ({fmtPct(pctLoja)})
                      {q.valorBancadoPelaLoja > 0 && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          · {fmtBRL(q.valorBancadoPelaLoja)}
                        </span>
                      )}
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-400">
                      {fmtNum(q.clientePagou)} o cliente pagou ({fmtPct(pctCliente)})
                      {q.valorPagoPeloCliente > 0 && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {fmtBRL(q.valorPagoPeloCliente)}
                        </span>
                      )}
                    </span>
                  </div>
                </>
              ) : (
                <div className="mt-2 space-y-1 text-[11px] tabular-nums">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold text-amber-700 dark:text-amber-400">
                      A loja pagou taxa de distância em {fmtNum(q.lojaBancou)} entregas
                      {q.pedidos > 0 && ` (${fmtPct((q.lojaBancou / q.pedidos) * 100)})`}
                    </span>
                    <span className="font-semibold text-amber-700 dark:text-amber-400">
                      {fmtBRL(q.valorBancadoPelaLoja)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-emerald-700 dark:text-emerald-400">
                      O cliente pagou frete em {fmtNum(q.clientePagou)} entregas
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-400">
                      {fmtBRL(q.valorPagoPeloCliente)}
                    </span>
                  </div>
                  <p className="pt-0.5 text-muted-foreground">
                    Na Keeta os dois caem no mesmo pedido — o relatório não separa
                    em quantos a loja bancou o frete do cliente.
                  </p>
                </div>
              )}

              {q.semInfo > 0 && excludente && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {fmtNum(q.semInfo)} sem custo de entrega (retirada no balcão ou
                  entrega própria)
                </p>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        {fmtPct(bruto > 0 ? (custoTotalLoja / bruto) * 100 : 0)} do bruto · já
        está dentro das taxas das plataformas (no DRE acima). O cliente pagar o
        frete <strong>não</strong> significa que a loja não pagou: a plataforma
        cobra a entrega da loja e mostra à parte quanto dela a loja bancou.
      </p>
    </div>
  )
}
