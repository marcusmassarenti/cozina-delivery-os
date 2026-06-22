import { notFound, redirect } from "next/navigation"
import { Factory, Info } from "lucide-react"

import { requireAdmin } from "@/lib/auth/guards"
import { isSuperadmin } from "@/lib/auth/permissions"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import { getInsumos, getItensVendidos } from "@/lib/data/producao"
import { PeriodSelector } from "@/components/shared/period-selector"
import { formatRangeLabel } from "@/lib/period"
import { readPeriod } from "@/lib/period-helpers"

import { InsumoImport } from "./_components/insumo-import"
import { BulkFichaAction } from "./_components/bulk-ficha-action"
import { ItensFichaList } from "./_components/itens-ficha-list"

/**
 * Ficha Técnica — de-para "item vendido no delivery → insumos do ERP" que
 * alimenta a integração de demanda → produção (endpoint /api/v1/demanda-insumos).
 * Cadastro global da rede, só admin.
 */
export default async function FichaTecnicaPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; inicio?: string; fim?: string }>
}) {
  // Interno da Cozina (de-para pro ERP industrial) — só super-admin.
  if (!(await isSuperadmin())) notFound()

  let ok = false
  try {
    await requireAdmin()
    ok = true
  } catch {
    // não-admin
  }
  if (!ok) redirect("/")

  const sp = await searchParams
  const { range: periodRange, year, month } = readPeriod(sp)

  const [insumos, itens, periods] = await Promise.all([
    getInsumos(),
    getItensVendidos(year, month),
    getAvailablePeriods(),
  ])

  return (
    <div className="flex flex-1 flex-col gap-5 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Factory className="size-5 text-muted-foreground" />
            <h1 className="text-2xl font-semibold tracking-tight">
              Ficha Técnica
            </h1>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Converte o que as lojas vendem (itens) na demanda de insumos do ERP
            · itens de {formatRangeLabel(periodRange)}
          </p>
        </div>
        <PeriodSelector current={periodRange} options={periods} enableRange />
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-300">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Fluxo: <b>1)</b> cadastre os insumos do ERP (códigos CNP) · <b>2)</b>{" "}
          em cada item vendido, escolha os insumos que ele consome (a ficha). O
          ERP puxa a demanda pronta em{" "}
          <code className="rounded bg-sky-100 px-1 dark:bg-sky-900/40">
            GET /api/v1/demanda-insumos
          </code>
          .
        </span>
      </div>

      <InsumoImport insumos={insumos} />
      {itens.some((i) => i.ficha.length > 0) && (
        <BulkFichaAction itens={itens} insumos={insumos} />
      )}
      <ItensFichaList itens={itens} insumos={insumos} />
    </div>
  )
}
