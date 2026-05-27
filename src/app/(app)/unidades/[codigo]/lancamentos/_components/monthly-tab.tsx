"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { Calculator, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { fmtBRL, fmtPct } from "@/lib/format"
import type { MonthlyEntry } from "@/lib/data/lancamentos"
import { saveMonthlyEntry, type ActionState } from "../_actions"

const initial: ActionState = { ok: false }

export type MonthlySummary = {
  totalPedidos: number
  totalCancelados: number
  totalFaturamento: number
}

export function MonthlyTab({
  unitId,
  year,
  month,
  daySummary,
  initial: initialData,
}: {
  unitId: string
  year: number
  month: number
  daySummary: MonthlySummary
  initial: MonthlyEntry
}) {
  const [state, formAction] = useActionState(saveMonthlyEntry, initial)
  const [m, setM] = React.useState<MonthlyEntry>(initialData)
  const router = useRouter()

  React.useEffect(() => {
    setM(initialData)
  }, [initialData])

  React.useEffect(() => {
    if (state.ok) {
      router.refresh()
    }
  }, [state, router])

  const update = <K extends keyof MonthlyEntry>(
    key: K,
    value: MonthlyEntry[K],
  ) => setM((prev) => ({ ...prev, [key]: value }))

  // Cálculos
  const totalTaxasIfood =
    m.taxaEntregaIfood +
    m.promocoes +
    m.taxaComissaoIfood +
    m.servicosLogisticos +
    m.outrosDescontosIfood

  const faturamentoLiquido = daySummary.totalFaturamento - totalTaxasIfood

  const totalLiquido =
    faturamentoLiquido +
    m.vrRecebido -
    m.vrTaxaMedia8 -
    m.cancelamentosReembolsos

  const totalCustos = m.custoProdutosCozina + m.custoProdutosLoja
  const margemLiquida = totalLiquido - totalCustos
  const margemLucroPct =
    daySummary.totalFaturamento > 0
      ? (margemLiquida / daySummary.totalFaturamento) * 100
      : 0

  const ticketMedio =
    daySummary.totalPedidos > 0
      ? daySummary.totalFaturamento / daySummary.totalPedidos
      : 0

  const pctCancelamento =
    daySummary.totalPedidos > 0
      ? (daySummary.totalCancelados / daySummary.totalPedidos) * 100
      : 0

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="unitId" value={unitId} />
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />

      {/* Volume + Avaliação */}
      <Section title="Volume do mês">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Calculated label="Pedidos Recebidos" value={String(daySummary.totalPedidos)} />
          <Calculated
            label="Pedidos Cancelados"
            value={`${daySummary.totalCancelados} (${fmtPct(pctCancelamento)})`}
          />
          <Calculated label="Ticket Médio" value={fmtBRL(ticketMedio)} />
          <Field label="Clientes Novos">
            <Input
              name="clientes_novos"
              type="number"
              min="0"
              step="1"
              value={m.clientesNovos === 0 ? "" : String(m.clientesNovos)}
              onChange={(e) =>
                update("clientesNovos", parseInt(e.target.value || "0", 10) || 0)
              }
              placeholder="0"
            />
          </Field>
        </div>
      </Section>

      {/* Receita */}
      <Section title="Receita do mês" tone="positive">
        <div className="grid gap-4 sm:grid-cols-3">
          <Calculated
            label="Faturamento Bruto"
            value={fmtBRL(daySummary.totalFaturamento)}
            highlight
          />
          <Calculated label="(−) Total descontos" value={fmtBRL(totalTaxasIfood)} muted />
          <Calculated
            label="= Faturamento Líquido"
            value={fmtBRL(faturamentoLiquido)}
            highlight
          />
        </div>
      </Section>

      {/* Taxas iFood */}
      <Section title="Taxas iFood (manual)" tone="negative">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CurrencyField
            label="Taxa Entrega Parceira"
            name="taxa_entrega_ifood"
            value={m.taxaEntregaIfood}
            onChange={(n) => update("taxaEntregaIfood", n)}
          />
          <CurrencyField
            label="Taxa de Comissão"
            name="taxa_comissao_ifood"
            value={m.taxaComissaoIfood}
            onChange={(n) => update("taxaComissaoIfood", n)}
          />
          <CurrencyField
            label="Serviços Logísticos"
            name="servicos_logisticos"
            value={m.servicosLogisticos}
            onChange={(n) => update("servicosLogisticos", n)}
          />
          <CurrencyField
            label="Promoções"
            name="promocoes"
            value={m.promocoes}
            onChange={(n) => update("promocoes", n)}
          />
          <CurrencyField
            label="Outros Descontos"
            name="outros_descontos_ifood"
            value={m.outrosDescontosIfood}
            onChange={(n) => update("outrosDescontosIfood", n)}
          />
          <Calculated
            label="Subtotal Taxas iFood"
            value={fmtBRL(totalTaxasIfood)}
            muted
          />
        </div>
      </Section>

      {/* Vale Refeição (VR) */}
      <Section title="Vale Refeição (VR)">
        <div className="grid gap-4 sm:grid-cols-3">
          <CurrencyField
            label="Total recebido via loja (VR)"
            name="vr_recebido"
            value={m.vrRecebido}
            onChange={(n) => update("vrRecebido", n)}
          />
          <CurrencyField
            label="(VR) − Taxa Média 8%"
            name="vr_taxa_media_8"
            value={m.vrTaxaMedia8}
            onChange={(n) => update("vrTaxaMedia8", n)}
          />
          <CurrencyField
            label="Cancelamentos/Reembolsos"
            name="cancelamentos_reembolsos"
            value={m.cancelamentosReembolsos}
            onChange={(n) => update("cancelamentosReembolsos", n)}
          />
        </div>
      </Section>

      {/* Custos */}
      <Section title="Custos da Indústria" tone="negative">
        <div className="grid gap-4 sm:grid-cols-3">
          <CurrencyField
            label="Custo Produtos Cozina"
            name="custo_produtos_cozina"
            value={m.custoProdutosCozina}
            onChange={(n) => update("custoProdutosCozina", n)}
          />
          <CurrencyField
            label="Custo Produtos Loja"
            name="custo_produtos_loja"
            value={m.custoProdutosLoja}
            onChange={(n) => update("custoProdutosLoja", n)}
          />
          <Calculated
            label="Subtotal Custos"
            value={fmtBRL(totalCustos)}
            muted
          />
        </div>
      </Section>

      {/* Resultado */}
      <Section title="Resultado do mês" tone="positive">
        <div className="grid gap-4 sm:grid-cols-4">
          <Calculated
            label="Total Líquido (entra na conta)"
            value={fmtBRL(totalLiquido)}
          />
          <Calculated
            label="Margem Líquida"
            value={fmtBRL(margemLiquida)}
            highlight
          />
          <Calculated
            label="Margem de Lucro"
            value={fmtPct(margemLucroPct)}
            highlight
          />
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Nota Média (estrelas)</Label>
            <Input
              name="nota_media"
              type="number"
              step="0.1"
              min="0"
              max="5"
              value={m.notaMedia === 0 ? "" : String(m.notaMedia)}
              onChange={(e) =>
                update("notaMedia", parseFloat(e.target.value || "0") || 0)
              }
              placeholder="4.7"
            />
          </div>
        </div>
      </Section>

      {/* Observações */}
      <Section title="Observações">
        <textarea
          name="observacoes"
          value={m.observacoes}
          onChange={(e) => update("observacoes", e.target.value)}
          placeholder="Anotações do mês — comentários, alertas, contexto…"
          rows={3}
          className="min-h-24 w-full resize-y rounded-md border bg-background p-3 text-sm outline-none focus:border-ring"
        />
      </Section>

      {state.message && !state.ok && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400">
          {state.message}
        </div>
      )}

      {state.ok && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400">
          ✓ Salvo com sucesso.
        </div>
      )}

      <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background py-3">
        <SubmitButton />
      </div>
    </form>
  )
}

