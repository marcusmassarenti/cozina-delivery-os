import { PlatformLogo } from "@/components/platform-logo"
import { PeriodSelector } from "@/components/shared/period-selector"
import { getAvailablePeriods } from "@/lib/data/ifood-imported"
import {
  getNetworkPagamentoResumo,
  getPagamentoResumoForMonth,
  getVrByUnits,
} from "@/lib/data/ifood-pedidos"
import {
  getKeetaPedidoUnitsWithData,
  getNetworkKeetaPedidoResumo,
  getKeetaPedidoResumoForMonth,
} from "@/lib/data/keeta-pedidos"
import { getUnits } from "@/lib/data/units"
import { formatPeriodLabel, parsePeriodParam } from "@/lib/period"

import { PedidosIfoodView } from "./_components/pedidos-ifood-view"
import { PedidosKeetaView } from "./_components/pedidos-keeta-view"
import { PedidosPlataformaSwitcher } from "./_components/pedidos-plataforma-switcher"
import { PedidosUnitFilter } from "./_components/pedidos-unit-filter"

/**
 * Tela /pedidos — detalhe do "Relatório de pedidos" por plataforma.
 *  - iFood: forma de pagamento + VR por bandeira (Sodexo/Alelo/Ticket/VR).
 *  - Keeta: subsídio (Keeta×loja), taxas granulares e campanhas (a Keeta
 *    não reporta forma de pagamento/VR).
 * Seletor de plataforma + loja. NÃO é faturamento.
 */
export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; loja?: string; plataforma?: string }>
}) {
  const sp = await searchParams
  const { year, month } = parsePeriodParam(sp.periodo)
  const periodoParam = sp.periodo
  const lojaParam = sp.loja ?? null
  const plataforma: "ifood" | "keeta" =
    sp.plataforma === "keeta" ? "keeta" : "ifood"

  const [allUnits, availablePeriods] = await Promise.all([
    getUnits(),
    getAvailablePeriods(),
  ])
  const activeUnits = allUnits.filter((u) => u.active)
  const selectedUnit = lojaParam
    ? activeUnits.find((u) => u.code === lojaParam) ?? null
    : null
  const ids = activeUnits.map((u) => u.id)

  // Dados específicos da plataforma selecionada.
  const ifood =
    plataforma === "ifood"
      ? await (async () => {
          const [vrByUnit, resumo] = await Promise.all([
            getVrByUnits(year, month),
            selectedUnit
              ? getPagamentoResumoForMonth(selectedUnit.id, year, month)
              : getNetworkPagamentoResumo(year, month),
          ])
          return { vrByUnit, resumo }
        })()
      : null
  const keeta =
    plataforma === "keeta"
      ? await (async () => {
          const [resumo, unitsWithData] = await Promise.all([
            selectedUnit
              ? getKeetaPedidoResumoForMonth(selectedUnit.id, year, month)
              : getNetworkKeetaPedidoResumo(ids, year, month),
            getKeetaPedidoUnitsWithData(year, month),
          ])
          return { resumo, unitsWithData }
        })()
      : null

  // Cobertura (lojas com dado) por plataforma — alimenta o filtro de loja.
  const dataCodes =
    plataforma === "keeta"
      ? new Set(
          activeUnits
            .filter((u) => keeta!.unitsWithData.has(u.id))
            .map((u) => u.code),
        )
      : new Set(ifood!.vrByUnit.map((u) => u.unitCode))

  const unitOptions = activeUnits.map((u) => ({
    code: u.code,
    name: u.name,
    hasData: dataCodes.has(u.code),
  }))

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
            <PlatformLogo platform={plataforma} size="sm" />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {selectedUnit
              ? `#${selectedUnit.code} ${selectedUnit.name}`
              : `Todas as lojas · ${dataCodes.size} com dados`}{" "}
            · {formatPeriodLabel({ year, month })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PedidosPlataformaSwitcher current={plataforma} />
          <PedidosUnitFilter units={unitOptions} current={lojaParam} />
          <PeriodSelector current={{ year, month }} options={availablePeriods} />
        </div>
      </div>

      {plataforma === "keeta" ? (
        <PedidosKeetaView resumo={keeta!.resumo} />
      ) : (
        <PedidosIfoodView
          resumo={ifood!.resumo}
          vrByUnit={ifood!.vrByUnit}
          selectedUnit={selectedUnit}
          activeUnitsCount={activeUnits.length}
          periodoParam={periodoParam}
        />
      )}
    </div>
  )
}
