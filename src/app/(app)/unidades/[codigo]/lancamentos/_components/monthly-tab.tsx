"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import { Calculator, Save } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type {
  MonthlyGeneral,
  PlatformEntry,
  PlatformSummary,
} from "@/lib/data/lancamentos"
import { fmtBRL, fmtPct } from "@/lib/format"
import { PlatformKpis } from "./platform-kpis"
import { saveMonthlyEntry, type ActionState } from "../_actions"

const initial: ActionState = { ok: false }

const PLATFORMS: { id: PlatformId; label: string }[] = [
  { id: "ifood", label: "iFood" },
  { id: "99food", label: "99 Food" },
  { id: "keeta", label: "Keeta" },
]

const VR_TAXA = 0.08

type PlatformInputs = Record<PlatformId, PlatformEntry>

export function MonthlyTab({
  unitId,
  year,
  month,
  daySummary,
  initial: initialGeneral,
  platformEntries: initialPlatformEntries,
  unitActivePlatforms,
}: {
  unitId: string
  year: number
  month: number
  daySummary: Record<PlatformId, PlatformSummary>
  initial: MonthlyGeneral
  platformEntries: PlatformInputs
  unitActivePlatforms: PlatformId[]
}) {
  const [state, formAction] = useActionState(saveMonthlyEntry, initial)
  const [general, setGeneral] = React.useState<MonthlyGeneral>(initialGeneral)
  const [platforms, setPlatforms] = React.useState<PlatformInputs>(
    initialPlatformEntries,
  )
  const router = useRouter()

  React.useEffect(() => {
    setGeneral(initialGeneral)
  }, [initialGeneral])
  React.useEffect(() => {
    setPlatforms(initialPlatformEntries)
  }, [initialPlatformEntries])

  React.useEffect(() => {
    if (state.ok) router.refresh()
  }, [state, router])

  const updateGeneral = <K extends keyof MonthlyGeneral>(
    key: K,
    value: MonthlyGeneral[K],
  ) => setGeneral((p) => ({ ...p, [key]: value }))

  const updatePlatform = (
    pid: PlatformId,
    key: keyof PlatformEntry,
    value: number,
  ) =>
    setPlatforms((p) => ({
      ...p,
      [pid]: { ...p[pid], [key]: value },
    }))

  // Cálculos por plataforma
  const platformCalcs = PLATFORMS.reduce(
    (acc, p) => {
      const inputs = platforms[p.id]
      const summary = daySummary[p.id]
      const totalTaxas =
        inputs.taxaEntrega +
        inputs.promocoes +
        inputs.taxaComissao +
        inputs.servicosLogisticos +
        inputs.outrosDescontos
      const faturamentoLiquido = summary.faturamento - totalTaxas
      const vrTaxa = inputs.vrRecebido * VR_TAXA
      const vrLiquido = inputs.vrRecebido - vrTaxa
      const totalRecebido =
        faturamentoLiquido + vrLiquido + inputs.cancelamentosReembolsos
      acc[p.id] = {
        totalTaxas,
        faturamentoLiquido,
        vrTaxa,
        vrLiquido,
        totalRecebido,
      }
      return acc
    },
    {} as Record<
      PlatformId,
      {
        totalTaxas: number
        faturamentoLiquido: number
        vrTaxa: number
        vrLiquido: number
        totalRecebido: number
      }
    >,
  )

  // Totais gerais
  const totalFaturamentoBruto = PLATFORMS.reduce(
    (acc, p) => acc + daySummary[p.id].faturamento,
    0,
  )
  const totalTaxas = PLATFORMS.reduce(
    (acc, p) => acc + platformCalcs[p.id].totalTaxas,
    0,
  )
  const totalFaturamentoLiquido = totalFaturamentoBruto - totalTaxas
  const totalRecebidoLoja = PLATFORMS.reduce(
    (acc, p) => acc + platformCalcs[p.id].totalRecebido,
    0,
  )
  const totalCustos = general.custoProdutosCozina + general.custoProdutosLoja
  const margemLiquida = totalRecebidoLoja - totalCustos
  const margemLucroPct =
    totalFaturamentoBruto > 0
      ? (margemLiquida / totalFaturamentoBruto) * 100
      : 0

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="unitId" value={unitId} />
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />

      {/* KPIs por plataforma (read-only, do diário) */}
      <Section title="Volume por plataforma (do diário)">
        <PlatformKpis summary={daySummary} />
      </Section>

      {/* Por plataforma: taxas + VR + cancelamentos */}
      {PLATFORMS.map((p) => {
        const isActive = unitActivePlatforms.includes(p.id)
        const inputs = platforms[p.id]
        const calcs = platformCalcs[p.id]
        const summary = daySummary[p.id]
        return (
          <div
            key={p.id}
            className={`rounded-xl border bg-card p-5 ${
              isActive ? "" : "opacity-70"
            }`}
          >
            <div className="flex items-center justify-between gap-3 border-b pb-3">
              <div className="flex items-center gap-2.5">
                <PlatformLogo platform={p.id} size="md" />
                <h3 className="text-sm font-semibold">{p.label}</h3>
                {!isActive && (
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                    inativa
                  </span>
                )}
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Faturamento (diário)
                </p>
                <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {fmtBRL(summary.faturamento)}
                </p>
              </div>
            </div>

            {/* Taxas */}
            <div className="mt-4">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                Taxas e Descontos (manual)
              </h4>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <CurrencyField
                  label="Taxa Entrega"
                  name={`${p.id}_taxa_entrega`}
                  value={inputs.taxaEntrega}
                  onChange={(n) => updatePlatform(p.id, "taxaEntrega", n)}
                />
                <CurrencyField
                  label="Taxa de Comissão"
                  name={`${p.id}_taxa_comissao`}
                  value={inputs.taxaComissao}
                  onChange={(n) => updatePlatform(p.id, "taxaComissao", n)}
                />
                <CurrencyField
                  label="Serviços Logísticos"
                  name={`${p.id}_servicos_logisticos`}
                  value={inputs.servicosLogisticos}
                  onChange={(n) =>
                    updatePlatform(p.id, "servicosLogisticos", n)
                  }
                />
                <CurrencyField
                  label="Promoções"
                  name={`${p.id}_promocoes`}
                  value={inputs.promocoes}
                  onChange={(n) => updatePlatform(p.id, "promocoes", n)}
                />
                <CurrencyField
                  label="Outros Descontos"
                  name={`${p.id}_outros_descontos`}
                  value={inputs.outrosDescontos}
                  onChange={(n) => updatePlatform(p.id, "outrosDescontos", n)}
                />
                <Calculated
                  label="Subtotal Taxas"
                  value={fmtBRL(calcs.totalTaxas)}
                  muted
                />
              </div>
            </div>

            {/* VR + Cancelamentos */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CurrencyField
                label="VR Recebido"
                name={`${p.id}_vr_recebido`}
                value={inputs.vrRecebido}
                onChange={(n) => updatePlatform(p.id, "vrRecebido", n)}
              />
              <Calculated
                label="VR Taxa 8% (auto)"
                value={fmtBRL(calcs.vrTaxa)}
                muted
              />
              <Calculated
                label="VR Líquido"
                value={fmtBRL(calcs.vrLiquido)}
                highlight
              />
              <CurrencyField
                label="Cancelamentos/Reembolsos (+)"
                name={`${p.id}_cancelamentos_reembolsos`}
                value={inputs.cancelamentosReembolsos}
                onChange={(n) =>
                  updatePlatform(p.id, "cancelamentosReembolsos", n)
                }
              />
            </div>

            {/* Resumo da plataforma */}
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-4">
              <Calculated
                label="Faturamento Líquido"
                value={fmtBRL(calcs.faturamentoLiquido)}
              />
              <Calculated
                label="+ VR Líquido"
                value={fmtBRL(calcs.vrLiquido)}
              />
              <Calculated
                label="+ Cancelamentos"
                value={fmtBRL(inputs.cancelamentosReembolsos)}
              />
              <Calculated
                label="= Total recebido"
                value={fmtBRL(calcs.totalRecebido)}
                highlight
              />
            </div>
          </div>
        )
      })}

      {/* Custos (geral) */}
      <Section title="Custos da Indústria (geral)" tone="negative">
        <div className="grid gap-4 sm:grid-cols-3">
          <CurrencyField
            label="Custo Produtos Cozina"
            name="custo_produtos_cozina"
            value={general.custoProdutosCozina}
            onChange={(n) => updateGeneral("custoProdutosCozina", n)}
          />
          <CurrencyField
            label="Custo Produtos Loja"
            name="custo_produtos_loja"
            value={general.custoProdutosLoja}
            onChange={(n) => updateGeneral("custoProdutosLoja", n)}
          />
          <Calculated
            label="Subtotal Custos"
            value={fmtBRL(totalCustos)}
            muted
          />
        </div>
      </Section>

      {/* Avaliação & Observações */}
      <Section title="Avaliação e observações">
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            label="Clientes Novos"
            name="clientes_novos"
            value={general.clientesNovos}
            onChange={(n) => updateGeneral("clientesNovos", n)}
          />
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Nota Média (estrelas)</Label>
            <Input
              name="nota_media"
              type="number"
              step="0.1"
              min="0"
              max="5"
              value={general.notaMedia === 0 ? "" : String(general.notaMedia)}
              onChange={(e) =>
                updateGeneral(
                  "notaMedia",
                  parseFloat(e.target.value || "0") || 0,
                )
              }
              placeholder="4.7"
            />
          </div>
        </div>
        <div className="mt-4">
          <Label className="text-xs font-medium">Observações</Label>
          <textarea
            name="observacoes"
            value={general.observacoes}
            onChange={(e) => updateGeneral("observacoes", e.target.value)}
            placeholder="Anotações do mês — comentários, alertas, contexto…"
            rows={3}
            className="mt-1.5 min-h-24 w-full resize-y rounded-md border bg-background p-3 text-sm outline-none focus:border-ring"
          />
        </div>
      </Section>

      {/* Resultado */}
      <Section title="Resultado do mês" tone="positive">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Calculated
            label="Faturamento Bruto"
            value={fmtBRL(totalFaturamentoBruto)}
          />
          <Calculated
            label="Faturamento Líquido"
            value={fmtBRL(totalFaturamentoLiquido)}
          />
          <Calculated
            label="Total recebido pela loja"
            value={fmtBRL(totalRecebidoLoja)}
            highlight
          />
          <Calculated
            label="Margem de Lucro"
            value={`${fmtBRL(margemLiquida)} (${fmtPct(margemLucroPct)})`}
            highlight
          />
        </div>
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

function NumberField({
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
      <Input
        name={name}
        type="number"
        inputMode="numeric"
        step="1"
        min="0"
        value={value === 0 ? "" : String(value)}
        onChange={(e) => onChange(parseInt(e.target.value || "0", 10) || 0)}
        placeholder="0"
      />
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
