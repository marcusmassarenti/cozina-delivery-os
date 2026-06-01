import Link from "next/link"
import { ArrowLeft, TrendingDown, TrendingUp } from "lucide-react"

import { ExportPdfButton } from "@/components/shared/export-pdf-button"
import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { getVisibleUnits } from "@/lib/data/units"
import { assertCanView } from "@/lib/auth/permissions"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import { getTopProdutos, type ProdutoRanking } from "@/lib/data/produtos"
import { deltaPct } from "@/lib/data/comparativo-metrics"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import {
  currentPeriod,
  formatPeriodKey,
  formatPeriodLabel,
} from "@/lib/period"
import { ProdutosFilters } from "../_components/produtos-filters"

const ALL_PLAT: PlatformId[] = ["ifood", "99food", "keeta"]
const PLAT_LABEL: Record<PlatformId, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
}
const TOP_N = 30
const MOVERS_N = 15

function keyToYM(key: string): { year: number; month: number } {
  const [y, m] = key.split("-").map(Number)
  return { year: y, month: m }
}
function valOf(p: ProdutoRanking, metrica: string): number {
  return metrica === "valor" ? p.valorTotal : p.qtdVendida
}
function fmtVal(v: number, metrica: string): string {
  return metrica === "valor" ? fmtBRL(v) : fmtNum(v)
}

