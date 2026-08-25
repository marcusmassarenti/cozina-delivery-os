/**
 * O que vem em cada pedido, e o que vem junto.
 *
 * ── A PERGUNTA QUE ISTO RESPONDE ─────────────────────────────────────────
 * "O que o cliente leva junto com o carro-chefe" não tem resposta em
 * relatório de plataforma nenhum: todos somam por DIA e perdem o pedido. Só a
 * comanda sabe — e ela só existe onde a plataforma manda o pedido inteiro.
 *
 * Hoje isso é 99 Food (comanda do webhook e da API) e Keeta (a coluna `itens`
 * do relatório de Pedidos recentes). O iFood NÃO entra: nem a API que temos
 * nem os relatórios dele ligam pedido a item — medido em 25/08/26, tabela por
 * tabela. Não é falta de implementação, é falta de fonte.
 *
 * Componente compartilhado porque a leitura é a mesma nas duas plataformas.
 * O que muda é só o que cada uma tem: a Keeta não manda complemento, então
 * esses números são opcionais em vez de virarem zero — zero afirmaria que o
 * cliente não pede complemento, que é outra coisa.
 */
import { Layers } from "lucide-react"

import { fmtNum, fmtPct } from "@/lib/format"

export type ComposicaoTicketProps = {
  pedidos: number
  itensPorPedido: number
  pctMultiItem: number
  /** Só o 99 tem: a Keeta não manda complemento no relatório de pedidos. */
  pctComComplemento?: number
  complementosPorPedido?: number
  pares: {
    base: string
    junto: string
    juntos: number
    pedidosBase: number
    pct: number
  }[]
}

export function ComposicaoTicket({ t }: { t: ComposicaoTicketProps }) {
  const temComplemento = t.pctComComplemento != null

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Layers className="size-4 text-muted-foreground" />
          Composição do ticket
        </h3>
        <span className="text-[10px] text-muted-foreground">
          {fmtNum(t.pedidos)} pedidos com comanda
        </span>
      </div>

      <div
        className={`grid gap-px bg-border ${
          temComplemento ? "sm:grid-cols-3" : "sm:grid-cols-3"
        }`}
      >
        <Numero
          label="Itens por pedido"
          valor={dec(t.itensPorPedido)}
          hint={`${fmtPct(t.pctMultiItem)} levam mais de um`}
        />
        {temComplemento ? (
          <Numero
            label="Pedidos com complemento"
            valor={fmtPct(t.pctComComplemento!)}
            hint={`${dec(t.complementosPorPedido ?? 0)} por pedido`}
          />
        ) : (
          <Numero
            label="Pedidos de um item só"
            valor={fmtPct(100 - t.pctMultiItem)}
            hint="sem acompanhamento nem bebida"
          />
        )}
        <Numero
          label="Pares que se repetem"
          valor={fmtNum(t.pares.length)}
          hint="combinações vistas 3+ vezes"
        />
      </div>

      {t.pares.length === 0 ? (
        <p className="px-4 py-5 text-center text-xs text-muted-foreground">
          Nenhuma combinação se repetiu o bastante no mês. Com quase todo pedido
          levando um item só, não há par pra contar — e isso já é a resposta.
        </p>
      ) : (
        <ul className="divide-y">
          {t.pares.map((p) => (
            <li
              key={`${p.base}|${p.junto}`}
              className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 px-4 py-2.5 text-xs"
            >
              <span className="text-muted-foreground">Quem leva</span>
              <span className="font-medium">{p.base}</span>
              <span className="text-muted-foreground">também leva</span>
              <span className="font-medium">{p.junto}</span>
              <span className="ml-auto shrink-0 tabular-nums">
                <span className="font-semibold">{fmtPct(p.pct)}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {fmtNum(p.juntos)} de {fmtNum(p.pedidosBase)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function dec(v: number): string {
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function Numero({
  label,
  valor,
  hint,
}: {
  label: string
  valor: string
  hint: string
}) {
  return (
    <div className="bg-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-bold tabular-nums tracking-tight">
        {valor}
      </p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>
    </div>
  )
}
