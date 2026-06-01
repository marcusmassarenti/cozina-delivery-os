import { Suspense } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, LayoutGrid, Upload } from "lucide-react"

import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { SectionDivider } from "@/components/shared/section-divider"
import { createAdminClient } from "@/lib/supabase/admin"
import { getVisibleUnits } from "@/lib/data/units"
import { assertCanView } from "@/lib/auth/permissions"

import { DownloadGuide } from "./_components/download-guide"
import { ImportChecklist } from "./_components/import-checklist"
import { ImportForm } from "./_components/import-form"

type ImportRow = {
  id: string
  unit_id: string
  platform: string
  report_type: string
  cadencia: string
  ref_date: string | null
  ref_year: number | null
  ref_month: number | null
  source_filename: string | null
  rows_imported: number
  status: string
  imported_at: string
}

const HISTORICO_PAGE_SIZE = 20

async function getRecentImports(page: number): Promise<{
  items: Array<ImportRow & { unitCode: string; unitName: string }>
  total: number
}> {
  const admin = createAdminClient()
  const offset = Math.max(0, (page - 1) * HISTORICO_PAGE_SIZE)

  const { data: imports, count } = await admin
    .from("platform_imports")
    .select(
      "id, unit_id, platform, report_type, cadencia, ref_date, ref_year, ref_month, source_filename, rows_imported, status, imported_at",
      { count: "exact" },
    )
    .order("imported_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + HISTORICO_PAGE_SIZE - 1)

  if (!imports || imports.length === 0) {
    return { items: [], total: count ?? 0 }
  }

  const unitIds = Array.from(new Set(imports.map((i) => i.unit_id)))
  const { data: units } = await admin
    .from("units")
    .select("id, code, name")
    .in("id", unitIds)
  const byId = new Map(
    (units ?? []).map((u) => [u.id, { code: u.code, name: u.name }]),
  )

  return {
    items: imports.map((i) => ({
      ...i,
      unitCode: byId.get(i.unit_id)?.code ?? "?",
      unitName: byId.get(i.unit_id)?.name ?? "(unidade removida)",
    })),
    total: count ?? 0,
  }
}

export default async function ImportacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; historico?: string }>
}) {
  const sp = await searchParams
  await assertCanView("importacao")
  const histPage = Math.max(1, parseInt(sp.historico ?? "1", 10) || 1)
  const units = await getVisibleUnits()
  const activeUnits = units.filter((u) => u.active)
  const availableUnitsLite = activeUnits.map((u) => ({
    id: u.id,
    code: u.code,
    name: u.name,
    platforms: u.platforms,
    externalStoreIds: u.externalStoreIds,
  }))
  const recentResult = await getRecentImports(histPage)

  const recent = recentResult.items
  const recentTotal = recentResult.total
  const recentTotalPages = Math.max(
    1,
    Math.ceil(recentTotal / HISTORICO_PAGE_SIZE),
  )

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Importação de relatórios
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Sobe os XLSX do iFood (Cardápio / Financeiro / Avaliações), do 99
            Food (Dados da loja / item / pedido) ou do Keeta (Loja diária /
            Itens / Pedidos) e o sistema converte em lançamentos.
          </p>
        </div>
        <Link
          href="/importacao/cobertura"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-xs font-medium transition-colors hover:bg-muted"
        >
          <LayoutGrid className="size-3.5" />
          Ver cobertura
        </Link>
      </div>

      <DownloadGuide />

      <Suspense fallback={<ChecklistSkeleton />}>
        <ImportChecklist />
      </Suspense>

      <SectionDivider number={1} label="Subir relatório" />
      <div className="rounded-xl border bg-card p-5">
        {activeUnits.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhuma unidade cadastrada. Vai em{" "}
            <span className="font-medium">/unidades</span> e cadastra a
            primeira loja.
          </div>
        ) : (
          <ImportForm availableUnits={availableUnitsLite} />
        )}
      </div>

      <SectionDivider number={2} label="Histórico de importações" />
      <div className="overflow-hidden rounded-xl border bg-card">
        {recent.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <Upload
              className="size-8 text-muted-foreground/50"
              strokeWidth={1.5}
            />
            <p className="text-sm font-medium">Nenhuma importação ainda</p>
            <p className="text-xs text-muted-foreground">
              Sobe o primeiro relatório acima pra começar.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Data</th>
                <th className="px-4 py-2.5 text-left font-medium">Unidade</th>
                <th className="px-4 py-2.5 text-left font-medium">Tipo</th>
                <th className="px-4 py-2.5 text-left font-medium">
                  Referência
                </th>
                <th className="px-4 py-2.5 text-right font-medium">Linhas</th>
                <th className="px-4 py-2.5 text-left font-medium">Arquivo</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums">
                    {new Date(r.imported_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "America/Sao_Paulo",
                    })}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <PlatformLogo
                        platform={asPlatformId(r.platform)}
                        size="sm"
                      />
                      <div>
                        <p className="text-sm font-medium">{r.unitName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          #{r.unitCode}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center rounded-full border bg-muted/40 px-2 py-0.5 text-[11px] font-medium capitalize">
                      {r.report_type}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {r.cadencia === "diario" && r.ref_date
                      ? new Date(r.ref_date + "T00:00:00").toLocaleDateString(
                          "pt-BR",
                        )
                      : r.ref_year && r.ref_month
                        ? `${String(r.ref_month).padStart(2, "0")}/${r.ref_year}`
                        : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                    {r.rows_imported.toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-2.5 max-w-[280px] truncate text-[11px] text-muted-foreground">
                    {r.source_filename ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        {recent.length > 0 && recentTotalPages > 1 && (
          <HistoricoPaginacao
            page={histPage}
            totalPages={recentTotalPages}
            total={recentTotal}
            periodo={sp.periodo}
          />
        )}
      </div>
    </div>
  )
}

function asPlatformId(p: string): PlatformId {
  if (p === "ifood" || p === "99food" || p === "keeta") return p
  return "ifood"
}

function HistoricoPaginacao({
  page,
  totalPages,
  total,
  periodo,
}: {
  page: number
  totalPages: number
  total: number
  periodo: string | undefined
}) {
  const prevQuery = new URLSearchParams()
  const nextQuery = new URLSearchParams()
  if (periodo) {
    prevQuery.set("periodo", periodo)
    nextQuery.set("periodo", periodo)
  }
  if (page > 2) prevQuery.set("historico", String(page - 1))
  if (page < totalPages) nextQuery.set("historico", String(page + 1))

  const prevHref =
    page > 1
      ? `/importacao${prevQuery.toString() ? `?${prevQuery.toString()}` : ""}#historico`
      : null
  const nextHref =
    page < totalPages
      ? `/importacao?${nextQuery.toString()}#historico`
      : null

  const from = (page - 1) * 20 + 1
  const to = Math.min(page * 20, total)

  return (
    <div className="flex items-center justify-between gap-2 border-t bg-muted/20 px-4 py-2.5 text-xs">
      <span className="text-muted-foreground tabular-nums">
        {from}–{to} de {total}
      </span>
      <div className="flex items-center gap-1.5">
        {prevHref ? (
          <Link
            href={prevHref}
            className="inline-flex h-7 items-center gap-1 rounded-md border bg-card px-2 font-medium hover:bg-muted"
          >
            <ChevronLeft className="size-3.5" />
            Anterior
          </Link>
        ) : (
          <span className="inline-flex h-7 items-center gap-1 rounded-md border bg-muted/40 px-2 font-medium text-muted-foreground/60">
            <ChevronLeft className="size-3.5" />
            Anterior
          </span>
        )}
        <span className="px-2 font-medium tabular-nums">
          {page} / {totalPages}
        </span>
        {nextHref ? (
          <Link
            href={nextHref}
            className="inline-flex h-7 items-center gap-1 rounded-md border bg-card px-2 font-medium hover:bg-muted"
          >
            Próxima
            <ChevronRight className="size-3.5" />
          </Link>
        ) : (
          <span className="inline-flex h-7 items-center gap-1 rounded-md border bg-muted/40 px-2 font-medium text-muted-foreground/60">
            Próxima
            <ChevronRight className="size-3.5" />
          </span>
        )}
      </div>
    </div>
  )
}

/** Esqueleto do checklist enquanto o Server Component carrega (Suspense). */
function ChecklistSkeleton() {
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-2.5 border-b px-5 py-3">
        <div className="size-8 animate-pulse rounded-md bg-muted" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-44 animate-pulse rounded bg-muted" />
          <div className="h-2.5 w-60 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-6 w-12 animate-pulse rounded-full bg-muted" />
      </div>
      <div className="grid gap-4 p-4 md:grid-cols-3">
        {[0, 1, 2].map((c) => (
          <div key={c} className="space-y-1.5">
            <div className="mb-2 h-4 w-20 animate-pulse rounded bg-muted" />
            {[0, 1, 2, 3].map((r) => (
              <div
                key={r}
                className="h-9 animate-pulse rounded-lg border bg-muted/40"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
