import Link from "next/link"
import { ArrowLeft, AlertTriangle, MessageSquare } from "lucide-react"

import { PlatformLogo } from "@/components/platform-logo"
import { LojaFilter } from "@/components/shared/loja-filter"
import { PeriodSelector } from "@/components/shared/period-selector"
import { ExportPdfButton } from "@/components/shared/export-pdf-button"
import { ReportBrandLogo } from "@/components/report-brand-logo"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import { getComentariosNegativos } from "@/lib/data/avaliacoes-negativos"
import { getVisibleUnits } from "@/lib/data/units"
import { assertCanView } from "@/lib/auth/permissions"
import { fmtNum } from "@/lib/format"
import { formatPeriodLabel, formatRangeLabel } from "@/lib/period"
import { readPeriod } from "@/lib/period-helpers"

function Stars({ n }: { n: number }) {
  return (
    <span className="text-rose-500" title={`${n} de 5`}>
      {"★".repeat(Math.max(1, Math.min(5, n)))}
      <span className="text-muted-foreground/30">
        {"★".repeat(5 - Math.max(1, Math.min(5, n)))}
      </span>
    </span>
  )
}

function fmtData(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

export default async function AvaliacoesNegativosPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; inicio?: string; fim?: string; lojas?: string }>
}) {
  const sp = await searchParams
  await assertCanView("relatorios")
  const { range: periodRange, year, month, isFullMonth } = readPeriod(sp)

  const allUnits = (await getVisibleUnits())
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, code: u.code, name: u.name }))
  const lojaCodes = (sp.lojas?.split(",") ?? []).filter(Boolean)
  const scoped =
    lojaCodes.length > 0
      ? allUnits.filter((u) => lojaCodes.includes(u.code))
      : allUnits
  const ids = scoped.map((u) => u.id)
  const unitById = new Map(scoped.map((u) => [u.id, u]))

  const [comentarios, availablePeriods] = await Promise.all([
    getComentariosNegativos(year, month, ids),
    getAvailablePeriods(),
  ])

  // Quantos por loja (pra um resumo rápido)
  const porLoja = new Map<string, number>()
  for (const c of comentarios)
    porLoja.set(c.unitId, (porLoja.get(c.unitId) ?? 0) + 1)
  const piorLoja = [...porLoja.entries()].sort((a, b) => b[1] - a[1])[0]

  return (
    <div data-print="page" className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <ReportBrandLogo imgClassName="h-10 w-auto print:h-12" />
          <div>
          <Link
            href="/relatorios"
            className="mb-1 inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            data-print="hide"
          >
            <ArrowLeft className="size-3.5" />
            Hub de Relatórios
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <MessageSquare className="size-6 text-primary" />
            Comentários negativos
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Avaliações de 1 e 2 ★ com comentário, pra agir rápido ·{" "}
            {isFullMonth
              ? formatRangeLabel(periodRange)
              : formatPeriodLabel({ year, month })}
          </p>
        </div>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-print="hide">
          <LojaFilter units={allUnits} />
          <PeriodSelector
            current={periodRange}
            options={availablePeriods}
            enableRange
          />
          <ExportPdfButton />
        </div>
      </div>

      {!isFullMonth && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          <span>
            Comentários são agregados por <strong>mês</strong>. Mostrando <strong>{formatPeriodLabel({ year, month })}</strong>.
          </span>
        </div>
      )}

      {comentarios.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card p-10 text-center">
          <p className="text-sm font-medium">
            Nenhum comentário negativo neste mês 🎉
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Avaliações de 1 e 2 ★ com texto aparecem aqui quando houver.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="rounded-xl border bg-card px-5 py-4 shadow-sm">
              <div className="text-xs text-muted-foreground">
                Comentários negativos
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                {fmtNum(comentarios.length)}
              </div>
            </div>
            {piorLoja && unitById.get(piorLoja[0]) && (
              <div className="rounded-xl border bg-card px-5 py-4 shadow-sm">
                <div className="text-xs text-muted-foreground">
                  Loja com mais negativos
                </div>
                <div className="mt-1 text-lg font-semibold">
                  #{unitById.get(piorLoja[0])!.code} ·{" "}
                  {unitById.get(piorLoja[0])!.name}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {piorLoja[1]} comentário{piorLoja[1] !== 1 ? "s" : ""}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {comentarios.map((c, i) => {
              const u = unitById.get(c.unitId)
              return (
                <div
                  key={i}
                  className="rounded-xl border bg-card p-4 shadow-sm"
                >
                  <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="inline-flex items-center gap-1.5">
                      <PlatformLogo platform={c.plataforma} size="sm" />
                    </span>
                    <Stars n={c.nota} />
                    {u && (
                      <a
                        href={`/unidades/${u.code}`}
                        className="font-medium hover:underline"
                      >
                        #{u.code} · {u.name}
                      </a>
                    )}
                    {c.data && (
                      <span className="text-muted-foreground">
                        {fmtData(c.data)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-foreground/90">
                    &ldquo;{c.comentario}&rdquo;
                  </p>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
