import { CalendarRange, TrendingUp } from "lucide-react"

import {
  getCardapioPeriodoForMonth,
  getComplementosRankingForMonth,
  getFunnelForMonth,
  getItemsRankingForMonth,
} from "@/lib/data/ifood-imported"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"
import { FunnelCard } from "./funnel-card"

export async function CardapioTab({
  unitId,
  year,
  month,
}: {
  unitId: string
  year: number
  month: number
}) {
  const [funnel, items, complementos, periodoSnapshot] = await Promise.all([
    getFunnelForMonth(unitId, year, month),
    getItemsRankingForMonth(unitId, year, month, 10),
    getComplementosRankingForMonth(unitId, year, month, 10),
    getCardapioPeriodoForMonth(unitId, year, month),
  ])

  if (funnel.diasComDado === 0 && !periodoSnapshot) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-10 text-center">
        <p className="text-sm font-medium">Sem dados de Cardápio importados</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Sobe relatórios de Cardápio em{" "}
          <a href="/importacao" className="underline">
            /importacao
          </a>
          . Pode ser 1 dia (diário) ou um período (mensal da rede).
        </p>
      </div>
    )
  }

  // Máximos pras barras relativas do ranking.
  const maxItemValor = Math.max(0, ...items.map((it) => it.valorTotal))
  const maxCompPedidos = Math.max(0, ...complementos.map((c) => c.pedidos))

  return (
    <div className="flex flex-col gap-6">
      {/* Funil de conversão do PERÍODO (mês inteiro) — fonte preferida. */}
      {periodoSnapshot && (
        <div className="rounded-xl border border-l-4 border-l-indigo-500 bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <CalendarRange className="size-4 text-indigo-600" />
            <h3 className="text-sm font-semibold">
              Funil de conversão · {periodoSnapshot.periodLabel}
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            <FunnelCard
              label="Visitas"
              value={periodoSnapshot.visitas}
              base={periodoSnapshot.visitas}
              legenda="Visitaram o cardápio"
              deltaPct={pctDelta(
                periodoSnapshot.visitas,
                periodoSnapshot.visitasAnterior,
              )}
            />
            <FunnelCard
              label="Visualizações"
              value={periodoSnapshot.visualizacoes}
              base={periodoSnapshot.visitas}
              legenda="Viram algum item"
            />
            <FunnelCard
              label="Sacola"
              value={periodoSnapshot.sacola}
              base={periodoSnapshot.visitas}
              legenda="Adicionaram à sacola"
            />
            <FunnelCard
              label="Revisão"
              value={periodoSnapshot.revisao}
              base={periodoSnapshot.visitas}
              legenda="Revisaram o pedido"
            />
            <FunnelCard
              label="Concluídos"
              value={periodoSnapshot.concluidos}
              base={periodoSnapshot.visitas}
              legenda="Concluíram o pedido"
              positive
              deltaPct={pctDelta(
                periodoSnapshot.concluidos,
                periodoSnapshot.concluidosAnterior,
              )}
            />
          </div>
          <div className="mt-3 flex items-center justify-between rounded-md bg-indigo-50 px-3 py-2 dark:bg-indigo-950/30">
            <span className="text-xs font-medium text-indigo-900 dark:text-indigo-300">
              Conversão do período
            </span>
            <div className="flex items-center gap-3 tabular-nums">
              <span className="text-lg font-bold text-indigo-700 dark:text-indigo-400">
                {fmtPct(periodoSnapshot.conversaoPct)}
              </span>
              {periodoSnapshot.conversaoPctAnterior != null && (
                <span className="text-[10px] text-muted-foreground">
                  ant. {fmtPct(periodoSnapshot.conversaoPctAnterior)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {funnel.diasComDado > 0 && !periodoSnapshot && (
      <>
      {/* Funil de conversão do DIÁRIO — só quando NÃO há snapshot do período
          (senão vira card redundante/parcial ao lado do snapshot completo). */}
      <div className="rounded-xl border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Funil de conversão</h3>
          <span className="text-[11px] text-muted-foreground">
            {funnel.diasComDado} dia{funnel.diasComDado > 1 ? "s" : ""} com dado
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          <FunnelCard
            label="Visitas"
            value={funnel.visitas}
            base={funnel.visitas}
            legenda="Visitaram o cardápio"
          />
          <FunnelCard
            label="Visualizações"
            value={funnel.visualizacoes}
            base={funnel.visitas}
            legenda="Viram algum item"
          />
          <FunnelCard
            label="Sacola"
            value={funnel.sacola}
            base={funnel.visitas}
            legenda="Adicionaram à sacola"
          />
          <FunnelCard
            label="Revisão"
            value={funnel.revisao}
            base={funnel.visitas}
            legenda="Revisaram o pedido"
          />
          <FunnelCard
            label="Concluídos"
            value={funnel.concluidos}
            base={funnel.visitas}
            legenda="Concluíram o pedido"
            positive
          />
        </div>
        <div className="mt-4 flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-900 dark:text-emerald-300">
              Conversão geral
            </span>
          </div>
          <span className="text-lg font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
            {fmtPct(funnel.conversaoPct)}
          </span>
        </div>
      </div>
      </>
      )}

      {/* Sem itens (só veio o funil do consolidado da rede) — explica como ver. */}
      {items.length === 0 && complementos.length === 0 && (
        <div className="rounded-xl border border-dashed bg-card p-5">
          <p className="text-sm font-medium">
            Produtos vendidos desta loja ainda não disponíveis
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            O funil acima veio do <b>Cardápio consolidado da rede</b>, que lista os
            produtos só no total da marca (a planilha não separa item por loja).
            Pra ver os <b>produtos vendidos desta loja</b>, exporte na iFood o
            relatório de <b>Cardápio individual da loja</b> (uma loja por vez) e
            suba em{" "}
            <a href="/importacao" className="underline">
              /importacao
            </a>
            .
          </p>
        </div>
      )}

      {/* Top itens + complementos lado a lado (ranking com barra relativa) */}
      {(items.length > 0 || complementos.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="border-b px-5 py-3">
              <h3 className="text-sm font-semibold">Top itens vendidos</h3>
              <p className="text-[11px] text-muted-foreground">
                Por valor total no período
              </p>
            </div>
            {items.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Sem itens registrados
              </div>
            ) : (
              <div className="flex flex-col divide-y">
                {items.map((it, i) => (
                  <div
                    key={`${it.nomeItem}-${i}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
                  >
                    <RankBadge n={i + 1} />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-xs font-medium">
                        {it.nomeItem}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-emerald-500/70"
                            style={{
                              width: `${maxItemValor > 0 ? (it.valorTotal / maxItemValor) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        {it.qtdComPromocao > 0 && (
                          <span className="shrink-0 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                            {it.qtdComPromocao} c/ promo
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold tabular-nums">
                        {fmtBRL(it.valorTotal)}
                      </p>
                      <p className="text-[10px] tabular-nums text-muted-foreground">
                        {fmtNum(it.qtdVendida)} un · {fmtPct(it.conversaoPctMedia)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="border-b px-5 py-3">
              <h3 className="text-sm font-semibold">Top complementos</h3>
              <p className="text-[11px] text-muted-foreground">
                O que o cliente mais escolhe junto
              </p>
            </div>
            {complementos.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Sem complementos registrados
              </div>
            ) : (
              <div className="flex flex-col divide-y">
                {complementos.map((c, i) => (
                  <div
                    key={`${c.nomeComplemento}-${i}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
                  >
                    <RankBadge n={i + 1} />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-xs font-medium">
                        {c.nomeComplemento}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-indigo-500/70"
                            style={{
                              width: `${maxCompPedidos > 0 ? (c.pedidos / maxCompPedidos) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        {c.classificacao && (
                          <span className="line-clamp-1 shrink-0 text-[10px] text-muted-foreground">
                            {c.classificacao}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold tabular-nums">
                        {fmtNum(c.pedidos)}
                      </p>
                      <p className="text-[10px] tabular-nums text-muted-foreground">
                        {fmtNum(c.qtdVendida)} un
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** Variação % de `value` vs `anterior` (null quando não dá pra calcular). */
function pctDelta(value: number, anterior?: number | null): number | null {
  return anterior != null && anterior > 0
    ? ((value - anterior) / anterior) * 100
    : null
}

/** Selo de posição no ranking — top 3 em destaque. */
function RankBadge({ n }: { n: number }) {
  return (
    <span
      className={`flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums ${
        n <= 3
          ? "bg-primary/15 text-primary"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {n}
    </span>
  )
}
