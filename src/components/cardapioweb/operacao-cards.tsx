import {
  Bike,
  Clock,
  Wallet,
  Receipt,
  XCircle,
  CalendarDays,
} from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import {
  DIAS_SEMANA,
  ROTULO_PAGAMENTO,
  ROTULO_TIPO,
  type OperacaoCw,
} from "@/lib/data/cardapioweb-operacao"

/**
 * Cards do perfil da operação do Cardápio Web.
 *
 * Vivem aqui, e não dentro de uma tela, porque aparecem em DOIS lugares com o
 * mesmo desenho: na aba Cardápio Web de /pedidos (consolidado das lojas) e na
 * aba Financeiro da unidade (uma loja só). Escrever duas vezes é como a regra
 * de canal próprio acabou divergindo entre a tela e o consolidado.
 *
 * Cada card sai de tela quando não tem o que dizer: card zerado ocupa espaço e
 * ensina a ignorar a área.
 */

function Card({
  titulo,
  icone: Icone,
  children,
  rodape,
}: {
  titulo: string
  icone: typeof Bike
  children: React.ReactNode
  rodape?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icone className="size-4 text-muted-foreground" />
          {titulo}
        </h3>
        <PlatformLogo platform="cardapioweb" size="sm" />
      </div>
      {children}
      {rodape && (
        <p className="mt-3 border-t pt-2 text-[11px] text-muted-foreground">
          {rodape}
        </p>
      )}
    </div>
  )
}

function Barra({
  label,
  pedidos,
  total,
  valor,
}: {
  label: string
  pedidos: number
  total: number
  valor?: number
}) {
  const pct = total > 0 ? (pedidos / total) * 100 : 0
  return (
    <div className="flex items-center gap-2">
      <span className="w-36 truncate text-xs" title={label}>
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-emerald-500"
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
      <span className="w-28 text-right text-xs tabular-nums">
        {valor !== undefined && (
          <span className="font-semibold">{fmtBRL(valor)}</span>
        )}
        <span className="ml-1 text-[10px] text-muted-foreground">
          {fmtNum(pedidos)} ped · {pct.toFixed(0)}%
        </span>
      </span>
    </div>
  )
}

