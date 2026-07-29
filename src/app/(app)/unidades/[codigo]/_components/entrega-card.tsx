import { Bike } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { fmtBRL, fmtPct } from "@/lib/format"
import type { DeliveryFee, QuemPagaEntrega } from "@/lib/data/taxa-entrega"

/**
 * Entrega da loja: quanto custou e quem bancou — em uma linha por plataforma.
 *
 * A primeira versão virou um bloco enorme com barra grossa, três linhas de
 * texto e uma explicação por plataforma. Ficou pesado ao lado dos outros
 * cards e o número deixou de saltar. Aqui a regra é: uma linha, uma barra
 * fina, e o texto longo só no rodapé, uma vez.
 *
 * ⚠️ Cliente pagar o frete NÃO significa que a loja não pagou — a plataforma
 * cobra a entrega da loja e mostra à parte quanto dela a loja bancou. E na
 * Keeta a loja ainda leva uma taxa de distância em todo pedido, que o iFood e
 * a 99 não têm; ela aparece como custo extra na própria linha.
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
  const linhas = quemPaga.filter((q) => q.pedidos > 0)
  if (!linhas.length) return null

  // ⚠️ Na Keeta, deliveryFee.keeta é o frete que o CLIENTE pagou, não custo da
  // loja. O custo real dela é a taxa de distância (custoExtra).
  const custoDe = (q: QuemPagaEntrega) =>
    q.plataforma === "keeta"
      ? q.custoExtra
      : q.plataforma === "ifood"
        ? deliveryFee.ifood
        : deliveryFee.ninefood
  const total = linhas.reduce((s, q) => s + custoDe(q), 0)

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Bike className="size-4 text-amber-600" />
        <h3 className="text-sm font-semibold">Entrega — quem bancou</h3>
        <span className="ml-auto text-base font-bold tabular-nums text-rose-700 dark:text-rose-400">
          − {fmtBRL(total)}
        </span>
      </div>

      <div className="space-y-2.5">
        {linhas.map((q) => {
          const base = q.lojaBancou + q.clientePagou
          const pctLoja = base > 0 ? (q.lojaBancou / base) * 100 : 0
          const custo = custoDe(q)

          return (
            <div key={q.plataforma}>
              <div className="flex items-center gap-2 text-xs">
                <PlatformLogo platform={q.plataforma} size="sm" />
                <span className="tabular-nums">
                  <span className="font-semibold text-amber-700 dark:text-amber-400">
                    {fmtPct(pctLoja)}
                  </span>{" "}
                  <span className="text-muted-foreground">loja</span>
                </span>
                <span className="ml-auto tabular-nums text-muted-foreground">
                  {q.lojaBancou.toLocaleString("pt-BR")} de{" "}
                  {base.toLocaleString("pt-BR")}
                </span>
                {custo > 0 && (
                  <span className="w-24 text-right font-semibold tabular-nums text-rose-700 dark:text-rose-400">
                    − {fmtBRL(custo)}
                  </span>
                )}
              </div>
              <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-emerald-500/25">
                <div className="bg-amber-500" style={{ width: `${pctLoja}%` }} />
              </div>
              {q.custoExtraLabel && q.custoExtra > 0 && (
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  inclui {q.custoExtraLabel}, cobrada da loja em todo pedido
                </p>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        {fmtPct(bruto > 0 ? (total / bruto) * 100 : 0)} do bruto · já está dentro
        das taxas (no DRE acima). Em âmbar, a fatia de entregas que a{" "}
        <strong>loja bancou</strong>; o resto o cliente pagou.
      </p>
    </div>
  )
}
