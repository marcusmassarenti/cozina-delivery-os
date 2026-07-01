import Link from "next/link"
import {
  BadgePercent,
  ChevronRight,
  Megaphone,
  Receipt,
  Tag,
  TrendingDown,
  XCircle,
} from "lucide-react"

import type {
  KeetaPedidoResumo,
  KeetaPedidoUnitRow,
} from "@/lib/data/keeta-pedidos"
import type { KeetaPromocaoResumo } from "@/lib/data/keeta-promocoes"
import { fmtBRL, fmtBRLShort, fmtNum, fmtPct } from "@/lib/format"

/**
 * Corpo da tela de Pedidos quando a plataforma é Keeta. A Keeta não tem
 * forma de pagamento/VR, então focamos no que ela traz: subsídio das
 * promoções (Keeta × loja), taxas granulares, mix de campanhas, turnos e
 * detalhe de cancelamento.
 */
export function PedidosKeetaView({
  resumo,
  porLoja,
  promocoes,
  periodoParam,
}: {
  resumo: KeetaPedidoResumo
  porLoja?: KeetaPedidoUnitRow[]
  promocoes?: KeetaPromocaoResumo
  periodoParam?: string
}) {
  const r = resumo
  const unitHref = (code: string) =>
    `/unidades/${code}${periodoParam ? `?periodo=${periodoParam}` : ""}`
  if (!r.hasData) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-10 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
          <Receipt className="size-6 text-muted-foreground" />
        </div>
        <p className="mt-4 text-sm font-medium">
          Sem &quot;Pedidos recentes&quot; da Keeta neste mês
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Sobe o relatório &quot;Pedidos recentes&quot; da Keeta em{" "}
          <a href="/importacao" className="underline">
            /importacao
          </a>{" "}
          pra ver subsídio, taxas e campanhas.
        </p>
      </div>
    )
  }
  return (
    <>
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={<Receipt className="size-4" />}
          label="Pedidos"
          value={fmtNum(r.totalPedidos)}
          hint={`${fmtBRLShort(r.valorPagoCliente)} pagos pelos clientes`}
        />
        <Kpi
          icon={<Tag className="size-4" />}
          label="Ticket médio"
          value={fmtBRL(r.ticketMedio)}
          hint={`${fmtNum(r.concluidos)} concluídos`}
        />
        <Kpi
          icon={<TrendingDown className="size-4" />}
          label="Desconto médio"
          value={`${fmtPct(r.descontoPct)}`}
          hint="sobre o preço de tabela"
          tone="promo"
        />
        <Kpi
          icon={<XCircle className="size-4" />}
          label="Cancelados"
          value={fmtNum(r.cancelados)}
          hint={
            r.totalPedidos > 0
              ? `${fmtPct((r.cancelados / r.totalPedidos) * 100)} dos pedidos`
              : "—"
          }
          tone={r.cancelados > 0 ? "rose" : undefined}
        />
      </div>

      {/* Subsídio das promoções (o destaque da Keeta) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <BadgePercent className="size-4 text-violet-600" />
            <h3 className="text-sm font-semibold">
              Subsídio das promoções (quem banca)
            </h3>
            <span className="ml-auto text-[10px] text-muted-foreground">
              R$ {fmtNum(Math.round(r.subsidioTotal))} no total
            </span>
          </div>
          <div className="space-y-2">
            <SubsidioRow
              label="Bancado pela Keeta"
              valor={r.promoKeeta}
              total={r.subsidioTotal}
              tone="violet"
            />
            <SubsidioRow
              label="Bancado pela loja"
              valor={r.promoLoja}
              total={r.subsidioTotal}
              tone="rose"
            />
            <div className="mt-2 flex items-center justify-between border-t pt-2 text-xs">
              <span className="text-muted-foreground">
                Preço de tabela (sem desconto)
              </span>
              <span className="tabular-nums font-medium">
                {fmtBRL(r.precoOriginal)}
              </span>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            O subsídio da loja é <strong>custo seu</strong>; o da Keeta é a
            plataforma bancando o desconto pra atrair pedido.
          </p>
        </div>

        {/* Taxas da Keeta */}
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Receipt className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Taxas da Keeta</h3>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {fmtBRL(r.taxasTotal)} no total
            </span>
          </div>
          <div className="space-y-1.5">
            <LinhaInfo
              label="Comissão básica"
              value={fmtBRL(r.comissaoBasica)}
              tone="rose"
            />
            <LinhaInfo
              label="Taxa de distância"
              value={fmtBRL(r.taxaDistancia)}
            />
            <LinhaInfo
              label="Taxa de pagamento online"
              value={fmtBRL(r.taxaPagamentoOnline)}
            />
            {r.taxaSaqueAntecipado > 0 && (
              <LinhaInfo
                label="Saque antecipado"
                value={fmtBRL(r.taxaSaqueAntecipado)}
              />
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Soma por pedido. O repasse oficial vem da loja diária (Resultado).
          </p>
        </div>
      </div>

      {/* Campanhas + Turnos + Cancelamento */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Megaphone className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Mix de campanhas</h3>
          </div>
          {r.campanhas.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Sem campanhas no período
            </p>
          ) : (
            <div className="space-y-1.5">
              {r.campanhas.map((c) => (
                <Barrinha
                  key={c.campanha}
                  label={c.campanha}
                  pedidos={c.pedidos}
                  total={r.totalPedidos}
                />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold">Por turno</h3>
          {r.porTurno.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">—</p>
          ) : (
            <div className="space-y-1.5">
              {r.porTurno.map((t) => (
                <Barrinha
                  key={t.turno}
                  label={t.turno}
                  pedidos={t.pedidos}
                  total={r.totalPedidos}
                />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h3 className="mb-3 text-sm font-semibold">Cancelamentos</h3>
          {r.cancelPorQuem.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Nenhum cancelamento
            </p>
          ) : (
            <div className="space-y-1.5">
              {r.cancelPorQuem.map((c) => (
                <LinhaInfo key={c.quem} label={c.quem} value={fmtNum(c.pedidos)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ROI por campanha (relatório "Dados da promoção") */}
      {promocoes && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
            <div className="flex items-center gap-2">
              <Megaphone className="size-4 text-violet-600" />
              <h3 className="text-sm font-semibold">ROI por campanha</h3>
            </div>
            {promocoes.hasData && (
              <span className="text-[10px] text-muted-foreground">
                {fmtNum(promocoes.totalPedidos)} pedidos ·{" "}
                {fmtBRL(promocoes.totalDespesa)} de custo ·{" "}
                {fmtBRL(promocoes.custoPorPedidoMedio)}/pedido
              </span>
            )}
          </div>
          {!promocoes.hasData ? (
            <p className="px-5 py-8 text-center text-xs text-muted-foreground">
              Sem &quot;Dados da promoção&quot; da Keeta neste mês. Sobe o
              relatório em{" "}
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
                      <th className="px-3 py-2 text-right font-medium">
                        Pedidos
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Vendas promo
                      </th>
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
                          <span
                            className="line-clamp-2 text-xs"
                            title={c.regra}
                          >
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
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {fmtBRL(c.vendasPromo)}
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
                        {fmtBRL(promocoes.totalVendasPromo)}
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
                Cada linha é uma regra de desconto.{" "}
                <strong>Custo/pedido</strong> = quanto a loja gastou pra cada
                pedido que a campanha trouxe — quanto menor, mais eficiente.
              </p>
            </>
          )}
        </div>
      )}

      {/* Vendas por loja (só no consolidado) */}
      {porLoja && porLoja.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <h3 className="text-sm font-semibold">
              Valor vendido por loja{" "}
              <span className="font-normal text-muted-foreground">
                ({porLoja.length})
              </span>
            </h3>
            <span className="text-[10px] text-muted-foreground">
              faturamento · valor pago e subsídio embaixo
            </span>
          </div>
          <div className="divide-y">
            {porLoja.map((u) => (
              <Link
                key={u.unitId}
                href={unitHref(u.unitCode)}
                className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/50"
              >
                <span className="inline-flex shrink-0 items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                  #{u.unitCode}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{u.unitName}</p>
                  <p className="text-[10px] tabular-nums text-muted-foreground">
                    pago {fmtBRLShort(u.valorPago)} · subsídio loja{" "}
                    {fmtBRLShort(u.promoLoja)}
                    {u.cancelados > 0 && ` · ${fmtNum(u.cancelados)} canc.`}
                  </p>
                </div>
                <div className="w-28 shrink-0 text-right">
                  <p className="text-sm font-bold tabular-nums">
                    {u.faturamento > 0 ? fmtBRL(u.faturamento) : "—"}
                  </p>
                  <p className="text-[10px] tabular-nums text-muted-foreground">
                    {fmtNum(u.pedidos)} pedidos
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Fonte: relatório &quot;Pedidos recentes&quot; da Keeta (subsídio, taxas
        e campanhas) + Loja diária (faturamento). O{" "}
        <strong>valor vendido</strong> é o faturamento (vendas de itens, igual à
        unidade); o <strong>valor pago</strong> é o que o cliente desembolsou,
        já abatido o desconto.
      </p>
    </>
  )
}

function Kpi({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  tone?: "promo" | "rose"
}) {
  const box =
    tone === "promo"
      ? "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400"
      : tone === "rose"
        ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
        : "bg-accent text-accent-foreground"
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-lg ${box}`}
      >
        {icon}
      </div>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function SubsidioRow({
  label,
  valor,
  total,
  tone,
}: {
  label: string
  valor: number
  total: number
  tone: "violet" | "rose"
}) {
  const pct = total > 0 ? (valor / total) * 100 : 0
  const bar = tone === "violet" ? "bg-violet-500" : "bg-rose-500"
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 truncate text-xs font-medium">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${bar}`} style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      <span className="w-28 text-right text-xs tabular-nums">
        <span className="font-semibold">{fmtBRL(valor)}</span>
        <span className="ml-1 text-[10px] text-muted-foreground">
          ({pct.toFixed(0)}%)
        </span>
      </span>
    </div>
  )
}

function LinhaInfo({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: "rose"
}) {
  const color =
    tone === "rose" ? "text-rose-700 dark:text-rose-400" : "text-foreground"
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${color}`}>
        {value}
      </span>
    </div>
  )
}

function Barrinha({
  label,
  pedidos,
  total,
}: {
  label: string
  pedidos: number
  total: number
}) {
  const pct = total > 0 ? (pedidos / total) * 100 : 0
  return (
    <div className="flex items-center gap-2">
      <span className="w-32 truncate text-xs" title={label}>
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-emerald-500"
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
      <span className="w-16 text-right text-xs tabular-nums">
        <span className="font-semibold">{fmtNum(pedidos)}</span>
        <span className="ml-1 text-[10px] text-muted-foreground">
          ({pct.toFixed(0)}%)
        </span>
      </span>
    </div>
  )
}