function Linha({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "emerald" | "rose"
}) {
  const cor =
    tone === "emerald"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "rose"
        ? "text-rose-700 dark:text-rose-400"
        : "text-foreground"
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${cor}`}>
        {value}
      </span>
    </div>
  )
}

/**
 * Como a loja vende: delivery, retirada, mesa ou consumo no local.
 *
 * É o corte que nenhum marketplace consegue dar, e o que mais engana quando
 * falta: numa loja com salão, metade do faturamento não passa por entrega — e
 * o ticket médio de mesa não tem nada a ver com o de delivery.
 */
export function CardTipoPedido({ op }: { op: OperacaoCw }) {
  if (op.tipo.length === 0) return null
  const total = op.tipo.reduce((s, t) => s + t.pedidos, 0)
  const ordenado = [...op.tipo].sort((a, b) => b.valorTotal - a.valorTotal)
  const entrega = op.tipo.find((t) => t.valor === "delivery")
  const foraDaEntrega = total - (entrega?.pedidos ?? 0)

  return (
    <Card titulo="Como a loja vende" icone={Bike}>
      <div className="space-y-1.5">
        {ordenado.map((t) => (
          <Barra
            key={t.valor}
            label={ROTULO_TIPO[t.valor] ?? t.valor}
            pedidos={t.pedidos}
            total={total}
            valor={t.valorTotal}
          />
        ))}
      </div>
      {foraDaEntrega > 0 && (
        <p className="mt-3 border-t pt-2 text-[11px] text-muted-foreground">
          <b className="text-foreground">
            {fmtPct((foraDaEntrega / total) * 100)}
          </b>{" "}
          dos pedidos não passam por entrega — são balcão, mesa ou consumo no
          local.
        </p>
      )}
    </Card>
  )
}

/** Faixas do dia. Nomes de operação de loja, não de relatório. */
const TURNOS: { nome: string; de: number; ate: number }[] = [
  { nome: "Madrugada", de: 0, ate: 5 },
  { nome: "Manhã", de: 6, ate: 10 },
  { nome: "Almoço", de: 11, ate: 14 },
  { nome: "Tarde", de: 15, ate: 17 },
  { nome: "Noite", de: 18, ate: 23 },
]

/**
 * Quando a loja vende — turno e horário de pico.
 *
 * O card equivalente do iFood existe mas vem vazio (a API deles não abre a
 * hora do pedido). Aqui a hora é exata, porque o pedido nasceu no hub da loja.
 */
export function CardHorario({ op }: { op: OperacaoCw }) {
  if (op.hora.length === 0) return null
  const total = op.hora.reduce((s, h) => s + h.pedidos, 0)

  const porTurno = TURNOS.map((t) => {
    const linhas = op.hora.filter((h) => {
      const hora = Number(h.valor)
      return hora >= t.de && hora <= t.ate
    })
    return {
      nome: t.nome,
      pedidos: linhas.reduce((s, l) => s + l.pedidos, 0),
      valor: linhas.reduce((s, l) => s + l.valorTotal, 0),
    }
  }).filter((t) => t.pedidos > 0)

  const pico = [...op.hora].sort((a, b) => b.pedidos - a.pedidos)[0]

  return (
    <Card
      titulo="Quando a loja vende"
      icone={Clock}
      rodape={
        pico ? (
          <>
            Horário de pico:{" "}
            <b className="text-foreground">{String(pico.valor).padStart(2, "0")}h</b>{" "}
            com {fmtNum(pico.pedidos)} pedidos.
          </>
        ) : undefined
      }
    >
      <div className="space-y-1.5">
        {porTurno.map((t) => (
          <Barra
            key={t.nome}
            label={t.nome}
            pedidos={t.pedidos}
            total={total}
            valor={t.valor}
          />
        ))}
      </div>
    </Card>
  )
}

/** Dia da semana — escala de equipe e compra de insumo. */
export function CardDiaSemana({ op }: { op: OperacaoCw }) {
  if (op.diaSemana.length === 0) return null
  const total = op.diaSemana.reduce((s, d) => s + d.pedidos, 0)
  const ordenado = [...op.diaSemana].sort(
    (a, b) => Number(a.valor) - Number(b.valor),
  )
  const melhor = [...op.diaSemana].sort((a, b) => b.pedidos - a.pedidos)[0]

  return (
    <Card
      titulo="Dia da semana"
      icone={CalendarDays}
      rodape={
        melhor ? (
          <>
            Dia mais forte:{" "}
            <b className="text-foreground">
              {DIAS_SEMANA[Number(melhor.valor)] ?? "—"}
            </b>
            .
          </>
        ) : undefined
      }
    >
      <div className="space-y-1.5">
        {ordenado.map((d) => (
          <Barra
            key={d.valor}
            label={DIAS_SEMANA[Number(d.valor)] ?? String(d.valor)}
            pedidos={d.pedidos}
            total={total}
            valor={d.valorTotal}
          />
        ))}
      </div>
    </Card>
  )
}

/**
 * Mix de pagamento REAL, pedido a pedido.
 *
 * Separa quem paga na hora (offline: dinheiro, Pix, maquininha na entrega) de
 * quem paga antes (online). Não é estatística: é a diferença entre dinheiro no
 * caixa hoje e dinheiro que chega depois.
 */
export function CardPagamento({ op }: { op: OperacaoCw }) {
  if (op.pagamento.length === 0) return null

  // Agrupa por método: a mesma forma aparece repetida por bandeira, e o
  // lojista quer saber "quanto foi em Pix", não "quanto foi em Pix Visa".
  const porMetodo = new Map<string, { pedidos: number; valor: number }>()
  for (const p of op.pagamento) {
    const a = porMetodo.get(p.metodo) ?? { pedidos: 0, valor: 0 }
    a.pedidos += p.pedidos
    a.valor += p.valorTotal
    porMetodo.set(p.metodo, a)
  }
  const linhas = [...porMetodo.entries()].sort((a, b) => b[1].valor - a[1].valor)
  const total = linhas.reduce((s, [, v]) => s + v.valor, 0)

  const naHora = op.pagamento
    .filter((p) => p.tipo === "offline")
    .reduce((s, p) => s + p.valorTotal, 0)

  return (
    <Card
      titulo="Mix de pagamento"
      icone={Wallet}
      rodape={
        total > 0 ? (
          <>
            <b className="text-foreground">{fmtPct((naHora / total) * 100)}</b>{" "}
            é pago na hora (dinheiro, Pix ou maquininha) — o resto entra depois.
          </>
        ) : undefined
      }
    >
      <div className="space-y-1.5">
        {linhas.map(([metodo, v]) => (
          <Barra
            key={metodo}
            label={ROTULO_PAGAMENTO[metodo] ?? metodo}
            pedidos={v.pedidos}
            total={linhas.reduce((s, [, x]) => s + x.pedidos, 0)}
            valor={v.valor}
          />
        ))}
      </div>
    </Card>
  )
}

/**
 * Taxas que ficavam embutidas no total sem ninguém separar.
 *
 * Entrega é receita da loja. Taxa de serviço (os 10%) é dinheiro do garçom e
 * NÃO é da loja — somá-la ao faturamento infla um número que nunca foi dela.
 */
export function CardTaxas({ op }: { op: OperacaoCw }) {
  const t = op.taxas
  if (t.entrega === 0 && t.servico === 0 && t.adicional === 0) return null

  return (
    <Card
      titulo="Taxas dentro do pedido"
      icone={Receipt}
      rodape="A taxa de serviço é do garçom, não da loja — está separada de propósito."
    >
      <div className="space-y-1.5">
        <Linha
          label={`Entrega cobrada do cliente (${fmtNum(t.pedidosComEntrega)} ped.)`}
          value={fmtBRL(t.entrega)}
          tone="emerald"
        />
        {t.servico > 0 && (
          <Linha
            label={`Taxa de serviço (${fmtNum(t.pedidosComServico)} ped.)`}
            value={fmtBRL(t.servico)}
          />
        )}
        {t.adicional > 0 && (
          <Linha label="Acréscimos" value={fmtBRL(t.adicional)} />
        )}
      </div>
    </Card>
  )
}

/**
 * Por que cancelou, em texto, direto do Cardápio Web.
 *
 * Contar cancelamento diz que existe problema; o motivo diz QUAL — e "sem
 * entregador" e "horário cadastrado errado" se resolvem no mesmo dia, se
 * alguém souber.
 */
export function CardCancelamento({ op }: { op: OperacaoCw }) {
  if (op.cancelamento.length === 0) return null
  const perdido = op.cancelamento.reduce((s, c) => s + c.valorTotal, 0)

  return (
    <Card
      titulo="Por que cancelaram"
      icone={XCircle}
      rodape={
        perdido > 0 ? (
          <>
            Cesta perdida:{" "}
            <b className="text-foreground">{fmtBRL(perdido)}</b> — o que o
            cliente chegou a montar e não virou venda.
          </>
        ) : undefined
      }
    >
      <div className="space-y-1.5">
        {op.cancelamento.map((c) => (
          <div
            key={c.motivo}
            className="flex items-baseline justify-between gap-2"
          >
            <span className="min-w-0 flex-1 truncate text-xs" title={c.motivo}>
              {c.motivo}
            </span>
            <span className="shrink-0 text-xs tabular-nums">
              <span className="font-semibold">{fmtNum(c.pedidos)}</span>
              {c.valorTotal > 0 && (
                <span className="ml-1.5 text-[10px] text-muted-foreground">
                  {fmtBRL(c.valorTotal)}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}
