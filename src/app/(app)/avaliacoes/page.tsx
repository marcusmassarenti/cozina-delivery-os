import { PlatformLogo, type PlatformId } from "@/components/platform-logo"
import { PeriodSelector } from "@/components/shared/period-selector"
import { AvaliacoesTab } from "@/app/(app)/unidades/[codigo]/_components/avaliacoes-tab"
import { Avaliacoes99Tab } from "@/app/(app)/unidades/[codigo]/_components/avaliacoes-99-tab"
import { AvaliacoesKeetaTab } from "@/app/(app)/unidades/[codigo]/_components/avaliacoes-keeta-tab"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import { getVisibleUnits } from "@/lib/data/units"
import { assertCanView } from "@/lib/auth/permissions"
import { getAccessibleUnitIds } from "@/lib/auth/roles"
import { formatPeriodLabel, parsePeriodParam } from "@/lib/period"

import { AvaliacoesFilters } from "./_components/avaliacoes-filters"
import { AvaliacoesNetworkDashboard } from "./_components/avaliacoes-network-dashboard"

const PLATAFORMA_LABEL: Record<PlatformId, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
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
    notas?: string
  }>
}) {
  const sp = await searchParams
  await assertCanView("avaliacoes")
  const { year, month } = parsePeriodParam(sp.periodo)
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
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Avaliações</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {selectedUnit
              ? `#${selectedUnit.code} ${selectedUnit.name}`
              : `Visão da rede · ${
                  plataformaParam ? PLATAFORMA_LABEL[plataformaParam] : "todas as plataformas"
                }`}{" "}
            · {formatPeriodLabel({ year, month })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSelector
            current={{ year, month }}
            options={availablePeriods}
          />
        </div>
      </div>

      <AvaliacoesFilters
        unitOptions={unitOptions}
        unidadeSelected={selectedUnit?.code ?? null}
        plataformaSelected={selectedUnit ? plataforma : plataformaParam}
      />

      {/* Body */}
      {!selectedUnit ? (
        <AvaliacoesNetworkDashboard
          year={year}
          month={month}
          plataforma={plataformaParam}
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
