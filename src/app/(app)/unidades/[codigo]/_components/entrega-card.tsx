import { Bike } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { fmtBRL, fmtPct } from "@/lib/format"
import type {
  DeliveryFee,
  EntregaPropria,
  QuemPagaEntrega,
} from "@/lib/data/taxa-entrega"

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
  entregaPropria,
}: {
  deliveryFee: DeliveryFee
  quemPaga: QuemPagaEntrega[]
  bruto: number
  entregaPropria?: EntregaPropria | null
}) {
  const linhas = quemPaga.filter((q) => q.pedidos > 0)

  // Loja que entrega sozinha não tem custo de entrega no iFood — e isso é uma
  // RESPOSTA, não a ausência de uma. Antes o card sumia aqui e as duas coisas
  // ficavam idênticas na tela: "entrega própria" e "não puxou o dado".
  if (!linhas.length) {
    if (!entregaPropria) return null
    return (
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <Bike className="size-4 text-emerald-600" />
          <h3 className="text-sm font-semibold">Entrega — quem bancou</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Esta loja faz <strong>entrega própria</strong>: quem leva o pedido é a
          equipe dela, então o iFood não cobra taxa de entrega — não há custo de
          entrega a mostrar aqui.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          O iFood cobra uma comissão diferente nesse modelo:{" "}
          <strong className="text-rose-700 dark:text-rose-400">
            {fmtBRL(entregaPropria.comissao)}
          </strong>{" "}
          em {entregaPropria.pedidos.toLocaleString("pt-BR")} pedidos, já dentro
          das taxas no DRE acima. O custo dos seus entregadores não passa pela
          plataforma — ele entra pelos custos da operação.
        </p>
      </div>
    )
  }

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
          const custo = custoDe(q)
          // ⚠️ A barra é por VALOR, não por número de pedidos.
          //
          // Antes ela mostrava a fatia de PEDIDOS que a loja tocou (69,8% no
          // iFood) ao lado do VALOR que ela bancou (R$ 11.995) — e o valor era
          // menor que a sobra, o que parecia conta errada. Não era: a loja
          // subsidia PARTE da entrega em muitos pedidos. Misturar as duas
          // unidades na mesma linha é que estava errado.
          const pctLoja = custo > 0 ? (q.valorBancadoPelaLoja / custo) * 100 : 0

          return (
            <div key={q.plataforma}>
              <div className="flex items-center gap-2 text-xs">
                <PlatformLogo platform={q.plataforma} size="sm" />
                <span className="tabular-nums">
                  <span className="font-semibold text-amber-700 dark:text-amber-400">
                    {fmtPct(pctLoja)}
                  </span>{" "}
                  <span className="text-muted-foreground">do custo, a loja bancou</span>
                </span>
                {custo > 0 && (
                  <span className="ml-auto font-semibold tabular-nums text-rose-700 dark:text-rose-400">
                    − {fmtBRL(custo)}
                  </span>
                )}
              </div>
              <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-emerald-500/25">
                <div className="bg-amber-500" style={{ width: `${pctLoja}%` }} />
              </div>
              {/* Os dois lados em números, não só em porcentagem: "69,8%" não
                  diz quanto dinheiro o cliente cobriu, e é isso que dimensiona
                  o quanto a loja está segurando. */}
              <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-3 text-[10px] tabular-nums text-muted-foreground">
                <span>
                  {q.valorBancadoPelaLoja > 0 && (
                    <span className="text-amber-700 dark:text-amber-400">
                      {fmtBRL(q.valorBancadoPelaLoja)} de {fmtBRL(custo)} ·{" "}
                    </span>
                  )}
                  em {q.lojaBancou.toLocaleString("pt-BR")} de{" "}
                  {base.toLocaleString("pt-BR")} entregas
                </span>
                {/* Só a Keeta informa de verdade quanto o cliente pagou de
                    frete. No iFood e na 99, o que sobra do custo não é
                    "receita do cliente" — pode ser subsídio da própria
                    plataforma. Não se afirma o que não dá pra provar. */}
                {q.plataforma === "keeta" && q.valorPagoPeloCliente > 0 && (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    cliente pagou {fmtBRL(q.valorPagoPeloCliente)} de frete
                  </span>
                )}
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
        das taxas (no DRE acima). Em âmbar, quanto do <strong>custo</strong> da
        entrega a loja bancou como promoção — o resto vem do frete do cliente ou
        de subsídio da plataforma.
      </p>
    </div>
  )
}
