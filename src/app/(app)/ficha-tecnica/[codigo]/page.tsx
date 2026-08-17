import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"

import { requireAdmin } from "@/lib/auth/guards"
import { isProPlan } from "@/lib/data/billing"
import { getVisibleUnits } from "@/lib/data/units"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import { getCustoItens } from "@/lib/data/custo-itens"
import { PeriodSelector } from "@/components/shared/period-selector"
import { formatRangeLabel } from "@/lib/period"
import { readPeriod } from "@/lib/period-helpers"

import { BancadaCusto } from "./_components/bancada-custo"
import { PainelCusto } from "./_components/painel-custo"
import { Abas } from "./_components/abas"
import { PlanilhaCustos } from "./_components/planilha-custos"

export const metadata = { title: "Ficha Técnica — Delivery OS" }

/**
 * A loja: preencher os custos (Custos) ou ler o resultado (Painel).
 *
 * As duas abas leem O MESMO `getCustoItens` — o painel não recalcula nada por
 * conta própria. Duas contas para o mesmo número divergem, e quando divergem
 * ninguém sabe qual acreditar.
 */
export default async function FichaTecnicaLojaPage({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string }>
  searchParams: Promise<{
    periodo?: string
    inicio?: string
    fim?: string
    aba?: string
  }>
}) {
  if (!(await isProPlan())) redirect("/ficha-tecnica")

  let ok = false
  try {
    await requireAdmin()
    ok = true
  } catch {
    // não-admin
  }
  if (!ok) redirect("/inicio")

  const { codigo } = await params
  const sp = await searchParams
  const { range: periodRange, year, month } = readPeriod(sp)

  const units = await getVisibleUnits()
  const loja = units.find((u) => u.code === decodeURIComponent(codigo))
  // Loja fora do escopo cai aqui igual loja inexistente: quem digitar o código
  // do vizinho na URL não descobre se ele existe.
  if (!loja) notFound()

  const [resumo, periods] = await Promise.all([
    getCustoItens(loja.id, year, month),
    getAvailablePeriods(),
  ])

  const aba = sp.aba === "painel" ? "painel" : "custos"
  const q = sp.periodo ? `?periodo=${sp.periodo}` : ""

  return (
    <div className="flex flex-1 flex-col gap-4 bg-muted/30 p-6">
      <div data-print="hide" className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            href={`/ficha-tecnica${q}`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" />
            Ficha Técnica
          </Link>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">
            {loja.name}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {aba === "custos"
              ? "Digite o custo de cada item e veja quanto sobra depois da comissão"
              : "O resultado do que você preencheu"}{" "}
            · {formatRangeLabel(periodRange)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Abas codigo={loja.code} aba={aba} />
          <PeriodSelector current={periodRange} options={periods} enableRange />
        </div>
      </div>

      {aba === "custos" ? (
        <>
          <PlanilhaCustos
            unitId={loja.id}
            lojaNome={loja.name}
            itens={resumo.itens}
          />
          <BancadaCusto
            unitId={loja.id}
            lojaNome={loja.name}
            resumo={resumo}
          />
        </>
      ) : (
        <PainelCusto lojaNome={loja.name} periodo={formatRangeLabel(periodRange)} resumo={resumo} />
      )}
    </div>
  )
}
