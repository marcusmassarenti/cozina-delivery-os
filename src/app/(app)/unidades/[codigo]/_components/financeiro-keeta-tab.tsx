/**
 * Financeiro (Keeta) — agregado mensal + lista diária.
 * Espelha o Financeiro99Tab. Agregados e quebra de despesas vêm dos pedidos
 * (keeta_pedidos); a série diária vem da Loja diária (keeta_daily_loja) com
 * o líquido enriquecido pelos pedidos.
 */
import {
  AlertTriangle,
  Bike,
  CheckCircle2,
  Clock,
  DollarSign,
  PiggyBank,
  Percent,
} from "lucide-react"

import { getKeetaFinanceiroForMonth } from "@/lib/data/keeta-imported"
import { getDeliveryFeeForMonth } from "@/lib/data/taxa-entrega"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"

export async function FinanceiroKeetaTab({
  unitId,
  year,
  month,
}: {
  unitId: string
  year: number
  month: number
}) {
  const [resumo, deliveryFee] = await Promise.all([
    getKeetaFinanceiroForMonth(unitId, year, month),
    getDeliveryFeeForMonth(unitId, year, month),
  ])

  if (!resumo.hasData) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        Nenhum dado financeiro do Keeta importado nesse mês.
        <br />
        Sobe o XLSX de &quot;Loja diária&quot; e &quot;Pedidos&quot; em{" "}
        <span className="font-medium">/importacao</span>.
      </div>
    )
  }

  const descontoPct =
    resumo.bruto > 0 ? (resumo.descontos / resumo.bruto) * 100 : 0

  return (
    <div className="space-y-4">
      {/* KPIs principais */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={<DollarSign className="size-4" />}
          label="Bruto"
          value={fmtBRL(resumo.bruto)}
          hint={`${fmtNum(resumo.pedidos)} pedidos · ${fmtNum(resumo.pedidosValidos)} válidos`}
        />
        <Kpi
          icon={<PiggyBank className="size-4" />}
          label="Líquido"
          value={fmtBRL(resumo.liquido)}
          hint={`${fmtPct(resumo.pctLoja)} de repasse`}
        />
        <Kpi
          icon={<Percent className="size-4" />}
          label="Descontos plataforma"
          value={fmtBRL(resumo.descontos)}
          hint={`${fmtPct(descontoPct)} do bruto`}
          tone="warn"
        />
        <Kpi
          icon={<Clock className="size-4" />}
          label="Tempo de preparo"
          value={
            resumo.tempoPreparoMedio != null
              ? `${Math.round(resumo.tempoPreparoMedio)} min`
              : "—"
          }
          hint={`Ticket médio ${fmtBRL(resumo.ticketMedio)}`}
        />
      </div>

      {/* Resultado + operação */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Resultado do mês">
          <Row label="Faturamento bruto" value={fmtBRL(resumo.bruto)} bold />
          <Row
            label="(−) Descontos da plataforma"
            value={`− ${fmtBRL(resumo.descontos)}`}
          />
          <Divider />
          <Row
            label="= Líquido (entra na conta)"
            value={fmtBRL(resumo.liquido)}
            bold
          />
          <p className="mt-2 text-[11px] text-muted-foreground">
            O Keeta reporta comissão, taxa de entrega e despesas da plataforma
            por pedido, mas com sobreposição entre as categorias. Por isso o
            desconto é calculado direto pela diferença bruto − líquido.
          </p>
        </Card>

        <Card title="Operação do mês">
          <Row
            label="Pedidos válidos"
            value={fmtNum(resumo.pedidosValidos)}
            icon={<CheckCircle2 className="size-3.5 text-emerald-600" />}
          />
          <Row
            label="Pedidos cancelados"
            value={fmtNum(resumo.cancelamentosQtd)}
            icon={
              resumo.cancelamentosQtd > 0 ? (
                <AlertTriangle className="size-3.5 text-amber-600" />
              ) : (
                <CheckCircle2 className="size-3.5 text-emerald-600" />
              )
            }
          />
          <Row
            label="Ticket médio"
            value={fmtBRL(resumo.ticketMedio)}
            icon={<DollarSign className="size-3.5 text-muted-foreground" />}
          />
          <Row
            label="Taxa de entrega"
            value={fmtBRL(deliveryFee.keeta)}
            icon={<Bike className="size-3.5 text-muted-foreground" />}
          />
          <Row
            label="Tempo médio de preparo"
            value={
              resumo.tempoPreparoMedio != null
                ? `${Math.round(resumo.tempoPreparoMedio)} min`
                : "—"
            }
            icon={<Clock className="size-3.5 text-muted-foreground" />}
          />
        </Card>
      </div>

      {/* Tabela diária */}
      {resumo.dias.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-2.5">
            <h3 className="text-sm font-semibold">Dia a dia (Keeta)</h3>
            <span className="text-[10px] text-muted-foreground">
              {resumo.dias.length} dia(s) importado(s)
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Data</th>
                  <th className="px-3 py-2 text-right font-semibold">Pedidos</th>
                  <th className="px-3 py-2 text-right font-semibold">Válidos</th>
                  <th className="px-3 py-2 text-right font-semibold">Bruto</th>
                  <th className="px-3 py-2 text-right font-semibold">Líquido</th>
                  <th className="px-3 py-2 text-right font-semibold">
                    Cancelados
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    Valor médio
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">Preparo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {resumo.dias.map((d) => (
                  <tr key={d.data} className="hover:bg-muted/30">
                    <td className="px-3 py-1.5 font-medium tabular-nums">
                      {new Date(d.data + "T00:00:00").toLocaleDateString(
                        "pt-BR",
                        { day: "2-digit", month: "short", weekday: "short" },
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {fmtNum(d.pedidos)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                      {fmtNum(d.pedidosValidos)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                      {fmtBRL(d.bruto)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {d.liquido > 0 ? fmtBRL(d.liquido) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                      {fmtNum(d.cancelados)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                      {fmtBRL(d.valorMedio)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                      {d.tempoPreparoMin != null
                        ? `${Math.round(d.tempoPreparoMin)} min`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
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
  tone?: "positive" | "warn"
}) {
  const valueColor =
    tone === "warn"
      ? "text-amber-700 dark:text-amber-400"
      : "text-foreground"
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        {icon}
      </div>
      <p className="mt-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={`mt-0.5 text-xl font-bold tracking-tight ${valueColor}`}>
        {value}
      </p>
      {hint && (
        <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

function Card({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="mt-3 flex flex-col">{children}</div>
    </div>
  )
}

function Row({
  label,
  value,
  bold,
  icon,
}: {
  label: string
  value: React.ReactNode
  bold?: boolean
  icon?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="inline-flex items-center gap-1.5 text-xs">
        {icon}
        {label}
      </span>
      <span
        className={`text-sm tabular-nums ${bold ? "font-bold" : "font-semibold"}`}
      >
        {value}
      </span>
    </div>
  )
}

function Divider() {
  return <div className="my-1 h-px bg-border" />
}
