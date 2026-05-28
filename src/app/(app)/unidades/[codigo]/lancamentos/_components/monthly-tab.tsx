"use client"

import * as React from "react"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  FileSpreadsheet,
  Save,
  Sparkles,
} from "lucide-react"

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
import {
  getIfoodMonthlySuggestion,
  saveMonthlyEntry,
  type ActionState,
} from "../_actions"

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
  const [selected, setSelected] = React.useState<PlatformId>(
    unitActivePlatforms[0] ?? "ifood",
  )
  // Marca quais plataformas foram auto-preenchidas via relatório
  const [autoFilled, setAutoFilled] = React.useState<Set<PlatformId>>(new Set())
  const [autoFillError, setAutoFillError] = React.useState<string | null>(null)
  const [isAutoFilling, startAutoFill] = React.useTransition()
  const router = useRouter()

  function handleAutoFillIfood() {
    setAutoFillError(null)
    startAutoFill(async () => {
      const sug = await getIfoodMonthlySuggestion(unitId, year, month)
      if (!sug.hasData) {
        setAutoFillError(
          "Nenhum Financeiro do iFood importado pra esse mês. Sobe o XLSX em /importacao.",
        )
        return
      }
      setPlatforms((prev) => ({
        ...prev,
        ifood: {
          ...prev.ifood,
          taxaEntrega: sug.taxaEntrega,
          taxaComissao: sug.taxaComissao,
          promocoes: sug.promocoes,
          cancelamentosReembolsos: sug.cancelamentosReembolsos,
        },
      }))
      setAutoFilled((prev) => new Set(prev).add("ifood"))
    })
  }

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

  // Totais gerais (consolidação)
  const totalFaturamentoBruto = PLATFORMS.reduce(
    (acc, p) => acc + daySummary[p.id].faturamento,
    0,
  )
  const totalTaxas = PLATFORMS.reduce(
    (acc, p) => acc + platformCalcs[p.id].totalTaxas,
    0,
  )
  const totalFaturamentoLiquido = totalFaturamentoBruto - totalTaxas
  const totalVrRecebido = PLATFORMS.reduce(
    (acc, p) => acc + platforms[p.id].vrRecebido,
    0,
  )
  const totalVrTaxa = totalVrRecebido * VR_TAXA
  const totalVrLiquido = totalVrRecebido - totalVrTaxa
  const totalCancelamentos = PLATFORMS.reduce(
    (acc, p) => acc + platforms[p.id].cancelamentosReembolsos,
    0,
  )
  const totalRecebidoCalculado = PLATFORMS.reduce(
    (acc, p) => acc + platformCalcs[p.id].totalRecebido,
    0,
  )

  // Real vs calculado
  const totalRecebidoReal = general.totalRecebidoReal
  const useReal = totalRecebidoReal > 0
  const diferenca = totalRecebidoReal - totalRecebidoCalculado
  const diferencaPct =
    totalRecebidoCalculado > 0
      ? (diferenca / totalRecebidoCalculado) * 100
      : 0
  const baseParaMargem = useReal ? totalRecebidoReal : totalRecebidoCalculado

  const totalCustos = general.custoProdutosCozina + general.custoProdutosLoja
  const margemLiquida = baseParaMargem - totalCustos
  const margemLucroPct =
    totalFaturamentoBruto > 0
      ? (margemLiquida / totalFaturamentoBruto) * 100
      : 0

  // CMV (Custo de Mercadoria Vendida) sobre o faturamento bruto
  const cmvCozinaPct =
    totalFaturamentoBruto > 0
      ? (general.custoProdutosCozina / totalFaturamentoBruto) * 100
      : 0
  const cmvLojaPct =
    totalFaturamentoBruto > 0
      ? (general.custoProdutosLoja / totalFaturamentoBruto) * 100
      : 0
  const cmvTotalPct =
    totalFaturamentoBruto > 0 ? (totalCustos / totalFaturamentoBruto) * 100 : 0

  function cmvTone(pct: number) {
    if (pct === 0) return undefined
    if (pct <= 30) return "ok" as const
    if (pct <= 40) return "warning" as const
    return "error" as const
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="unitId" value={unitId} />
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="month" value={month} />

      {/* Lançamento por plataforma — único bloco com seletor */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3 border-b pb-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Lançamento por plataforma
            </h3>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Selecione a plataforma e preencha taxas, VR e cancelamentos.
            </p>
          </div>
        </div>

        {/* Platform selector buttons */}
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {PLATFORMS.map((p) => {
            const isSelected = selected === p.id
            const isActive = unitActivePlatforms.includes(p.id)
            const summary = daySummary[p.id]
            const calc = platformCalcs[p.id]
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p.id)}
                className={`flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background hover:bg-muted/50"
                } ${isActive ? "" : "opacity-60"}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PlatformLogo platform={p.id} size="sm" />
                    <span className="text-xs font-semibold">{p.label}</span>
                  </div>
                  {isSelected && (
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-primary">
                      Editando
                    </span>
                  )}
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    Fat. diário
                  </span>
                  <span className="text-xs font-bold tabular-nums">
                    {fmtBRL(summary.faturamento)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    Total recebido (calc)
                  </span>
                  <span className="text-xs font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    {fmtBRL(calc.totalRecebido)}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Per-platform inputs (todos no DOM, só o selecionado visível) */}
        {PLATFORMS.map((p) => {
          const inputs = platforms[p.id]
          const calc = platformCalcs[p.id]
          const summary = daySummary[p.id]
          const isSelected = selected === p.id
          return (
            <div
              key={p.id}
              className={`mt-4 ${isSelected ? "" : "hidden"}`}
              data-platform={p.id}
            >
              <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
                <div className="flex items-center gap-2">
                  <PlatformLogo platform={p.id} size="sm" />
                  <span className="text-sm font-semibold">{p.label}</span>
                  {autoFilled.has(p.id) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400">
                      <Sparkles className="size-3" />
                      Auto-preenchido
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {p.id === "ifood" && (
                    <button
                      type="button"
                      onClick={handleAutoFillIfood}
                      disabled={isAutoFilling}
                      className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-muted disabled:opacity-50"
                      title="Preenche as taxas, comissão, promoção e cancelamentos a partir do Relatório de Conciliação importado"
                    >
                      <FileSpreadsheet className="size-3" />
                      {isAutoFilling
                        ? "Buscando..."
                        : "Auto-preencher com relatório"}
                    </button>
                  )}
                  <div className="text-right">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                      Faturamento (diário)
                    </p>
                    <p className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                      {fmtBRL(summary.faturamento)}
                    </p>
                  </div>
                </div>
              </div>

              {p.id === "ifood" && autoFillError && (
                <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{autoFillError}</span>
                </div>
              )}

              {/* Taxas */}
              <h4 className="mt-3 text-[10px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                Taxas e Descontos{" "}
                {autoFilled.has(p.id) ? (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    · vindas do relatório
                  </span>
                ) : (
                  <span className="text-muted-foreground">(manual)</span>
                )}
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
                  onChange={(n) =>
                    updatePlatform(p.id, "outrosDescontos", n)
                  }
                />
                <Calculated
                  label="Subtotal Taxas"
                  value={fmtBRL(calc.totalTaxas)}
                  muted
                />
              </div>

              {/* VR + Cancelamentos */}
              <h4 className="mt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Vale Refeição e Cancelamentos
              </h4>
              <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <CurrencyField
                  label="VR Recebido"
                  name={`${p.id}_vr_recebido`}
                  value={inputs.vrRecebido}
                  onChange={(n) => updatePlatform(p.id, "vrRecebido", n)}
                />
                <Calculated
                  label="VR Taxa 8% (auto)"
                  value={fmtBRL(calc.vrTaxa)}
                  muted
                />
                <Calculated
                  label="VR Líquido"
                  value={fmtBRL(calc.vrLiquido)}
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

              {/* Resumo desta plataforma */}
              <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-emerald-50 p-3 sm:grid-cols-4 dark:bg-emerald-950/20">
                <Calculated
                  label="Faturamento Líquido"
                  value={fmtBRL(calc.faturamentoLiquido)}
                />
                <Calculated label="+ VR Líquido" value={fmtBRL(calc.vrLiquido)} />
                <Calculated
                  label="+ Cancelamentos"
                  value={fmtBRL(inputs.cancelamentosReembolsos)}
                />
                <Calculated
                  label={`= Total recebido (${p.label})`}
                  value={fmtBRL(calc.totalRecebido)}
                  highlight
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Consolidação das 3 plataformas */}
      <div className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Consolidação das 3 plataformas
          </h3>
          <div className="flex items-center gap-1.5">
            {PLATFORMS.map((p) => (
              <PlatformLogo key={p.id} platform={p.id} size="sm" />
            ))}
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Calculated
            label="Faturamento Bruto (somado)"
            value={fmtBRL(totalFaturamentoBruto)}
          />
          <Calculated label="Total Taxas" value={fmtBRL(totalTaxas)} muted />
          <Calculated
            label="Faturamento Líquido"
            value={fmtBRL(totalFaturamentoLiquido)}
          />
          <Calculated label="VR Recebido (total)" value={fmtBRL(totalVrRecebido)} />
          <Calculated
            label="VR Taxa 8% (total)"
            value={fmtBRL(totalVrTaxa)}
            muted
          />
          <Calculated label="VR Líquido" value={fmtBRL(totalVrLiquido)} />
          <Calculated
            label="Cancelamentos (+)"
            value={fmtBRL(totalCancelamentos)}
          />
          <Calculated
            label="Total Recebido (calculado)"
            value={fmtBRL(totalRecebidoCalculado)}
            highlight
          />
          <div />
        </div>

        <div className="mt-5 rounded-lg border border-dashed bg-muted/30 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <CurrencyField
              label="Faturamento Real Recebido"
              name="total_recebido_real"
              value={general.totalRecebidoReal}
              onChange={(n) => updateGeneral("totalRecebidoReal", n)}
            />
            <Calculated
              label="Diferença (Real − Calculado)"
              value={
                useReal
                  ? `${diferenca >= 0 ? "+" : ""}${fmtBRL(diferenca)} (${fmtPct(diferencaPct)})`
                  : "—"
              }
              tone={
                !useReal
                  ? undefined
                  : Math.abs(diferenca) < 1
                    ? "ok"
                    : Math.abs(diferencaPct) < 3
                      ? "warning"
                      : "error"
              }
            />
            <div className="flex items-end">
              <p className="text-[11px] text-muted-foreground">
                {useReal
                  ? Math.abs(diferenca) < 1
                    ? "✓ Valores batem. Margem usa o real."
                    : Math.abs(diferencaPct) < 3
                      ? "⚠️ Pequena divergência (<3%). Margem usa o real."
                      : "🔴 Divergência significativa (>3%). Conferir lançamentos."
                  : "Deixe em branco se ainda não tem o real do banco. Margem usa o calculado."}
              </p>
            </div>
          </div>
        </div>
      </div>

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
      <Section title="Resultado do mês (consolidado)" tone="positive">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Calculated
            label="Faturamento Bruto"
            value={fmtBRL(totalFaturamentoBruto)}
          />
          <Calculated
            label={useReal ? "Total Recebido (real)" : "Total Recebido (calc)"}
            value={fmtBRL(baseParaMargem)}
            highlight
          />
          <Calculated
            label="(−) Custos Totais"
            value={fmtBRL(totalCustos)}
            muted
          />
          <Calculated
            label="Margem de Lucro"
            value={`${fmtBRL(margemLiquida)} (${fmtPct(margemLucroPct)})`}
            highlight
          />
        </div>

        {/* Breakdown de CMV */}
        <div className="mt-4 rounded-lg border bg-muted/30 p-4">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            CMV (Custo da Mercadoria sobre Faturamento Bruto)
          </h4>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <CmvCard
              label="CMV Cozina"
              sublabel={`compras da indústria · ${fmtBRL(general.custoProdutosCozina)}`}
              pct={cmvCozinaPct}
              tone={cmvTone(cmvCozinaPct)}
            />
            <CmvCard
              label="CMV Loja"
              sublabel={`outros fornecedores · ${fmtBRL(general.custoProdutosLoja)}`}
              pct={cmvLojaPct}
              tone={cmvTone(cmvLojaPct)}
            />
            <CmvCard
              label="CMV Total"
              sublabel={`Cozina + Loja · ${fmtBRL(totalCustos)}`}
              pct={cmvTotalPct}
              tone={cmvTone(cmvTotalPct)}
              bold
            />
          </div>

          {/* Alerta de CMV Total alto (Cozina + Loja > 40%) */}
          {cmvTotalPct > 40 && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div className="flex flex-col gap-1">
                <p className="font-semibold">
                  CMV Total em {fmtPct(cmvTotalPct)} — acima da meta de 40%
                </p>
                <p className="text-[11px] opacity-90">
                  Soma de <strong>Cozina ({fmtPct(cmvCozinaPct)})</strong> +{" "}
                  <strong>Loja ({fmtPct(cmvLojaPct)})</strong> passou de 40% do
                  faturamento. Avalie ticket médio, mix de produtos ou
                  renegociar compras.
                </p>
              </div>
            </div>
          )}

          {/* Confirmação positiva quando CMV Total está saudável */}
          {totalFaturamentoBruto > 0 &&
            totalCustos > 0 &&
            cmvTotalPct <= 30 && (
              <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400">
                <CheckCircle2 className="size-4 shrink-0" />
                <span className="font-medium">
                  CMV Total em {fmtPct(cmvTotalPct)} — dentro da faixa saudável
                  (≤ 30%). Bom controle de custos.
                </span>
              </div>
            )}
        </div>
        {useReal ? (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Margem calculada com base no <strong>Faturamento Real Recebido</strong>{" "}
            ({fmtBRL(totalRecebidoReal)}).
          </p>
        ) : (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Margem calculada com base no <strong>Total Calculado</strong>. Preencha
            o Faturamento Real Recebido pra usar o valor que efetivamente entrou.
          </p>
        )}
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

function CmvCard({
  label,
  sublabel,
  pct,
  tone,
  bold,
}: {
  label: string
  sublabel: string
  pct: number
  tone?: "ok" | "warning" | "error"
  bold?: boolean
}) {
  const toneClass =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400"
        : tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400"
          : "border-border bg-background text-muted-foreground"
  return (
    <div className={`flex flex-col gap-1 rounded-md border p-3 ${toneClass}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-xs ${bold ? "font-bold" : "font-medium"}`}>
          {label}
        </span>
        <span
          className={`tabular-nums ${bold ? "text-xl font-bold" : "text-lg font-bold"}`}
        >
          {fmtPct(pct)}
        </span>
      </div>
      <span className="text-[10px] opacity-70">{sublabel}</span>
    </div>
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
  tone,
}: {
  label: string
  value: string
  highlight?: boolean
  muted?: boolean
  tone?: "ok" | "warning" | "error"
}) {
  const toneClass =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-400"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400"
        : tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-400"
          : ""

  const ToneIcon =
    tone === "ok" ? CheckCircle2 : tone === "warning" || tone === "error" ? AlertTriangle : null

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {ToneIcon ? (
          <ToneIcon className="size-3 text-muted-foreground" />
        ) : (
          <Calculator className="size-3 text-muted-foreground" />
        )}
        <Label className="text-xs font-medium text-muted-foreground">
          {label}
        </Label>
      </div>
      <div
        className={`rounded-md border px-3 py-2 text-sm font-semibold tabular-nums ${
          toneClass ||
          (highlight
            ? "bg-muted/30 text-emerald-700 dark:text-emerald-400"
            : muted
              ? "bg-muted/30 text-muted-foreground"
              : "bg-muted/30")
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