export default async function ProdutosPage({
  searchParams,
}: {
  searchParams: Promise<{
    plat?: string
    lojas?: string
    mesA?: string
    mesB?: string
    metrica?: string
  }>
}) {
  const sp = await searchParams
  await assertCanView("relatorios")

  const [allUnitsRaw, periodsRaw] = await Promise.all([
    getVisibleUnits(),
    getAvailablePeriods(),
  ])
  const allUnits = allUnitsRaw
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, code: u.code, name: u.name }))
  const periodOptions = periodsRaw.map((p) => ({
    key: formatPeriodKey(p),
    label: formatPeriodLabel(p),
  }))

  const plataforma: PlatformId = (ALL_PLAT as string[]).includes(sp.plat ?? "")
    ? (sp.plat as PlatformId)
    : "ifood"
  const lojaCodes = (sp.lojas?.split(",") ?? []).filter(Boolean)
  const selectedUnits =
    lojaCodes.length > 0
      ? allUnits.filter((u) => lojaCodes.includes(u.code))
      : allUnits
  const selectedIds = selectedUnits.map((u) => u.id)

  // Default: mês mais recente com dado, pulando o mês corrente (geralmente vazio).
  const currentKey = formatPeriodKey(currentPeriod())
  let defaultMesA = periodOptions[0]?.key ?? null
  if (defaultMesA === currentKey && periodOptions.length > 1) {
    defaultMesA = periodOptions[1].key
  }
  const mesA = sp.mesA && /^\d{4}-\d{2}$/.test(sp.mesA) ? sp.mesA : defaultMesA
  const mesB =
    sp.mesB && /^\d{4}-\d{2}$/.test(sp.mesB) && sp.mesB !== mesA ? sp.mesB : null
  const metrica = sp.metrica === "valor" ? "valor" : "qtd"
  const metricaLabel = metrica === "valor" ? "Faturamento" : "Qtd vendida"

  const ymA = mesA ? keyToYM(mesA) : null
  const ymB = mesB ? keyToYM(mesB) : null
  const [prodA, prodB] = await Promise.all([
    ymA
      ? getTopProdutos(plataforma, selectedIds, ymA.year, ymA.month)
      : Promise.resolve([] as ProdutoRanking[]),
    ymB
      ? getTopProdutos(plataforma, selectedIds, ymB.year, ymB.month)
      : Promise.resolve([] as ProdutoRanking[]),
  ])

  const filtersInitial = {
    plataforma,
    lojas: lojaCodes,
    mesA: mesA ?? "",
    mesB,
    metrica,
  }

  // Modo comparar: join por nome.
  let emAlta: {
    nome: string
    a: number
    b: number
    d: number | null
    novo: boolean
  }[] = []
  let emQueda: {
    nome: string
    a: number
    b: number
    d: number | null
    saiu: boolean
  }[] = []
  if (mesB) {
    const mapA = new Map(prodA.map((p) => [p.nomeItem, valOf(p, metrica)]))
    const mapB = new Map(prodB.map((p) => [p.nomeItem, valOf(p, metrica)]))
    const nomes = new Set([...mapA.keys(), ...mapB.keys()])
    const joined = [...nomes].map((nome) => {
      const a = mapA.get(nome) ?? 0
      const b = mapB.get(nome) ?? 0
      return { nome, a, b, d: deltaPct(a, b), novo: b === 0, saiu: a === 0 }
    })
    emAlta = joined
      .filter((j) => j.a > j.b)
      .sort((x, y) => (y.d ?? Infinity) - (x.d ?? Infinity))
      .slice(0, MOVERS_N)
      .map((j) => ({ ...j }))
    emQueda = joined
      .filter((j) => j.a < j.b)
      .sort((x, y) => (x.d ?? 0) - (y.d ?? 0))
      .slice(0, MOVERS_N)
      .map((j) => ({ ...j }))
  }

  // Modo 1 mês: top N por indicador.
  const top = [...prodA]
    .sort((a, b) => valOf(b, metrica) - valOf(a, metrica))
    .slice(0, TOP_N)
  const maxTop = top.length > 0 ? valOf(top[0], metrica) : 0

  return (
    <div data-print="page" className="flex flex-1 flex-col gap-5 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link
            href="/relatorios"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            data-print="hide"
          >
            <ArrowLeft className="size-3.5" />
            Hub de Relatórios
          </Link>
          <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight">
            Produtos
            <PlatformLogo platform={plataforma} size="md" />
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {PLAT_LABEL[plataforma]} · {metricaLabel} ·{" "}
            {mesA ? formatPeriodLabel(keyToYM(mesA)) : "—"}
            {mesB && ` vs ${formatPeriodLabel(keyToYM(mesB))}`} ·{" "}
            {selectedUnits.length === allUnits.length
              ? "rede toda"
              : `${selectedUnits.length} loja${selectedUnits.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div data-print="hide">
          <ExportPdfButton />
        </div>
      </div>

      <div data-print="hide">
        <ProdutosFilters
          units={allUnits.map((u) => ({ code: u.code, name: u.name }))}
          periods={periodOptions}
          initial={filtersInitial}
        />
      </div>

      {!ymA ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhum mês com dados. Sobe o cardápio em{" "}
          <span className="font-medium">/importacao</span>.
        </div>
      ) : mesB ? (
        // ===== Alta / queda =====
        <div className="grid gap-4 lg:grid-cols-2">
          <MoversTable
            title="Em alta"
            up
            metrica={metrica}
            labelA={formatPeriodLabel(keyToYM(mesA))}
            labelB={formatPeriodLabel(keyToYM(mesB))}
            rows={emAlta}
          />
          <MoversTable
            title="Em queda"
            up={false}
            metrica={metrica}
            labelA={formatPeriodLabel(keyToYM(mesA))}
            labelB={formatPeriodLabel(keyToYM(mesB))}
            rows={emQueda}
          />
        </div>
      ) : (
        // ===== Top N do mês =====
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b px-5 py-3">
            <p className="text-sm font-semibold">
              Top {TOP_N} produtos · {metricaLabel} ·{" "}
              {formatPeriodLabel(keyToYM(mesA))}
            </p>
          </div>
          <div className="divide-y">
            {top.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                Sem produtos nesse mês/plataforma.
              </p>
            ) : (
              top.map((p, i) => {
                const v = valOf(p, metrica)
                const w = maxTop > 0 ? (v / maxTop) * 100 : 0
                return (
                  <div
                    key={p.nomeItem}
                    className="flex items-center gap-3 px-5 py-2.5"
                  >
                    <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {p.nomeItem}
                      </p>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{ width: `${w}%` }}
                        />
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">
                      {fmtVal(v, metrica)}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function MoversTable({
  title,
  up,
  metrica,
  labelA,
  labelB,
  rows,
}: {
  title: string
  up: boolean
  metrica: string
  labelA: string
  labelB: string
  rows: { nome: string; a: number; b: number; d: number | null }[]
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-5 py-3">
        {up ? (
          <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <TrendingDown className="size-4 text-rose-600 dark:text-rose-400" />
        )}
        <p className="text-sm font-semibold">{title}</p>
        <span className="text-[11px] text-muted-foreground">
          {labelA} vs {labelB}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          Nada {up ? "em alta" : "em queda"} no período.
        </p>
      ) : (
        <div className="divide-y">
          {rows.map((r) => (
            <div
              key={r.nome}
              className="flex items-center justify-between gap-3 px-5 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{r.nome}</p>
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  {metrica === "valor" ? fmtBRL(r.b) : fmtNum(r.b)} →{" "}
                  {metrica === "valor" ? fmtBRL(r.a) : fmtNum(r.a)}
                </p>
              </div>
              <span
                className={`shrink-0 text-sm font-semibold tabular-nums ${
                  up
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {r.d === null
                  ? "novo"
                  : `${r.d > 0 ? "+" : ""}${fmtPct(r.d)}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
