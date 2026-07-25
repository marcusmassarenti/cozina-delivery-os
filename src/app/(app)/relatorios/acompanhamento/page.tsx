import { Fragment } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { ExportPdfButton } from "@/components/shared/export-pdf-button"
import { PlatformLogo, type PlatformId,
  PLATAFORMAS,
} from "@/components/platform-logo"
import { ReportBrandLogo } from "@/components/report-brand-logo"
import { getAcompanhamentoVendas } from "@/lib/data/acompanhamento"
import { getLastSyncedDates } from "@/lib/data/sync-status"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import { assertCanView } from "@/lib/auth/permissions"
import { fmtBRL, fmtPct } from "@/lib/format"
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
  cardapioweb: "Cardápio Web",
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
  await assertCanView("relatorios")
  const periodsRaw = await getAvailablePeriods()
  const periodOptions = periodsRaw.map((p) => ({
    key: formatPeriodKey(p),
    label: formatPeriodLabel(p),
  }))

  // Sempre abre no MÊS ATUAL (pedido do Marcus). Garante que ele apareça no
  // seletor mesmo que ainda não tenha dado (mês recém-começado).
  const currentKey = formatPeriodKey(currentPeriod())
  if (!periodOptions.some((p) => p.key === currentKey)) {
    periodOptions.unshift({
      key: currentKey,
      label: formatPeriodLabel(currentPeriod()),
    })
  }
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : currentKey

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

  const [acomp, syncStatus] = await Promise.all([
    getAcompanhamentoVendas(year, month, de, ate),
    getLastSyncedDates(),
  ])
  const periodLabel = formatPeriodLabel({ year, month })
  const diariaLabel = `${de} a ${ate}/${MES_ABREV[month - 1]}`
  // dd/mm a partir de YYYY-MM-DD (sem fuso, é só string)
  const ddmm = (iso: string | null) =>
    iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—"

  // Só as plataformas habilitadas em alguma loja do tenant.
  const tenantPlats = PLATAFORMAS.filter((p) =>
    acomp.brands.some((b) =>
      b.units.some((u) => u.platforms.some((up) => String(up) === p)),
    ),
  )
  // O Cardápio Web entra pela API contínua, sem "sincronizado até" próprio.
  const ultimaSync: Partial<Record<PlatformId, string | null>> = {
    ifood: syncStatus.ifood,
    "99food": syncStatus.ninefood,
    keeta: syncStatus.keeta,
  }
  const num = (n: number) => (n === 0 ? "—" : fmtBRL(n))
  // Falta = quanto ainda falta pra bater a meta. Vermelho quando falta;
  // quando bate/passa, mostra "✓ bateu" (sem número verde confuso na coluna).
  const faltaCell = (meta: number, falta: number) => {
    if (meta <= 0) return <span className="text-muted-foreground">—</span>
    if (falta > 0)
      return (
        <span className="text-rose-600 dark:text-rose-400">{fmtBRL(falta)}</span>
      )
    return (
      <span className="text-emerald-600 dark:text-emerald-400">✓ bateu</span>
    )
  }
  // Δ% da diária vs a MESMA faixa de dias do mês anterior (▲ subiu / ▼ caiu).
  const deltaCell = (cur: number, prev: number) => {
    if (prev <= 0) return <span className="text-muted-foreground">—</span>
    const d = ((cur - prev) / prev) * 100
    // Loja recém-integrada: mês passado ~zero → % explode (ex.: +2000%). Em vez
    // de poluir, mostra um selo "novo".
    if (d >= 400) {
      return (
        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
          novo
        </span>
      )
    }
    const up = d >= 0
    return (
      <span
        className={`tabular-nums ${
          up
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-rose-600 dark:text-rose-400"
        }`}
      >
        {up ? "▲" : "▼"} {fmtPct(Math.abs(d))}
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
          <ReportBrandLogo imgClassName="h-10 w-auto print:h-12" />
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

      {/* Alerta: até qual data cada plataforma está sincronizada */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200">
        <span className="font-semibold">Dados sincronizados até:</span>
        {tenantPlats.map((plat) => (
          <span key={plat} className="inline-flex items-center gap-1.5">
            <PlatformLogo platform={plat} size="sm" />
            <span className="tabular-nums">
              {/* Mapa, não ternário: o último ramo era `syncStatus.keeta`,
                  então uma plataforma nova exibiria a data da Keeta com o
                  rótulo dela. Sem data conhecida, mostra "—". */}
              {ddmm(ultimaSync[plat] ?? null)}
            </span>
          </span>
        ))}
        <span className="text-[10px] text-sky-700/70 dark:text-sky-300/60">
          (iFood: financeiro liquidado · 99/Keeta: extrato/loja)
        </span>
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
        <>
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
                  vs {acomp.prevMesLabel}
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
                <BrandBlock
                  key={brand.brandId}
                  brand={brand}
                  num={num}
                  deltaCell={deltaCell}
                  faltaCell={faltaCell}
                >
                  {brand.units.map((u) => (
                    <Fragment key={u.unitId}>
                      <tr className="border-t bg-card font-medium">
                        <td className="px-3 py-1.5">{u.name}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {num(u.diaria)}
                        </td>
                        <td className="px-3 py-1.5 text-right text-xs">
                          {deltaCell(u.diaria, u.prevDiaria)}
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
                            <span className="inline-flex items-center gap-1.5">
                              <span data-print="hide">
                                <PlatformLogo
                                  platform={p.platform}
                                  size="sm"
                                />
                              </span>
                              {PLAT_LABEL[p.platform]}
                            </span>
                          </td>
                          <td className="px-3 py-1 text-right tabular-nums">
                            {num(p.diaria)}
                          </td>
                          <td className="px-3 py-1 text-right text-xs">
                            {p.diaria > 0 || p.prevDiaria > 0
                              ? deltaCell(p.diaria, p.prevDiaria)
                              : null}
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
            </tbody>
          </table>
        </div>

        {/* Totais por marca (como o quadro lateral da planilha) */}
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b px-5 py-3">
            <p className="text-sm font-semibold">
              Totais por marca · {periodLabel}
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Marca</th>
                <th className="px-3 py-2 text-right font-semibold">
                  Diária ({diariaLabel})
                </th>
                <th className="px-3 py-2 text-right font-semibold">
                  vs {acomp.prevMesLabel}
                </th>
                <th className="px-3 py-2 text-right font-semibold">
                  Total ({periodLabel})
                </th>
                <th className="px-3 py-2 text-right font-semibold">Meta</th>
                <th className="px-3 py-2 text-right font-semibold">Falta</th>
              </tr>
            </thead>
            <tbody>
              {acomp.brands.map((b) => (
                <tr key={b.brandId} className="border-t">
                  <td className="px-3 py-2 font-medium">
                    TOTAL {b.brandName}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {num(b.diaria)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {deltaCell(b.diaria, b.prevDiaria)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {num(b.total)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {num(b.meta)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {faltaCell(b.meta, b.falta)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-primary/40 bg-primary/5 font-bold">
                <td className="px-3 py-2">TOTAL GRUPOS</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {num(acomp.grupoDiaria)}
                </td>
                <td className="px-3 py-2 text-right text-xs">
                  {deltaCell(acomp.grupoDiaria, acomp.grupoPrevDiaria)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {num(acomp.grupoTotal)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {num(acomp.grupoMeta)}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {faltaCell(acomp.grupoMeta, acomp.grupoFalta)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  )
}

function BrandBlock({
  brand,
  num,
  deltaCell,
  faltaCell,
  children,
}: {
  brand: import("@/lib/data/acompanhamento").AcompBrand
  num: (n: number) => string
  deltaCell: (cur: number, prev: number) => React.ReactNode
  faltaCell: (meta: number, falta: number) => React.ReactNode
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
        <td className="px-3 py-1.5 text-right text-xs">
          {deltaCell(brand.diaria, brand.prevDiaria)}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums">
          {num(brand.total)}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums">
          {num(brand.meta)}
        </td>
        <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
          {faltaCell(brand.meta, brand.falta)}
        </td>
      </tr>
      {children}
    </>
  )
}
