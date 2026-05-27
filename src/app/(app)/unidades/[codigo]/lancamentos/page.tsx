import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { BrandLogo } from "@/components/brand-logo"
import { getUnitByCode } from "@/lib/data/units"
import {
  aggregateByDay,
  getDailyEntries,
  getMonthlyGeneral,
  getPlatformEntries,
  summarizeByPlatform,
} from "@/lib/data/lancamentos"
import { LancamentosView } from "./_components/lancamentos-view"

export default async function LancamentosPage({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string }>
  searchParams: Promise<{ ano?: string; mes?: string }>
}) {
  const { codigo } = await params
  const { ano, mes } = await searchParams

  const unit = await getUnitByCode(codigo)
  if (!unit) notFound()

  const now = new Date()
  const year = ano ? parseInt(ano, 10) : now.getFullYear()
  const month = mes ? parseInt(mes, 10) : now.getMonth() + 1

  const [dailyEntries, monthlyGeneral, platformEntries] = await Promise.all([
    getDailyEntries(unit.id, year, month),
    getMonthlyGeneral(unit.id, year, month),
    getPlatformEntries(unit.id, year, month),
  ])

  const aggregates = aggregateByDay(dailyEntries)
  const platformSummary = summarizeByPlatform(dailyEntries)

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <Link
        href={`/unidades/${unit.code}`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Voltar para {unit.name}
      </Link>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <BrandLogo size="lg" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                Lançamentos
              </h1>
              <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs font-bold tabular-nums text-muted-foreground">
                #{unit.code}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{unit.name}</p>
          </div>
        </div>
      </div>

      <LancamentosView
        unitId={unit.id}
        year={year}
        month={month}
        aggregates={aggregates}
        platformSummary={platformSummary}
        monthlyGeneral={monthlyGeneral}
        platformEntries={platformEntries}
        unitActivePlatforms={unit.platforms}
      />
    </div>
  )
}
