import {
  CalendarRange,
  Eye,
  MousePointerClick,
  ShoppingBag,
  ShoppingCart,
  CheckCircle2,
  TrendingUp,
} from "lucide-react"

import {
  getCardapioPeriodoForMonth,
  getComplementosRankingForMonth,
  getFunnelForMonth,
  getItemsRankingForMonth,
} from "@/lib/data/ifood-imported"
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format"

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

  return (
    <div className="flex flex-col gap-6">
      {/* Snapshot do período (se houver) — vem do XLSX consolidado da rede */}
      {periodoSnapshot && (
        <div className="rounded-xl border border-l-4 border-l-indigo-500 bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <CalendarRange className="size-4 text-indigo-600" />
            <h3 className="text-sm font-semibold">
              Snapshot do período · {periodoSnapshot.periodLabel}
            </h3>
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            <PeriodStat
              icon={Eye}
              label="Visitas"
              value={periodoSnapshot.visitas}
              anterior={periodoSnapshot.visitasAnterior}
            />
            <PeriodStat
              icon={MousePointerClick}
              label="Visualizações"
              value={periodoSnapshot.visualizacoes}
              base={periodoSnapshot.visitas}
            />
            <PeriodStat
              icon={ShoppingBag}
              label="Sacola"
              value={periodoSnapshot.sacola}
              base={periodoSnapshot.visitas}
            />
            <PeriodStat
              icon={ShoppingCart}
              label="Revisão"
              value={periodoSnapshot.revisao}
              base={periodoSnapshot.visitas}
            />
            <PeriodStat
              icon={CheckCircle2}
              label="Concluídos"
              value={periodoSnapshot.concluidos}
              anterior={periodoSnapshot.concluidosAnterior}
              base={periodoSnapshot.visitas}
              positive
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

      {funnel.diasComDado > 0 && (
      <>
      {/* Funil de conversão (do diário, se houver) */}
      <div className="rounded-xl border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Funil de conversão (diário acumulado)</h3>
          <span className="text-[11px] text-muted-foreground">
            {funnel.diasComDado} dia{funnel.diasComDado > 1 ? "s" : ""} com dado
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-5">
          <FunnelStep
            label="Visitas"
            value={funnel.visitas}
            icon={Eye}
            tone="neutral"
          />
          <FunnelStep
            label="Visualizações"
            value={funnel.visualizacoes}
            icon={MousePointerClick}
            base={funnel.visitas}
            tone="neutral"
          />
          <FunnelStep
            label="Sacola"
            value={funnel.sacola}
            icon={ShoppingBag}
            base={funnel.visitas}
            tone="neutral"
          />
          <FunnelStep
            label="Revisão"
            value={funnel.revisao}
            icon={ShoppingCart}
            base={funnel.visitas}
            tone="neutral"
          />
          <FunnelStep
            label="Concluídos"
            value={funnel.concluidos}
            icon={CheckCircle2}
            base={funnel.visitas}
            tone="positive"
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

      {/* Top itens + complementos lado a lado (vem do período se houver, senão do diário) */}
      {(items.length > 0 || complementos.length > 0) && (
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card overflow-hidden">
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
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Item</th>
                  <th className="px-4 py-2 text-right font-medium">Qtd</th>
                  <th className="px-4 py-2 text-right font-medium">Conv.</th>
                  <th className="px-4 py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={`${it.nomeItem}-${i}`} className="border-t">
                    <td className="px-4 py-2.5">
                      <p className="line-clamp-1 text-xs font-medium">
                        {it.nomeItem}
                      </p>
                      {it.qtdComPromocao > 0 && (
                        <p className="text-[10px] text-amber-700 dark:text-amber-400">
                          {it.qtdComPromocao} c/ promoção
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                      {fmtNum(it.qtdVendida)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums text-muted-foreground">
                      {fmtPct(it.conversaoPctMedia)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums">
                      {fmtBRL(it.valorTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-xl border bg-card overflow-hidden">
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
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">
                    Complemento
                  </th>
                  <th className="px-4 py-2 text-right font-medium">Pedidos</th>
                  <th className="px-4 py-2 text-right font-medium">Qtd</th>
                </tr>
              </thead>
              <tbody>
                {complementos.map((c, i) => (
                  <tr key={`${c.nomeComplemento}-${i}`} className="border-t">
                    <td className="px-4 py-2.5">
                      <p className="line-clamp-1 text-xs font-medium">
                        {c.nomeComplemento}
                      </p>
                      {c.classificacao && (
                        <p className="text-[10px] text-muted-foreground">
                          {c.classificacao}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums">
                      {fmtNum(c.pedidos)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums text-muted-foreground">
                      {fmtNum(c.qtdVendida)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      )}
    </div>
  )
}

function PeriodStat({
  icon: Icon,
  label,
  value,
  anterior,
  base,
  positive,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  anterior?: number | null
  base?: number
  positive?: boolean
}) {
  const pct = base && base > 0 ? (value / base) * 100 : null
  const diff =
    anterior != null && anterior > 0
      ? ((value - anterior) / anterior) * 100
      : null
  return (
    <div
      className={`rounded-lg border p-3 ${
        positive
          ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20"
          : "bg-muted/30"
      }`}
    >
      <div className="flex items-center justify-between">
        <Icon className="size-3.5 text-muted-foreground" />
        {pct !== null && (
          <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
            {pct.toFixed(1)}%
          </span>
        )}
      </div>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-0.5 text-xl font-bold tabular-nums ${
          positive ? "text-emerald-700 dark:text-emerald-400" : ""
        }`}
      >
        {value.toLocaleString("pt-BR")}
      </p>
      {diff != null && (
        <p
          className={`mt-0.5 text-[10px] tabular-nums ${
            diff >= 0 ? "text-emerald-600" : "text-rose-600"
          }`}
        >
          {diff >= 0 ? "+" : ""}
          {diff.toFixed(1)}% vs ant.
        </p>
      )}
    </div>
  )
}

function FunnelStep({
  label,
  value,
  icon: Icon,
  base,
  tone,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  base?: number
  tone: "neutral" | "positive"
}) {
  const pct = base && base > 0 ? (value / base) * 100 : null
  return (
    <div
      className={`rounded-lg border p-3 ${
        tone === "positive"
          ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20"
          : "bg-muted/30"
      }`}
    >
      <div className="flex items-center justify-between">
        <Icon className="size-3.5 text-muted-foreground" />
        {pct !== null && (
          <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
            {pct.toFixed(1)}%
          </span>
        )}
      </div>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-0.5 text-xl font-bold tabular-nums ${
          tone === "positive" ? "text-emerald-700 dark:text-emerald-400" : ""
        }`}
      >
        {fmtNum(value)}
      </p>
    </div>
  )
}