function Section({
  title,
  children,
  tone,
}: {
  title: string
  children: React.ReactNode
  tone?: "positive" | "negative"
}) {
  const border =
    tone === "positive"
      ? "border-l-4 border-l-emerald-500"
      : tone === "negative"
        ? "border-l-4 border-l-rose-500"
        : ""
  return (
    <div className={`rounded-xl border bg-card p-5 ${border}`}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
    </div>
  )
}

function CurrencyField({
  label,
  name,
  value,
  onChange,
}: {
  label: string
  name: string
  value: number
  onChange: (n: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          R$
        </span>
        <Input
          name={name}
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={value === 0 ? "" : String(value)}
          onChange={(e) => onChange(parseFloat(e.target.value || "0") || 0)}
          placeholder="0,00"
          className="pl-8"
        />
      </div>
    </div>
  )
}

function Calculated({
  label,
  value,
  highlight,
  muted,
}: {
  label: string
  value: string
  highlight?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Calculator className="size-3 text-muted-foreground" />
        <Label className="text-xs font-medium text-muted-foreground">
          {label}
        </Label>
      </div>
      <div
        className={`rounded-md border bg-muted/30 px-3 py-2 text-sm font-semibold tabular-nums ${
          highlight
            ? "text-emerald-700 dark:text-emerald-400"
            : muted
              ? "text-muted-foreground"
              : ""
        }`}
      >
        {value}
      </div>
    </div>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      <Save className="mr-1.5 size-3.5" />
      {pending ? "Salvando..." : "Salvar mês"}
    </Button>
  )
}
