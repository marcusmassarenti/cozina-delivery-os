import { Store } from "lucide-react"

import {
  CardCancelamento,
  CardDiaSemana,
  CardHorario,
  CardPagamento,
  CardTaxas,
  CardTipoPedido,
} from "@/components/cardapioweb/operacao-cards"
import { fmtBRL, fmtNum } from "@/lib/format"
import type { OperacaoCw } from "@/lib/data/cardapioweb-operacao"

/**
 * Aba Cardápio Web da tela de Pedidos.
 *
 * As abas de marketplace mostram VR, subsídio e comissão — coisas que só
 * existem quando há um intermediário. Canal próprio não tem nada disso, então
 * esta aba mostra o que só o hub da própria loja sabe: se o pedido foi entrega,
 * balcão ou mesa; a que horas; como foi pago; e por que cancelou.
 */
export function PedidosCardapiowebView({
  op,
  lojas,
}: {
  op: OperacaoCw
  /** Quantas lojas entraram no consolidado — pro cabeçalho não mentir. */
  lojas: number
}) {
  if (!op.temDados) {
    return (
      <div className="rounded-xl border border-dashed bg-card/50 p-8 text-center">
        <Store className="mx-auto mb-3 size-6 text-muted-foreground" />
        <p className="text-sm font-medium">
          Nenhum pedido do Cardápio Web no período.
        </p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Só entram aqui os pedidos do canal próprio — portal, catálogo digital,
          WhatsApp e totem. Pedido que veio de marketplace pelo hub já é contado
          na aba da plataforma dele.
        </p>
      </div>
    )
  }

  const ticket =
    op.total.pedidos > op.total.cancelados
      ? op.total.liquido / (op.total.pedidos - op.total.cancelados)
      : 0

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi rotulo="Pedidos" valor={fmtNum(op.total.pedidos)} />
        <Kpi rotulo="Faturamento" valor={fmtBRL(op.total.liquido)} />
        <Kpi rotulo="Ticket médio" valor={fmtBRL(ticket)} />
        <Kpi
          rotulo="Cancelados"
          valor={fmtNum(op.total.cancelados)}
          detalhe={
            op.total.pedidos > 0
              ? `${((op.total.cancelados / op.total.pedidos) * 100).toFixed(1)}% dos pedidos`
              : undefined
          }
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Consolidado de {fmtNum(lojas)} loja{lojas === 1 ? "" : "s"} com Cardápio
        Web conectado.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <CardTipoPedido op={op} />
        <CardHorario op={op} />
        <CardPagamento op={op} />
        <CardDiaSemana op={op} />
        <CardTaxas op={op} />
        <CardCancelamento op={op} />
      </div>
    </div>
  )
}

function Kpi({
  rotulo,
  valor,
  detalhe,
}: {
  rotulo: string
  valor: string
  detalhe?: string
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {rotulo}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{valor}</p>
      {detalhe && (
        <p className="mt-0.5 text-[11px] text-muted-foreground">{detalhe}</p>
      )}
    </div>
  )
}
