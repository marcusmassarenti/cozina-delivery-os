/**
 * Financeiro (99 Food) — agregado mensal + lista diária.
 * Espelha o estilo do iFood mas mais enxuto: o XLSX do 99 Food já vem
 * agregado por dia, então não temos lançamentos individuais.
 */
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  PiggyBank,
  Percent,
  Star,
} from "lucide-react"

import {
  getNinefoodDiasForMonth,
  getNinefoodResumoForMonth,
} from "@/lib/data/ninefood-imported"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"

export async function Financeiro99Tab({
  unitId,
  year,
  month,
}: {
  unitId: string
  year: number
  month: number
}) {
  const [resumo, dias] = await Promise.all([
    getNinefoodResumoForMonth(unitId, year, month),
    getNinefoodDiasForMonth(unitId, year, month),
  ])

  if (!resumo.hasData) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        Nenhum dado financeiro do 99 Food importado nesse mês.
        <br />
        Sobe o XLSX de &quot;Dados da loja&quot; em{" "}
        <span className="font-medium">/importacao</span>.
      </div>
    )
  }

  const totalTaxas = resumo.comissaoRs + resumo.taxaCanalPagamentoRs
  const taxaSobreBruto =
    resumo.bruto > 0 ? (totalTaxas / resumo.bruto) * 100 : 0

  return (
    <div className="space-y-4">
      {/* KPIs principais */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={<DollarSign className="size-4" />}
          label="Bruto"
          value={fmtBRL(resumo.bruto)}
          hint={`${fmtNum(resumo.pedidos)} pedidos · ${resumo.diasComDados} dia(s)`}
        />
        <Kpi
          icon={<PiggyBank className="size-4" />}
          label="Líquido"
          value={fmtBRL(resumo.liquido)}
          hint={`${fmtPct(resumo.pctLoja)} de repasse`}
        />
        <Kpi
          icon={<Percent className="size-4" />}
          label="Comissão + Pgto"
          value={fmtBRL(totalTaxas)}
          hint={`${fmtPct(taxaSobreBruto)} do bruto`}
          tone="warn"
        />
        <Kpi
          icon={<Star className="size-4" />}
          label="Avaliação média"
          value={resumo.avaliacaoMedia != null ? `${resumo.avaliacaoMedia.toFixed(2)} ★` : "—"}
          hint={
            resumo.taxaAceitacaoMedia != null
              ? `TA ${fmtPct(resumo.taxaAceitacaoMedia)}`
              : ""
          }
        />
      </div>

      {/* Quebra de taxas + qualidade */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Quebra de taxas (mês)">
          <Row label="Despesas de comissão" value={fmtBRL(resumo.comissaoRs)} />
          <Row
            label="Taxa de canal de pagamento"
            value={fmtBRL(resumo.taxaCanalPagamentoRs)}
          />
          <Row
            label="Despesas de ofertas (promoção)"
            value={fmtBRL(resumo.promocoesRs)}
          />
          <Divider />
          <Row
            label="Total descontado do bruto"
            value={fmtBRL(totalTaxas + resumo.promocoesRs)}
            bold
          />
        </Card>

        <Card title="Qualidade da operação">
          <Row
            label="Taxa de Aceitação (TA)"
            value={
              resumo.taxaAceitacaoMedia != null
                ? fmtPct(resumo.taxaAceitacaoMedia)
                : "—"
            }
            icon={<CheckCircle2 className="size-3.5 text-emerald-600" />}
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
          <Row
            label="Cancelamentos do comerciante"
            value={fmtNum(resumo.cancelamentosQtd)}
            icon={
              resumo.cancelamentosQtd > 0 ? (
                <AlertTriangle className="size-3.5 text-amber-600" />
              ) : (
                <CheckCircle2 className="size-3.5 text-emerald-600" />
              )
            }
          />
        </Card>
      </div>

      {/* Tabela diária */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <h3 className="text-sm font-semibold">Dia a dia (99 Food)</h3>
          <span className="text-[10px] text-muted-foreground">
            {dias.length} dia(s) importado(s)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Data</th>
                <th className="px-3 py-2 text-right font-semibold">Pedidos</th>
                <th className="px-3 py-2 text-right font-semibold">Bruto</th>
                <th className="px-3 py-2 text-right font-semibold">Líquido</th>
                <th className="px-3 py-2 text-right font-semibold">Comissão</th>
                <th className="px-3 py-2 text-right font-semibold">Taxa pgto</th>
                <th className="px-3 py-2 text-right font-semibold">Avaliação</th>
                <th className="px-3 py-2 text-right font-semibold">TA</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {dias.map((d) => (
                <tr key={d.data} className="hover:bg-muted/30">
                  <td className="px-3 py-1.5 font-medium tabular-nums">
                    {new Date(d.data + "T00:00:00").toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      weekday: "short",
                    })}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {fmtNum(d.pedidos)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                    {fmtBRL(d.bruto)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {fmtBRL(d.liquido)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {fmtBRL(d.comissaoRs)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {fmtBRL(d.taxaCanalPagamentoRs)}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {d.avaliacaoLoja != null
                      ? `${d.avaliacaoLoja.toFixed(2)} ★`
                      : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {d.taxaAceitacaoPct != null
                      ? fmtPct(d.taxaAceitacaoPct)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
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
