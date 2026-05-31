import { PlatformLogo } from "@/components/platform-logo"
import { PeriodSelector } from "@/components/shared/period-selector"
import {
  getAvailablePeriods,
  getFinanceiroResumoByUnits,
} from "@/lib/data/ifood-imported"
import {
  getNetworkPagamentoResumo,
  getPagamentoResumoForMonth,
  getVrByUnits,
} from "@/lib/data/ifood-pedidos"
import { getKeetaResumoByUnits } from "@/lib/data/keeta-imported"
import {
  getKeetaPedidoPorLoja,
  getKeetaPedidoUnitsWithData,
  getNetworkKeetaPedidoResumo,
  getKeetaPedidoResumoForMonth,
} from "@/lib/data/keeta-pedidos"
import { getNinefoodResumoByUnits } from "@/lib/data/ninefood-imported"
import {
  getNinefoodPedidoPorLoja,
  getNinefoodPedidoUnitsWithData,
  getNetworkNinefoodPedidoResumo,
  getNinefoodPedidoResumoForMonth,
} from "@/lib/data/ninefood-pedidos"
import { getUnits } from "@/lib/data/units"
import { formatPeriodLabel, parsePeriodParam } from "@/lib/period"

import { PedidosIfoodView } from "./_components/pedidos-ifood-view"
import { PedidosKeetaView } from "./_components/pedidos-keeta-view"
import { PedidosNinefoodView } from "./_components/pedidos-ninefood-view"
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
  const plataforma: "ifood" | "99food" | "keeta" =
    sp.plataforma === "keeta"
      ? "keeta"
      : sp.plataforma === "99food"
        ? "99food"
        : "ifood"

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
          const [vrByUnit, resumo, fatMap] = await Promise.all([
            getVrByUnits(year, month),
            selectedUnit
              ? getPagamentoResumoForMonth(selectedUnit.id, year, month)
              : getNetworkPagamentoResumo(year, month),
            selectedUnit
              ? Promise.resolve(null)
              : getFinanceiroResumoByUnits(ids, year, month),
          ])
          // Faturamento = bruto da conciliação; sem conciliação, cai no
          // VALOR DOS ITENS do próprio relatório de pedidos (fallback).
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
            selectedUnit
              ? getKeetaPedidoResumoForMonth(selectedUnit.id, year, month)
              : getNetworkKeetaPedidoResumo(ids, year, month),
            getKeetaPedidoUnitsWithData(year, month),
            selectedUnit
              ? Promise.resolve([])
              : getKeetaPedidoPorLoja(ids, year, month),
            selectedUnit
              ? Promise.resolve(null)
              : getKeetaResumoByUnits(ids, year, month),
          ])
          // Faturamento = vendas de itens da Loja diária; sem ela, cai no
          // preço de tabela do próprio Pedidos recentes (fallback).
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
            selectedUnit
              ? getNinefoodPedidoResumoForMonth(selectedUnit.id, year, month)
              : getNetworkNinefoodPedidoResumo(ids, year, month),
            getNinefoodPedidoUnitsWithData(year, month),
            selectedUnit
              ? Promise.resolve([])
              : getNinefoodPedidoPorLoja(ids, year, month),
            selectedUnit
              ? Promise.resolve(null)
              : getNinefoodResumoByUnits(ids, year, month),
          ])
          // Faturamento = bruto da Loja diária; sem ela, cai na receita de
          // vendas do próprio "Dados do pedido" (fallback).
          const enriched = porLoja
            .map((u) => ({
              ...u,
              faturamento: fatMap?.get(u.unitId)?.bruto || u.receitaVendas,
            }))
            .sort((a, b) => b.faturamento - a.faturamento)
          return { resumo, unitsWithData, porLoja: enriched }
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
      : plataforma === "99food"
        ? new Set(
            activeUnits
              .filter((u) => ninefood!.unitsWithData.has(u.id))
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
        <PedidosKeetaView
          resumo={keeta!.resumo}
          porLoja={selectedUnit ? undefined : keeta!.porLoja}
          periodoParam={periodoParam}
        />
      ) : plataforma === "99food" ? (
        <PedidosNinefoodView
          resumo={ninefood!.resumo}
          porLoja={selectedUnit ? undefined : ninefood!.porLoja}
          periodoParam={periodoParam}
        />
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
