import { Megaphone, Receipt, Ticket, Truck, Wallet } from "lucide-react"

import { getPagamentoResumoForMonth } from "@/lib/data/ifood-pedidos"
import type { UnitMonthly } from "@/lib/mock-monthly"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"

import { UnitCostsEditor } from "./unit-costs-editor"

/**
 * Aba Financeiro da loja — o DRE completo num lugar só (funde Receita +
 * Financeiro + Custos). Tudo derivado do `m` mesclado (3 plataformas), então
 * bate com o Hero. CMV/operação editáveis inline. Embaixo: descontos do
 * iFood, VR por bandeira, mix de pagamento e promoções (do relatório de
 * pedidos iFood).
 */
export async function FinanceiroLojaTab({
  unitId,
  monthly,
  year,
  month,
}: {
  unitId: string
  monthly: UnitMonthly
  year: number
  month: number
}) {
  const m = monthly
  const pagamento = await getPagamentoResumoForMonth(unitId, year, month)

  const bruto = m.faturamentoBruto
  const liquido = m.totalLiquido
  const taxas = Math.max(0, bruto - liquido)
  const cmv = m.custoProdutosCozina + (m.custoProdutosLoja ?? 0)
  const operacao = m.custoOperacao
  const margem = liquido - cmv
  const resultado = margem - operacao
  const margemPct = bruto > 0 ? (margem / bruto) * 100 : 0
  const resultadoPct = bruto > 0 ? (resultado / bruto) * 100 : 0

  const descontos = [
    { label: "Taxa de entrega", value: m.taxaEntregaIfood },
    { label: "Comissão + serviço", value: m.taxaComissaoIfood },
    { label: "Promoções (loja bancou)", value: m.promocoes },
    { label: "Serviços logísticos", value: m.servicosLogisticos },
    { label: "Outros / anúncios", value: m.outrosDescontosIfood },
  ].filter((d) => d.value > 0)

  return (
    <div className="space-y-4">
      {/* DRE da loja */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 shadow-sm lg:col-span-2">
          <div className="mb-3 flex items-center gap-2">
            <Wallet className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">DRE da loja · mês</h3>
          </div>
          <DreRow label="Faturamento bruto" value={fmtBRL(bruto)} bold />
          <DreRow
            label="(−) Taxas das plataformas"
            value={`− ${fmtBRL(taxas)}`}
            muted
          />
          <Divider />
          <DreRow
            label="= Líquido (entra na conta)"
            value={fmtBRL(liquido)}
            bold
            highlight
          />
          <DreRow
            label="(−) CMV (Cozina + Loja)"
            value={cmv > 0 ? `− ${fmtBRL(cmv)}` : "sem custo lançado"}
            muted
          />
          <Divider />
          <DreRow
            label="= Margem líquida"
            value={
              <span className="flex items-baseline gap-2">
                {fmtBRL(margem)}
                {cmv > 0 && (
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    ({fmtPct(margemPct)})
                  </span>
                )}
              </span>
            }
            bold
            highlight={operacao <= 0}
          />
          {operacao > 0 && (
            <>
              <DreRow
                label="(−) Custo da operação"
                value={`− ${fmtBRL(operacao)}`}
                muted
              />
              <Divider />
              <DreRow
                label="= Resultado operacional"
                value={
                  <span className="flex items-baseline gap-2">
                    {fmtBRL(resultado)}
                    <span
                      className={`text-xs font-semibold ${
                        resultado >= 0
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-rose-700 dark:text-rose-400"
                      }`}
                    >
                      ({fmtPct(resultadoPct)})
                    </span>
                  </span>
                }
                bold
                highlight
              />
            </>
          )}
        </div>

        {/* Custos editáveis */}
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold">Custos da loja</h3>
          <UnitCostsEditor
            unitId={unitId}
            year={year}
            month={month}
            cozina={m.custoProdutosCozina}
            operacao={operacao}
          />
          <p className="mt-3 text-[11px] text-muted-foreground">
            O bruto/líquido vêm dos relatórios; CMV e operação você lança aqui.
          </p>
        </div>
      </div>

      {/* Descontos das plataformas (detalhe iFood) */}
      {descontos.length > 0 && (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Receipt className="size-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">
              Para onde foram as taxas (iFood)
            </h3>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {descontos.map((d) => (
              <div
                key={d.label}
                className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
              >
                <span className="text-xs text-muted-foreground">{d.label}</span>
                <span className="text-sm font-semibold tabular-nums text-rose-700 dark:text-rose-400">
                  − {fmtBRL(d.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VR + mix + promoções (do relatório de pedidos iFood) */}
      {pagamento.hasData && (
        <div className="grid gap-4 lg:grid-cols-2">
          {pagamento.vrPedidos > 0 && (
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Ticket className="size-4 text-violet-600" />
                <h3 className="text-sm font-semibold">
                  Vale-Refeição por bandeira
                </h3>
              </div>
              {pagamento.porBandeira.map((b) => (
                <MiniRow
                  key={b.bandeira}
                  label={b.bandeira}
                  value={`${fmtBRL(b.valor)} · ${fmtNum(b.pedidos)} ped`}
                />
              ))}
              <p className="mt-2 text-[11px] text-muted-foreground">
                {fmtNum(pagamento.vrPedidos)} pedidos · {fmtBRL(pagamento.vrValor)}{" "}
                ({fmtPct(pagamento.vrPct)} do pago). Não entra no faturamento.
              </p>
            </div>
          )}
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Wallet className="size-4 text-muted-foreground" />
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
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Megaphone className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Promoções (quem bancou)</h3>
            </div>
            <MiniRow label="iFood" value={fmtBRL(pagamento.incentivoIfood)} />
            <MiniRow label="Loja" value={fmtBRL(pagamento.incentivoLoja)} />
            <MiniRow label="Rede" value={fmtBRL(pagamento.incentivoRede)} />
          </div>
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Truck className="size-4 text-muted-foreground" />
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
        </div>
      )}
    </div>
  )
}

function DreRow({
  label,
  value,
  bold,
  muted,
  highlight,
}: {
  label: string
  value: React.ReactNode
  bold?: boolean
  muted?: boolean
  highlight?: boolean
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-2 py-1.5 ${
        highlight ? "rounded-md bg-emerald-50 px-2 dark:bg-emerald-950/30" : ""
      }`}
    >
      <span
        className={`text-xs ${muted ? "text-muted-foreground" : ""} ${bold ? "font-semibold" : ""}`}
      >
        {label}
      </span>
      <span
        className={`text-sm tabular-nums ${
          highlight
            ? "font-bold text-emerald-700 dark:text-emerald-400"
            : bold
              ? "font-semibold"
              : ""
        } ${muted ? "text-muted-foreground" : ""}`}
      >
        {value}
      </span>
    </div>
  )
}

function Divider() {
  return <div className="my-2 h-px bg-border" />
}

function MiniRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1">
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <span className="shrink-0 text-xs font-medium tabular-nums">{value}</span>
    </div>
  )
}
