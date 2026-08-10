import { PlatformLogo, type PlatformId,
  MARKETPLACES,
} from "@/components/platform-logo"
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
import { getKeetaPromocaoResumo } from "@/lib/data/keeta-promocoes"
import { getNinefoodResumoByUnits } from "@/lib/data/ninefood-imported"
import {
  getNinefoodPedidoPorLoja,
  getNinefoodPedidoUnitsWithData,
  getNetworkNinefoodPedidoResumo,
} from "@/lib/data/ninefood-pedidos"
import { getVisibleUnits } from "@/lib/data/units"
import { getOperacaoCardapioWeb } from "@/lib/data/cardapioweb-operacao"
import { assertCanView } from "@/lib/auth/permissions"
import {
  formatPeriodLabel,
  formatRangeLabel,
  parseRangeFromSp,
  rangeIsFullMonth,
} from "@/lib/period"
import { AlertTriangle } from "lucide-react"

import { PedidosIfoodView } from "./_components/pedidos-ifood-view"
import { PedidosKeetaView } from "./_components/pedidos-keeta-view"
import { PedidosNinefoodView } from "./_components/pedidos-ninefood-view"
import { PedidosPlataformaSwitcher } from "./_components/pedidos-plataforma-switcher"
import { PedidosCardapiowebView } from "./_components/pedidos-cardapioweb-view"

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
    inicio?: string
    fim?: string
    lojas?: string
    plataforma?: string
  }>
}) {
  const sp = await searchParams
  await assertCanView("pedidos")
  const periodRange = parseRangeFromSp(sp)
  const isFullMonth = rangeIsFullMonth(periodRange)
  const year = Number(periodRange.start.slice(0, 4))
  const month = Number(periodRange.start.slice(5, 7))
  const queryRange = isFullMonth ? undefined : periodRange
  const periodoParam = sp.periodo

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
  // Marketplaces + Cardápio Web. Antes só marketplace, porque a tela inteira
  // era sobre VR, subsídio e comissão — que não existem em canal próprio. A
  // aba do Cardápio Web mostra OUTRA coisa (tipo de pedido, horário, forma de
  // pagamento), então ela cabe aqui sem forçar o conceito de repasse.
  const tenantPlats: PlatformId[] = (
    [...MARKETPLACES, "cardapioweb"] as PlatformId[]
  ).filter((p) => filteredUnits.some((u) => u.platforms.includes(p)))

  // Plataforma da aba. Sem `?plataforma=` na URL, abre na PRIMEIRA que a rede
  // realmente usa — não no iFood fixo. Loja de canal próprio abria numa aba de
  // iFood vazia e parecia que o sistema não tinha dado nenhum.
  const escolhida = sp.plataforma as PlatformId | undefined
  const plataforma: "ifood" | "99food" | "keeta" | "cardapioweb" =
    escolhida && tenantPlats.includes(escolhida)
      ? (escolhida as "ifood" | "99food" | "keeta" | "cardapioweb")
      : ((tenantPlats[0] ?? "ifood") as
          | "ifood"
          | "99food"
          | "keeta"
          | "cardapioweb")

  // Dados específicos da plataforma selecionada (sempre consolidado das lojas
  // escolhidas — ou todas, se nada filtrado).
  const ifood =
    plataforma === "ifood"
      ? await (async () => {
          const [vrByUnit, resumo, fatMap] = await Promise.all([
            getVrByUnits(year, month, ids),
            getNetworkPagamentoResumo(year, month, ids),
            getFinanceiroResumoByUnits(ids, year, month, queryRange),
          ])
          const enriched = vrByUnit
            .map((u) => ({
              ...u,
              faturamento: fatMap?.get(u.unitId)?.bruto || u.valorItens,
            }))
            .sort((a, b) => b.faturamento - a.faturamento)

          // Promoção vem do EXTRATO, não da planilha de Pedidos.
          //
          // Dois motivos, os dois medidos em 10/08/26: a planilha não existe
          // nas lojas que só têm API (0 de 147.134 pedidos com incentivo
          // preenchido), e ela mostra só o bruto — o portal do iFood mostra o
          // líquido, e a diferença fazia o lojista achar que o sistema estava
          // errado. O extrato responde às duas coisas com o mesmo dado.
          const promo = ids.reduce(
            (acc, id) => {
              const f = fatMap?.get(id)
              if (!f) return acc
              return {
                loja: acc.loja + Math.abs(f.promocaoLoja),
                estorno: acc.estorno + Math.abs(f.promocaoLojaEstorno),
                ifood: acc.ifood + Math.abs(f.promocaoIfood),
              }
            },
            { loja: 0, estorno: 0, ifood: 0 },
          )
          return { vrByUnit: enriched, resumo, promo }
        })()
      : null
  const keeta =
    plataforma === "keeta"
      ? await (async () => {
          const [resumo, unitsWithData, porLoja, fatMap, promocoes] =
            await Promise.all([
              getNetworkKeetaPedidoResumo(ids, year, month),
              getKeetaPedidoUnitsWithData(year, month),
              getKeetaPedidoPorLoja(ids, year, month),
              getKeetaResumoByUnits(ids, year, month, queryRange),
              getKeetaPromocaoResumo(ids, year, month),
            ])
          const enriched = porLoja
            .map((u) => ({
              ...u,
              faturamento: fatMap?.get(u.unitId)?.bruto || u.precoOriginal,
            }))
            .sort((a, b) => b.faturamento - a.faturamento)
          return { resumo, unitsWithData, porLoja: enriched, promocoes }
        })()
      : null
  const ninefood =
    plataforma === "99food"
      ? await (async () => {
          const [resumo, unitsWithData, porLoja, fatMap] = await Promise.all([
            getNetworkNinefoodPedidoResumo(ids, year, month),
            getNinefoodPedidoUnitsWithData(year, month),
            getNinefoodPedidoPorLoja(ids, year, month),
            getNinefoodResumoByUnits(ids, year, month, queryRange),
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
  // Canal próprio: uma chamada só devolve todos os cortes (tipo de pedido,
  // horário, pagamento, cancelamento, taxas), agregados dentro do banco.
  const cw =
    plataforma === "cardapioweb"
      ? await getOperacaoCardapioWeb(ids, year, month, queryRange)
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
        : // O ramo final era um `else` sem condição, e por isso a aba nova do
          // Cardápio Web caía nele e estourava em `ifood!.vrByUnit`. Agora cada
          // plataforma diz o seu nome — é o padrão que já causou quatro bugs de
          // dinheiro neste projeto quando ficou implícito.
          plataforma === "ifood"
          ? new Set(ifood!.vrByUnit.map((u) => u.unitCode))
          : // Canal próprio não tem cobertura por planilha: ou a loja está
            // conectada e o dado vem sozinho, ou não está.
            new Set(filteredUnits.map((u) => u.code))

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
            · {dataCodes.size} com dados · {formatRangeLabel(periodRange)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PedidosPlataformaSwitcher
            current={plataforma}
            platforms={tenantPlats}
          />
          <LojaFilter
            units={activeUnits.map((u) => ({ code: u.code, name: u.name }))}
          />
          <PeriodSelector
            current={periodRange}
            options={availablePeriods}
            enableRange
          />
        </div>
      </div>

      {!isFullMonth && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          <span>
            Período personalizado <strong>{formatRangeLabel(periodRange)}</strong> — resumos das plataformas filtram por dia; algumas seções específicas (pagamento, VR por bandeira, cardápio) podem mostrar o mês inteiro de {formatPeriodLabel({ year, month })}.
          </span>
        </div>
      )}

      {plataforma === "cardapioweb" ? (
        <PedidosCardapiowebView op={cw!} lojas={filteredUnits.length} />
      ) : plataforma === "keeta" ? (
        <PedidosKeetaView
          resumo={keeta!.resumo}
          porLoja={keeta!.porLoja}
          promocoes={keeta!.promocoes}
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
          promo={ifood!.promo}
          vrByUnit={ifood!.vrByUnit}
          selectedUnit={null}
          activeUnitsCount={filteredUnits.length}
          periodoParam={periodoParam}
        />
      )}
    </div>
  )
}
