import { Fragment } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { ExportPdfButton } from "@/components/shared/export-pdf-button"
import { type PlatformId } from "@/components/platform-logo"
import { getAcompanhamentoVendas } from "@/lib/data/acompanhamento"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import { fmtBRL } from "@/lib/format"
import {
  currentPeriod,
  formatPeriodKey,
  formatPeriodLabel,
} from "@/lib/period"
import { AcompanhamentoControls } from "./_components/acompanhamento-controls"
import { MetaInput } from "./_components/meta-input"

const PLAT_LABEL: Record<PlatformId, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
}
const MES_ABREV = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
]

function keyToYM(key: string): { year: number; month: number } {
  const [y, m] = key.split("-").map(Number)
  return { year: y, month: m }
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

export default async function AcompanhamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; de?: string; ate?: string }>
}) {
  const sp = await searchParams
  const periodsRaw = await getAvailablePeriods()
  const periodOptions = periodsRaw.map((p) => ({
    key: formatPeriodKey(p),
    label: formatPeriodLabel(p),
  }))

  const currentKey = formatPeriodKey(currentPeriod())
  let defaultMes = periodOptions[0]?.key ?? null
  if (defaultMes === currentKey && periodOptions.length > 1) {
    defaultMes = periodOptions[1].key
  }
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : defaultMes

  if (!mes) {
    return (
      <div className="flex flex-1 flex-col gap-5 bg-muted/30 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Acompanhamento de Vendas
        </h1>
        <div className="rounded-xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhum mês com dados ainda.
        </div>
      </div>
    )
  }

  const { year, month } = keyToYM(mes)
  const diasNoMes = new Date(year, month, 0).getDate()
  const de = clamp(parseInt(sp.de ?? "1", 10) || 1, 1, diasNoMes)
  const ate = clamp(parseInt(sp.ate ?? String(diasNoMes), 10) || diasNoMes, de, diasNoMes)

  const acomp = await getAcompanhamentoVendas(year, month, de, ate)
  const periodLabel = formatPeriodLabel({ year, month })
  const diariaLabel = `${de} a ${ate}/${MES_ABREV[month - 1]}`

  const num = (n: number) => (n === 0 ? "—" : fmtBRL(n))
  const faltaCell = (meta: number, falta: number) => {
    if (meta <= 0) return <span className="text-muted-foreground">—</span>
    return (
      <span
        className={
          falta > 0
            ? "text-rose-600 dark:text-rose-400"
            : "text-emerald-600 dark:text-emerald-400"
        }
      >
        {fmtBRL(falta)}
      </span>
    )
  }

  return (
    <div
      data-print="page"
      className="acomp-print flex flex-1 flex-col gap-4 bg-muted/30 p-6"
    >
      {/* Cabeçalho com logo */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cozina-logo.png" alt="Cozina" className="h-10 w-auto print:h-12" />
          <div>
            <Link
              href="/relatorios"
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground print:hidden"
            >
              <ArrowLeft className="size-3.5" />
              Hub de Relatórios
            </Link>
            <h1 className="text-xl font-bold tracking-tight">
              Infos Diária Venda
            </h1>
            <p className="text-xs text-muted-foreground">
              {periodLabel} · venda diária {diariaLabel}
            </p>
          </div>
        </div>
        <div data-print="hide">
          <ExportPdfButton />
        </div>
      </div>

      <AcompanhamentoControls
        periods={periodOptions}
        initial={{ mes, de, ate, diasNoMes }}
      />

      {acomp.brands.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center text-sm text-muted-foreground">
          Sem vendas nesse mês.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">
                  Loja / Plataforma
                </th>
                <th className="px-3 py-2 text-right font-semibold">
                  Diária ({diariaLabel})
                </th>
                <th className="px-3 py-2 text-right font-semibold">
                  Total ({periodLabel})
                </th>
                <th className="px-3 py-2 text-right font-semibold">Meta</th>
                <th className="px-3 py-2 text-right font-semibold">Falta</th>
              </tr>
            </thead>
            <tbody>
              {acomp.brands.map((brand) => (
                <BrandBlock key={brand.brandId} brand={brand} num={num}>
                  {brand.units.map((u) => (
                    <Fragment key={u.unitId}>
                      <tr className="border-t bg-card font-medium">
                        <td className="px-3 py-1.5">{u.name}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {num(u.diaria)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {num(u.total)}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <MetaInput
                            unitId={u.unitId}
                            year={year}
                            month={month}
                            initial={u.meta}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                          {faltaCell(u.meta, u.falta)}
                        </td>
                      </tr>
                      {u.platforms.map((p) => (
                        <tr
                          key={`${u.unitId}-${p.platform}`}
                          className="plat-row text-xs text-muted-foreground"
                        >
                          <td className="py-1 pl-8 pr-3">
                            {PLAT_LABEL[p.platform]}
                          </td>
                          <td className="px-3 py-1 text-right tabular-nums">
                            {num(p.diaria)}
                          </td>
                          <td className="px-3 py-1 text-right tabular-nums">
                            {num(p.total)}
                          </td>
                          <td />
                          <td />
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </BrandBlock>
              ))}

              {/* Total do grupo */}
              <tr className="border-t-2 border-primary/40 bg-primary/5 font-bold">
                <td className="px-3 py-2">TOTAL GRUPOS</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {num(acomp.grupoDiaria)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {num(acomp.grupoTotal)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {num(acomp.grupoMeta)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {acomp.grupoMeta > 0 ? fmtBRL(acomp.grupoFalta) : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function BrandBlock({
  brand,
  num,
  children,
}: {
  brand: import("@/lib/data/acompanhamento").AcompBrand
  num: (n: number) => string
  children: React.ReactNode
}) {
  return (
    <>
      <tr className="border-t bg-emerald-100/70 font-bold dark:bg-emerald-950/30">
        <td className="px-3 py-1.5 uppercase tracking-wide">
          {brand.brandName}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums">
          {num(brand.diaria)}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums">
          {num(brand.total)}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums">
          {num(brand.meta)}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums">
          {brand.meta > 0 ? fmtBRL(brand.falta) : "—"}
        </td>
      </tr>
      {children}
    </>
  )
}
