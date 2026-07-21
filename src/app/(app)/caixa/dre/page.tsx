import Link from "next/link"
import { AlertTriangle, Info, Target } from "lucide-react"

import { PeriodSelector } from "@/components/shared/period-selector"
import { getDreGerencial } from "@/lib/data/dre-gerencial"
import { fmtBRL, fmtPct } from "@/lib/format"
import { formatPeriodLabel } from "@/lib/period"
import { readPeriod } from "@/lib/period-helpers"

function pctTxt(f: number | null): string {
  return f == null ? "—" : fmtPct(f * 100)
}

/** Uma linha da cascata do DRE. */
function Linha({
  label,
  valor,
  pct,
  tone,
  bold,
  sub,
  indent,
}: {
  label: string
  valor: number
  pct?: number | null
  tone?: "pos" | "neg" | "sub" | "total"
  bold?: boolean
  sub?: boolean
  indent?: boolean
}) {
  const cor =
    tone === "pos"
      ? "text-emerald-600"
      : tone === "neg"
        ? "text-rose-600"
        : tone === "total"
          ? valor >= 0
            ? "text-emerald-600"
            : "text-rose-600"
          : ""
  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-2 ${
        tone === "total" ? "border-y bg-muted/40" : sub ? "text-sm text-muted-foreground" : ""
      }`}
    >
      <span className={`${bold ? "font-semibold" : ""} ${indent ? "pl-4" : ""}`}>{label}</span>
      <span className="flex items-center gap-3">
        {pct != null && (
          <span className="w-14 text-right text-[11px] tabular-nums text-muted-foreground">
            {pctTxt(pct)}
          </span>
        )}
        <span className={`w-28 text-right font-medium tabular-nums ${bold ? "font-semibold" : ""} ${cor}`}>
          {tone === "neg" && valor > 0 ? "−" : ""}
          {fmtBRL(valor)}
        </span>
      </span>
    </div>
  )
}

export default async function DrePage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; periodo?: string; inicio?: string; fim?: string }>
}) {
  const sp = await searchParams
  const { year, month } = readPeriod(sp)
  const dre = await getDreGerencial(year, month, sp.loja)
  if (!dre) return null

  const now = new Date()
  const periods: { year: number; month: number }[] = []
  for (let i = -1; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    periods.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }

  const indicadores = [
    { label: "Margem de contribuição", value: pctTxt(dre.mcPct), hint: "sobra depois dos custos variáveis" },
    { label: "CMV", value: pctTxt(dre.cmvPct), hint: "custo dos insumos sobre a receita" },
    { label: "Mão de obra", value: pctTxt(dre.cmoPct), hint: "folha + pró-labore sobre a receita" },
    { label: "Margem líquida", value: pctTxt(dre.margemPct), hint: "resultado operacional sobre a receita" },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">DRE Gerencial</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Resultado por competência a partir dos lançamentos · {formatPeriodLabel({ year, month })}
          </p>
        </div>
        <PeriodSelector current={{ start: `${year}-${String(month).padStart(2, "0")}-01`, end: `${year}-${String(month).padStart(2, "0")}-28` }} options={periods} />
      </div>

      {!dre.temClassificacao && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            Classifique suas categorias por grupo de DRE em{" "}
            <Link href="/caixa/categorias" className="font-semibold underline">
              Categorias
            </Link>{" "}
            (CMV, mão de obra, fixa…) pra este relatório ficar completo.
          </span>
        </div>
      )}

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {indicadores.map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-3 shadow-sm">
            <div className="text-[11px] font-medium text-muted-foreground">{k.label}</div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums">{k.value}</div>
            <div className="text-[10px] text-muted-foreground">{k.hint}</div>
          </div>
        ))}
      </div>

      {/* Ponto de equilíbrio */}
      {dre.pontoEquilibrio != null && (
        <div className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm shadow-sm">
          <Target className="size-4 text-primary" />
          <span>
            <strong>Ponto de equilíbrio:</strong> você precisa de{" "}
            <strong className="tabular-nums">{fmtBRL(dre.pontoEquilibrio)}</strong> de receita líquida
            no mês pra cobrir os custos fixos (
            {fmtBRL(dre.cmo + dre.fixas)}). Acima disso, vira lucro.
          </span>
        </div>
      )}

      {/* Cascata */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Linha label="Receita bruta" valor={dre.receitaBruta} tone="pos" bold />
        {dre.deducoes > 0 && (
          <Linha label="(−) Deduções (taxas, impostos, cartão)" valor={dre.deducoes} tone="neg" />
        )}
        <Linha label="= Receita líquida" valor={dre.receitaLiquida} tone="total" bold />
        <Linha label="(−) CMV / Insumos" valor={dre.cmv} pct={dre.cmvPct} tone="neg" />
        {dre.detalhe.variavel.total > 0 && (
          <Linha label="(−) Despesas variáveis" valor={dre.detalhe.variavel.total} tone="neg" />
        )}
        <Linha label="= Margem de contribuição" valor={dre.margemContribuicao} pct={dre.mcPct} tone="total" bold />
        <Linha label="(−) Mão de obra (CMO)" valor={dre.cmo} pct={dre.cmoPct} tone="neg" />
        <Linha label="(−) Despesas fixas" valor={dre.fixas} pct={dre.fixasPct} tone="neg" />
        {dre.naoClassificado > 0 && (
          <Linha label="(−) Sem classificação" valor={dre.naoClassificado} tone="neg" />
        )}
        <Linha label="= Resultado operacional" valor={dre.resultadoOperacional} pct={dre.margemPct} tone="total" bold />
        {dre.investimentos > 0 && (
          <>
            <Linha label="(−) Investimentos" valor={dre.investimentos} tone="neg" />
            <Linha label="= Resultado final" valor={dre.resultadoFinal} tone="total" bold />
          </>
        )}
      </div>

      {/* Não classificado — acionável */}
      {dre.naoClassificado > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/10">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-4" />
            {fmtBRL(dre.naoClassificado)} sem classificação de DRE
          </div>
          <div className="flex flex-wrap gap-2">
            {dre.naoClassificadoCategorias.slice(0, 8).map((c) => (
              <span key={c.name} className="rounded-full border bg-card px-2 py-0.5 text-xs">
                {c.name} · {fmtBRL(c.total)}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Classifique essas categorias em{" "}
            <Link href="/caixa/categorias" className="underline">Categorias</Link> pra entrarem no lugar certo.
          </p>
        </div>
      )}
    </div>
  )
}
