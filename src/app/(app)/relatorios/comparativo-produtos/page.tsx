import { AlertTriangle, GitCompareArrows } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { LojaFilter } from "@/components/shared/loja-filter"
import { PeriodSelector } from "@/components/shared/period-selector"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import { getTopProdutos } from "@/lib/data/produtos"
import { getVisibleUnits } from "@/lib/data/units"
import { assertCanView } from "@/lib/auth/permissions"
import { fmtBRL, fmtNum } from "@/lib/format"
import { formatPeriodLabel, formatRangeLabel } from "@/lib/period"
import { readPeriod } from "@/lib/period-helpers"

const PLATS: { id: PlatformId; label: string }[] = [
  { id: "ifood", label: "iFood" },
  { id: "99food", label: "99 Food" },
  { id: "keeta", label: "Keeta" },
]
const TOP_N = 25

type SP = { periodo?: string; inicio?: string; fim?: string; lojas?: string; plat?: string; metrica?: string }

function buildHref(sp: SP, key: keyof SP, val: string): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (v && k !== key) p.set(k, String(v))
  }
  p.set(key, val)
  return `?${p.toString()}`
}

export default async function ComparativoProdutosPage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  const sp = await searchParams
  await assertCanView("relatorios")
  const { range: periodRange, year, month, isFullMonth } = readPeriod(sp)
  const plataforma: PlatformId = PLATS.some((p) => p.id === sp.plat)
    ? (sp.plat as PlatformId)
    : "ifood"
  const metrica: "qtd" | "valor" = sp.metrica === "valor" ? "valor" : "qtd"

  const allUnits = (await getVisibleUnits())
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, code: u.code, name: u.name }))
  const lojaCodes = (sp.lojas?.split(",") ?? []).filter(Boolean)
  const scoped =
    lojaCodes.length > 0
      ? allUnits.filter((u) => lojaCodes.includes(u.code))
      : allUnits

  const [perUnit, availablePeriods] = await Promise.all([
    Promise.all(
      scoped.map((u) => getTopProdutos(plataforma, [u.id], year, month)),
    ),
    getAvailablePeriods(),
  ])

  // pivot: produto → { porLoja: Map<code, valor>, total }
  const val = (r: { qtdVendida: number; valorTotal: number }) =>
    metrica === "valor" ? r.valorTotal : r.qtdVendida
  const prods = new Map<string, { porLoja: Map<string, number>; total: number }>()
  scoped.forEach((u, i) => {
    for (const r of perUnit[i]) {
      const g = prods.get(r.nomeItem) ?? { porLoja: new Map(), total: 0 }
      const v = val(r)
      g.porLoja.set(u.code, (g.porLoja.get(u.code) ?? 0) + v)
      g.total += v
      prods.set(r.nomeItem, g)
    }
  })
  const rows = [...prods.entries()]
    .map(([nome, g]) => ({ nome, porLoja: g.porLoja, total: g.total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP_N)

  const fmt = (v: number) =>
    v > 0 ? (metrica === "valor" ? fmtBRL(v) : fmtNum(v)) : null

  const pill = (active: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
      active
        ? "bg-primary text-primary-foreground"
        : "bg-card text-muted-foreground hover:bg-muted"
    }`

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <GitCompareArrows className="size-6 text-primary" />
            Comparativo de produtos
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Mesmo produto entre lojas diferentes ·{" "}
            {formatRangeLabel(periodRange)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LojaFilter units={allUnits} />
          <PeriodSelector
            current={periodRange}
            options={availablePeriods}
            enableRange
          />
        </div>
      </div>

      {!isFullMonth && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          <span>
            Produtos são agregados por <strong>mês</strong> nos relatórios. Mostrando <strong>{formatPeriodLabel({ year, month })}</strong> (mês do início do range).
          </span>
        </div>
      )}

      {/* Switchers plataforma + métrica */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
          {PLATS.map((p) => (
            <a
              key={p.id}
              href={buildHref(sp, "plat", p.id)}
              className={`${pill(plataforma === p.id)} inline-flex items-center gap-1.5`}
            >
              <PlatformLogo platform={p.id} size="sm" />
              {p.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
          <a href={buildHref(sp, "metrica", "qtd")} className={pill(metrica === "qtd")}>
            Quantidade
          </a>
          <a
            href={buildHref(sp, "metrica", "valor")}
            className={pill(metrica === "valor")}
          >
            Faturamento
          </a>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">Sem produtos nesse mês/plataforma</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Importe o cardápio/itens em{" "}
            <a href="/importacao" className="underline">
              /importacao
            </a>
            .
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                <th className="sticky left-0 z-10 bg-muted/40 px-4 py-2.5 text-left font-medium">
                  Produto
                </th>
                {scoped.map((u) => (
                  <th
                    key={u.code}
                    className="px-3 py-2.5 text-right font-medium"
                    title={u.name}
                  >
                    {u.name}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.nome} className="border-b last:border-0">
                  <td className="sticky left-0 z-10 bg-card px-4 py-2 font-medium">
                    {r.nome}
                  </td>
                  {scoped.map((u) => {
                    const v = r.porLoja.get(u.code) ?? 0
                    return (
                      <td
                        key={u.code}
                        className="px-3 py-2 text-right tabular-nums"
                      >
                        {fmt(v) ?? (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">
                    {fmt(r.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
