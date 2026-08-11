import { Suspense } from "react"
import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { PeriodSelector } from "@/components/shared/period-selector"
import { ExportPdfButton } from "@/components/shared/export-pdf-button"
import { ReportBrandLogo } from "@/components/report-brand-logo"
import { AvaliacoesTab } from "@/app/(app)/unidades/[codigo]/_components/avaliacoes-tab"
import { Avaliacoes99Tab } from "@/app/(app)/unidades/[codigo]/_components/avaliacoes-99-tab"
import { AvaliacoesKeetaTab } from "@/app/(app)/unidades/[codigo]/_components/avaliacoes-keeta-tab"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import { getVisibleUnits } from "@/lib/data/units"
import { assertCanView } from "@/lib/auth/permissions"
import { getAccessibleUnitIds } from "@/lib/auth/roles"
import {
  formatPeriodLabel,
  formatRangeLabel,
  parseRangeFromSp,
  rangeIsFullMonth,
} from "@/lib/period"
import { AlertTriangle } from "lucide-react"

import { PendentesResposta } from "./_components/pendentes-resposta"
import { AvaliacoesFilters } from "./_components/avaliacoes-filters"
import { AvaliacoesNetworkDashboard } from "./_components/avaliacoes-network-dashboard"

const PLATAFORMA_LABEL: Record<PlatformId, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
  cardapioweb: "Cardápio Web",
}

/**
 * Tela /avaliacoes — vê avaliações de uma unidade numa plataforma.
 *
 * Filtros: ?unidade=01&plataforma=ifood&periodo=2026-05
 *
 * Body: reaproveita AvaliacoesTab (iFood), Avaliacoes99Tab (99 Food) ou
 * AvaliacoesKeetaTab (Keeta) que já existem na tela de detalhe da unidade.
 * Cada um já trata seu próprio empty state quando não tem dado no mês.
 */
export default async function AvaliacoesPage({
  searchParams,
}: {
  searchParams: Promise<{
    unidade?: string
    plataforma?: string
    periodo?: string
    inicio?: string
    fim?: string
    notas?: string
  }>
}) {
  const sp = await searchParams
  await assertCanView("avaliacoes")
  const periodRange = parseRangeFromSp(sp)
  const isFullMonth = rangeIsFullMonth(periodRange)
  const year = Number(periodRange.start.slice(0, 4))
  const month = Number(periodRange.start.slice(5, 7))
  const unidadeCode = sp.unidade ?? null
  const plataformaParam = ["ifood", "99food", "keeta"].includes(
    sp.plataforma ?? "",
  )
    ? (sp.plataforma as PlatformId)
    : null
  // Filtro de estrelas pros comentários (ex: "1,2" = só notas 1 e 2)
  const notasFiltro = (sp.notas ?? "")
    .split(",")
    .map((s) => Number(s))
    .filter((n) => n >= 1 && n <= 5)

  const [units, availablePeriods, accessibleIds] = await Promise.all([
    getVisibleUnits(),
    getAvailablePeriods(),
    getAccessibleUnitIds(),
  ])

  const activeUnits = units.filter((u) => u.active)
  // Escopo da visão de rede: admin/gerente (null) → undefined = rede inteira;
  // franqueado → só as lojas visíveis dele.
  const networkUnitIds =
    accessibleIds === null ? undefined : activeUnits.map((u) => u.id)
  const unitOptions = activeUnits.map((u) => ({
    code: u.code,
    name: u.name,
    // As 3 plataformas exportam avaliação (iFood, 99 Food e Keeta)
    platforms: u.platforms.filter(
      (p) => p === "ifood" || p === "99food" || p === "keeta",
    ),
  }))

  const selectedUnit = unidadeCode
    ? activeUnits.find((u) => u.code === unidadeCode)
    : null
  const availableForUnit: PlatformId[] =
    selectedUnit?.platforms.filter(
      (p): p is "ifood" | "99food" | "keeta" =>
        p === "ifood" || p === "99food" || p === "keeta",
    ) ?? []
  // Plataforma efetiva = a do query, ou a 1ª disponível na unidade
  const plataforma: PlatformId | null =
    plataformaParam && availableForUnit.includes(plataformaParam)
      ? plataformaParam
      : (availableForUnit[0] ?? null)

  return (
    <div data-print="page" className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <ReportBrandLogo imgClassName="h-10 w-auto print:h-12" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Avaliações</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {selectedUnit
                ? `#${selectedUnit.code} ${selectedUnit.name}`
                : `Visão da rede · ${
                    plataformaParam ? PLATAFORMA_LABEL[plataformaParam] : "todas as plataformas"
                  }`}{" "}
              · {formatRangeLabel(periodRange)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2" data-print="hide">
          <PeriodSelector
            current={periodRange}
            options={availablePeriods}
            enableRange
          />
          <ExportPdfButton />
        </div>
      </div>

      {!isFullMonth && (
        <div
          data-print="hide"
          className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400"
        >
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          <span>
            Avaliações são agregadas <strong>por mês</strong> nas plataformas. Mostrando dados de <strong>{formatPeriodLabel({ year, month })}</strong> (mês do início do range selecionado).
          </span>
        </div>
      )}

      <div data-print="hide">
        <AvaliacoesFilters
          unitOptions={unitOptions}
          unidadeSelected={selectedUnit?.code ?? null}
          plataformaSelected={selectedUnit ? plataforma : plataformaParam}
        />
      </div>

      {/* Fica ACIMA do corpo e fora do filtro de mês/loja: é a única parte
          da tela com prazo correndo. Suspense pra a consulta da rede não
          segurar o resto da página. */}
      <Suspense fallback={null}>
        <PendentesResposta />
      </Suspense>

      {/* Body */}
      {!selectedUnit ? (
        <AvaliacoesNetworkDashboard
          year={year}
          month={month}
          // Cardápio Web ainda não expõe avaliações (escopo `reviews`
          // não liberado), então nunca vira filtro desta tela.
          plataforma={
            plataformaParam && plataformaParam !== "cardapioweb"
              ? plataformaParam
              : null
          }
          notasFiltro={notasFiltro}
          unitIds={networkUnitIds}
        />
      ) : availableForUnit.length === 0 ? (
        <NoPlatformsState unitName={selectedUnit.name} />
      ) : plataforma === "ifood" ? (
        <AvaliacoesTab
          unitId={selectedUnit.id}
          year={year}
          month={month}
          notasFiltro={notasFiltro}
        />
      ) : plataforma === "99food" ? (
        <Avaliacoes99Tab
          unitId={selectedUnit.id}
          year={year}
          month={month}
          notasFiltro={notasFiltro}
        />
      ) : plataforma === "keeta" ? (
        <AvaliacoesKeetaTab
          unitId={selectedUnit.id}
          year={year}
          month={month}
          notasFiltro={notasFiltro}
        />
      ) : null}
    </div>
  )
}

function NoPlatformsState({ unitName }: { unitName: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-card p-10 text-center">
      <p className="text-sm font-medium">
        {unitName} não tem plataformas com avaliações
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Avaliações vêm do iFood, do 99 Food e do Keeta. Cadastre uma dessas
        plataformas em <a href="/unidades" className="underline">/unidades</a>{" "}
        pra começar.
      </p>
      <div className="mt-3 flex items-center justify-center gap-2">
        <PlatformLogo platform="ifood" size="sm" />
        <PlatformLogo platform="99food" size="sm" />
        <PlatformLogo platform="keeta" size="sm" />
      </div>
    </div>
  )
}
