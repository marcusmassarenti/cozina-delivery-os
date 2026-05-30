import {
  AlertTriangle,
  CircleDollarSign,
  Megaphone,
  PiggyBank,
  Receipt,
  Tag,
  Ticket,
  Truck,
  XCircle,
} from "lucide-react"

import {
  getCancelamentosPorMotivo,
  getFinanceiroResumoForMonth,
  listPedidosForMonth,
} from "@/lib/data/ifood-imported"
import { getPagamentoResumoForMonth } from "@/lib/data/ifood-pedidos"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"

export async function FinanceiroTab({
  unitId,
  year,
  month,
}: {
  unitId: string
  year: number
  month: number
}) {
  const [resumo, cancelMotivos, pedidos, pagamento] = await Promise.all([
    getFinanceiroResumoForMonth(unitId, year, month),
    getCancelamentosPorMotivo(unitId, year, month),
    listPedidosForMonth(unitId, year, month, { limit: 50 }),
    getPagamentoResumoForMonth(unitId, year, month),
  ])

  if (!resumo.hasData) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-10 text-center">
        <p className="text-sm font-medium">
          Sem Financeiro importado pra {String(month).padStart(2, "0")}/{year}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Sobe o Relatório de Conciliação do iFood em{" "}
          <a href="/importacao" className="underline">
            /importacao
          </a>
          .
        </p>
      </div>
    )
  }

  const totalTaxas =
    Math.abs(resumo.comissaoIfood) +
    Math.abs(resumo.taxaEntrega) +
    Math.abs(resumo.taxaTransacao) +
    Math.abs(resumo.taxaServicoCliente)
  const taxaPctBruto = resumo.bruto > 0 ? (totalTaxas / resumo.bruto) * 100 : 0

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={CircleDollarSign}
          label="Faturamento Bruto"
          value={fmtBRL(resumo.bruto)}
          hint={`${resumo.pedidosUnicos} pedidos`}
          tone="neutral"
        />
        <Kpi
          icon={PiggyBank}
          label="Líquido (impacto SIM)"
          value={fmtBRL(resumo.liquido)}
          hint={`${fmtPct(resumo.bruto > 0 ? (resumo.liquido / resumo.bruto) * 100 : 0)} do bruto`}
          tone="positive"
        />
        <Kpi
          icon={Receipt}
          label="Total taxas iFood"
          value={fmtBRL(-totalTaxas)}
          hint={`${fmtPct(taxaPctBruto)} do bruto`}
          tone="negative"
        />
        <Kpi
          icon={XCircle}
          label="Cancelamentos"
          value={`${resumo.cancelamentoTotalQtd} totais`}
          hint={`${resumo.cancelamentoParcialQtd} parciais · ${fmtBRL(resumo.perdaCancelamento)}`}
          tone="negative"
        />
      </div>

      {/* Quebra de taxas + Promoções */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="border-b px-5 py-3">
            <h3 className="text-sm font-semibold">Quebra de taxas iFood</h3>
            <p className="text-[11px] text-muted-foreground">
              Negativos = saem do seu repasse
            </p>
          </div>
          <div className="divide-y">
            <FinRow
              icon={Receipt}
              label="Comissão iFood"
              value={resumo.comissaoIfood}
              bruto={resumo.bruto}
            />
            <FinRow
              icon={Truck}
              label="Taxa de entrega"
              value={resumo.taxaEntrega}
              bruto={resumo.bruto}
            />
            <FinRow
              icon={CircleDollarSign}
              label="Taxa de transação"
              value={resumo.taxaTransacao}
              bruto={resumo.bruto}
            />
            <FinRow
              icon={Tag}
              label="Taxa serviço cliente"
              value={resumo.taxaServicoCliente}
              bruto={resumo.bruto}
            />
            <FinRow
              icon={Megaphone}
              label="Pacote de anúncios"
              value={resumo.pacoteAnuncios}
              bruto={resumo.bruto}
            />
          </div>
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="border-b px-5 py-3">
            <h3 className="text-sm font-semibold">Promoções</h3>
            <p className="text-[11px] text-muted-foreground">
              Quem bancou cada desconto
            </p>
          </div>
          <div className="divide-y">
            <FinRow
              icon={Tag}
              label="Promoção custeada pela LOJA"
              value={resumo.promocaoLoja}
              bruto={resumo.bruto}
              negativeTone
            />
            <FinRow
              icon={Tag}
              label="Promoção custeada pelo iFood"
              value={resumo.promocaoIfood}
              bruto={resumo.bruto}
              positiveTone
              hint="Subsídio do iFood (não custou a você)"
            />
            <FinRow
              icon={PiggyBank}
              label="Ressarcimentos"
              value={resumo.ressarcimentos}
              bruto={resumo.bruto}
              positiveTone
              hint="iFood devolvendo valores"
            />
          </div>
        </div>
      </div>

      {/* Cancelamentos por motivo */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="border-b px-5 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-600" />
            <h3 className="text-sm font-semibold">Cancelamentos por motivo</h3>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Foco aqui pra reduzir perda
          </p>
        </div>
        {cancelMotivos.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Nenhum cancelamento registrado
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Motivo</th>
                <th className="px-4 py-2 text-right font-medium">Pedidos</th>
                <th className="px-4 py-2 text-right font-medium">
                  Perda financeira
                </th>
              </tr>
            </thead>
            <tbody>
              {cancelMotivos.map((m) => (
                <tr key={m.motivo} className="border-t">
                  <td className="px-4 py-2.5">
                    <p className="text-xs font-medium">{m.motivo}</p>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums">
                    {fmtNum(m.pedidos)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums text-rose-700 dark:text-rose-400">
                    {fmtBRL(m.perdaFinanceira)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pedidos (drill-down preview) */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold">Últimos pedidos</h3>
            <p className="text-[11px] text-muted-foreground">
              Mostrando os 50 mais recentes
            </p>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Total no mês: <strong>{resumo.pedidosUnicos}</strong>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">#</th>
                <th className="px-4 py-2 text-left font-medium">Data</th>
                <th className="px-4 py-2 text-right font-medium">Bruto</th>
                <th className="px-4 py-2 text-right font-medium">Comissão</th>
                <th className="px-4 py-2 text-right font-medium">Entrega</th>
                <th className="px-4 py-2 text-right font-medium">Promo loja</th>
                <th className="px-4 py-2 text-right font-medium">Líquido</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.pedidoIfood} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2 text-[11px] font-mono text-muted-foreground">
                    {p.pedidoCurto ?? p.pedidoIfood.slice(0, 8)}
                  </td>
                  <td className="px-4 py-2 text-[11px] text-muted-foreground tabular-nums">
                    {p.dataCriacao
                      ? new Date(p.dataCriacao).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZone: "America/Sao_Paulo",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-right text-xs font-semibold tabular-nums">
                    {fmtBRL(p.bruto)}
                  </td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums text-rose-600">
                    {fmtBRL(p.comissao)}
                  </td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums text-rose-600">
                    {fmtBRL(p.taxaEntrega)}
                  </td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums text-amber-700">
                    {fmtBRL(p.promocaoLoja)}
                  </td>
                  <td className="px-4 py-2 text-right text-xs font-semibold tabular-nums">
                    {fmtBRL(p.liquido)}
                  </td>
                  <td className="px-4 py-2">
                    {p.cancelado ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-950/30 dark:text-rose-400">
                        <XCircle className="size-3" />
                        Cancelado
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                        OK
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vale-Refeição por bandeira (do relatório de pedidos iFood) */}
      {pagamento.hasData && pagamento.vrPedidos > 0 && (
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Ticket className="size-4 text-violet-600" />
            <h3 className="text-sm font-semibold">Vale-Refeição por bandeira</h3>
            <a
              href="/pedidos"
              className="ml-auto text-[11px] text-muted-foreground underline"
            >
              ver em Pedidos
            </a>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pagamento.porBandeira.map((b) => (
              <div
                key={b.bandeira}
                className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
              >
                <span className="text-xs font-medium">{b.bandeira}</span>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums">
                    {fmtBRL(b.valor)}
                  </p>
                  <p className="text-[10px] tabular-nums text-muted-foreground">
                    {fmtNum(b.pedidos)} ped
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {fmtNum(pagamento.vrPedidos)} pedidos em VR ·{" "}
            {fmtBRL(pagamento.vrValor)} ({fmtPct(pagamento.vrPct)} do total pago).
            Não entra no faturamento.
          </p>
        </div>
      )}

      {/* Operação do mês — do relatório de pedidos iFood (mix, turnos, etc.) */}
      {pagamento.hasData && pagamento.totalPedidos > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <CircleDollarSign className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Mix de pagamento</h3>
            </div>
            {pagamento.mix.map((mx) => {
              const pct =
                pagamento.totalValor > 0
                  ? (mx.valor / pagamento.totalValor) * 100
                  : 0
              return (
                <MiniRow
                  key={mx.grupo}
                  label={mx.grupo}
                  value={`${fmtBRL(mx.valor)} · ${pct.toFixed(0)}%`}
                />
              )
            })}
          </div>

          <div className="rounded-xl border bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Megaphone className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Promoções (quem bancou)</h3>
            </div>
            <MiniRow label="iFood" value={fmtBRL(pagamento.incentivoIfood)} />
            <MiniRow label="Loja" value={fmtBRL(pagamento.incentivoLoja)} />
            <MiniRow label="Rede" value={fmtBRL(pagamento.incentivoRede)} />
          </div>

          <div className="rounded-xl border bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Receipt className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Por turno</h3>
            </div>
            {pagamento.porTurno.map((tn) => (
              <MiniRow
                key={tn.chave}
                label={tn.chave}
                value={`${fmtNum(tn.pedidos)} ped`}
              />
            ))}
          </div>

          <div className="rounded-xl border bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Truck className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Logística de entrega</h3>
            </div>
            {pagamento.porEntrega.map((en) => (
              <MiniRow
                key={en.chave}
                label={en.chave}
                value={`${fmtNum(en.pedidos)} ped`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1">
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <span className="shrink-0 text-xs font-medium tabular-nums">{value}</span>
    </div>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  hint: string
  tone: "neutral" | "positive" | "negative"
}) {
  const accent =
    tone === "positive"
      ? "border-l-4 border-l-emerald-500"
      : tone === "negative"
        ? "border-l-4 border-l-rose-500"
        : ""
  return (
    <div className={`rounded-xl border bg-card p-4 shadow-sm ${accent}`}>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Icon className="size-4" />
      </div>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}

function FinRow({
  icon: Icon,
  label,
  value,
  bruto,
  positiveTone,
  negativeTone,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  bruto: number
  positiveTone?: boolean
  negativeTone?: boolean
  hint?: string
}) {
  const pct = bruto > 0 ? (Math.abs(value) / bruto) * 100 : 0
  const isPositive = value > 0
  const colorClass = positiveTone
    ? "text-emerald-700 dark:text-emerald-400"
    : negativeTone || (!positiveTone && !isPositive)
      ? "text-rose-700 dark:text-rose-400"
      : ""
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{label}</p>
        {hint && (
          <p className="text-[10px] text-muted-foreground">{hint}</p>
        )}
      </div>
      <div className="text-right">
        <p className={`text-sm font-semibold tabular-nums ${colorClass}`}>
          {fmtBRL(value)}
        </p>
        {pct > 0 && (
          <p className="text-[10px] text-muted-foreground tabular-nums">
            {fmtPct(pct)} do bruto
          </p>
        )}
      </div>
    </div>
  )
}
