import { PlatformLogo } from "@/components/platform-logo"
import { LojaFilter } from "@/components/shared/loja-filter"
import { PeriodSelector } from "@/components/shared/period-selector"
import {
  getAvailablePeriods,
  getFinanceiroResumoByUnits,
} from "@/lib/data/ifood-imported"
import {
  getNetworkPagamentoResumo,
  getVrByUnits,
} from "@/lib/data/ifood-pedidos"
import { getKeetaResumoByUnits } from "@/lib/data/keeta-imported"
import {
  getKeetaPedidoPorLoja,
  getKeetaPedidoUnitsWithData,
  getNetworkKeetaPedidoResumo,
} from "@/lib/data/keeta-pedidos"
import { getNinefoodResumoByUnits } from "@/lib/data/ninefood-imported"
import {
  getNinefoodPedidoPorLoja,
  getNinefoodPedidoUnitsWithData,
  getNetworkNinefoodPedidoResumo,
} from "@/lib/data/ninefood-pedidos"
import { getVisibleUnits } from "@/lib/data/units"
import { assertCanView } from "@/lib/auth/permissions"
import { formatPeriodLabel, parsePeriodParam } from "@/lib/period"

import { PedidosIfoodView } from "./_components/pedidos-ifood-view"
import { PedidosKeetaView } from "./_components/pedidos-keeta-view"
import { PedidosNinefoodView } from "./_components/pedidos-ninefood-view"
import { PedidosPlataformaSwitcher } from "./_components/pedidos-plataforma-switcher"

/**
 * Tela /pedidos — detalhe do "Relatório de pedidos" por plataforma.
 *  - iFood: forma de pagamento + VR por bandeira (Sodexo/Alelo/Ticket/VR).
 *  - Keeta: subsídio (Keeta×loja), taxas granulares e campanhas.
 *  - 99 Food: idem.
 * Seletor de plataforma + filtro de lojas (multi). NÃO é faturamento.
 */
export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{
    periodo?: string
    lojas?: string
    plataforma?: string
  }>
}) {
  const sp = await searchParams
  await assertCanView("pedidos")
  const { year, month } = parsePeriodParam(sp.periodo)
  const periodoParam = sp.periodo
  const plataforma: "ifood" | "99food" | "keeta" =
    sp.plataforma === "keeta"
      ? "keeta"
      : sp.plataforma === "99food"
        ? "99food"
        : "ifood"

  const [allUnits, availablePeriods] = await Promise.all([
    getVisibleUnits(),
    getAvailablePeriods(),
  ])
  const activeUnits = allUnits.filter((u) => u.active)
  const lojaCodes = (sp.lojas?.split(",") ?? []).filter(Boolean)
  const filteredUnits =
    lojaCodes.length > 0
      ? activeUnits.filter((u) => lojaCodes.includes(u.code))
      : activeUnits
  const ids = filteredUnits.map((u) => u.id)

  // Dados específicos da plataforma selecionada (sempre consolidado das lojas
  // escolhidas — ou todas, se nada filtrado).
  const ifood =
    plataforma === "ifood"
      ? await (async () => {
          const [vrByUnit, resumo, fatMap] = await Promise.all([
            getVrByUnits(year, month, ids),
            getNetworkPagamentoResumo(year, month, ids),
            getFinanceiroResumoByUnits(ids, year, month),
          ])
          const enriched = vrByUnit
            .map((u) => ({
              ...u,
              faturamento: fatMap?.get(u.unitId)?.bruto || u.valorItens,
            }))
            .sort((a, b) => b.faturamento - a.faturamento)
          return { vrByUnit: enriched, resumo }
        })()
      : null
  const keeta =
    plataforma === "keeta"
      ? await (async () => {
          const [resumo, unitsWithData, porLoja, fatMap] = await Promise.all([
            getNetworkKeetaPedidoResumo(ids, year, month),
            getKeetaPedidoUnitsWithData(year, month),
            getKeetaPedidoPorLoja(ids, year, month),
            getKeetaResumoByUnits(ids, year, month),
          ])
          const enriched = porLoja
            .map((u) => ({
              ...u,
              faturamento: fatMap?.get(u.unitId)?.bruto || u.precoOriginal,
            }))
            .sort((a, b) => b.faturamento - a.faturamento)
          return { resumo, unitsWithData, porLoja: enriched }
        })()
      : null
  const ninefood =
    plataforma === "99food"
      ? await (async () => {
          const [resumo, unitsWithData, porLoja, fatMap] = await Promise.all([
            getNetworkNinefoodPedidoResumo(ids, year, month),
            getNinefoodPedidoUnitsWithData(year, month),
            getNinefoodPedidoPorLoja(ids, year, month),
            getNinefoodResumoByUnits(ids, year, month),
          ])
          const enriched = porLoja
            .map((u) => ({
              ...u,
              faturamento: fatMap?.get(u.unitId)?.bruto || u.receitaVendas,
            }))
            .sort((a, b) => b.faturamento - a.faturamento)
          return { resumo, unitsWithData, porLoja: enriched }
        })()
      : null

  // Cobertura (lojas com dado) por plataforma — pro texto de consolidado.
  const dataCodes =
    plataforma === "keeta"
      ? new Set(
          filteredUnits
            .filter((u) => keeta!.unitsWithData.has(u.id))
            .map((u) => u.code),
        )
      : plataforma === "99food"
        ? new Set(
            filteredUnits
              .filter((u) => ninefood!.unitsWithData.has(u.id))
              .map((u) => u.code),
          )
        : new Set(ifood!.vrByUnit.map((u) => u.unitCode))

  return (
    <div className="flex flex-1 flex-col gap-6 bg-muted/30 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
            <PlatformLogo platform={plataforma} size="sm" />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {lojaCodes.length > 0
              ? `${filteredUnits.length} loja${filteredUnits.length === 1 ? "" : "s"}`
              : "Todas as lojas"}{" "}
            · {dataCodes.size} com dados · {formatPeriodLabel({ year, month })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PedidosPlataformaSwitcher current={plataforma} />
          <LojaFilter
            units={activeUnits.map((u) => ({ code: u.code, name: u.name }))}
          />
          <PeriodSelector current={{ year, month }} options={availablePeriods} />
        </div>
      </div>

      {plataforma === "keeta" ? (
        <PedidosKeetaView
          resumo={keeta!.resumo}
          porLoja={keeta!.porLoja}
          periodoParam={periodoParam}
        />
      ) : plataforma === "99food" ? (
        <PedidosNinefoodView
          resumo={ninefood!.resumo}
          porLoja={ninefood!.porLoja}
          periodoParam={periodoParam}
        />
      ) : (
        <PedidosIfoodView
          resumo={ifood!.resumo}
          vrByUnit={ifood!.vrByUnit}
          selectedUnit={null}
          activeUnitsCount={filteredUnits.length}
          periodoParam={periodoParam}
        />
      )}
    </div>
  )
}
