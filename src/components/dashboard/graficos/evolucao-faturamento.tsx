import "server-only"

import type { PlatformId } from "@/components/platform-logo"
import { getUnitMetricsForMonth } from "@/lib/data/comparativo"
import {
  getAvaliacoesByUnitForMonth,
  type UnitAvaliacaoRow,
} from "@/lib/data/avaliacoes-network"
import { GraficoPrincipal, type SerieEvolucao } from "./faturamento-evolucao-chart"

const MESES = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
]
const PLATS: PlatformId[] = ["ifood", "99food", "keeta"]

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Roda `fn` sobre `items` com no máximo `limit` em paralelo. Sem isso, buscar
 * 3 plataformas × N meses (+ avaliações) de uma vez sobrecarrega o Postgres e
 * dá "statement timeout". Aqui a latência sobe um pouco, mas fica dentro do
 * <Suspense> (não trava o dashboard).
 */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let idx = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (idx < items.length) {
        const cur = idx++
        out[cur] = await fn(items[cur])
      }
    }),
  )
  return out
}

type MesPlat = { bruto: number; liquido: number; pedidos: number; cancelados: number }

/** Nota média da rede num canal, no mês (ponderada pelo nº de avaliações). */
function notaMes(rows: UnitAvaliacaoRow[], canal: PlatformId): number | null {
  let soma = 0
  let tot = 0
  for (const r of rows) {
    const nm =
      canal === "ifood"
        ? r.notaMediaIfood
        : canal === "99food"
          ? r.notaMedia99
          : r.notaMediaKeeta
    const t =
      canal === "ifood"
        ? r.totalIfood
        : canal === "99food"
          ? r.total99
          : r.totalKeeta
    if (nm != null && t > 0) {
      soma += nm * t
      tot += t
    }
  }
  return tot > 0 ? r2(soma / tot) : null
}

/**
 * Card "Evolução da rede" — gráfico mês a mês com seletor de métrica, TODAS por
 * plataforma (iFood/99/Keeta): Faturamento, Ticket, Pedidos, Nota e
 * Cancelamento. Server Component async; o page.tsx envolve num <Suspense>.
 */
export async function EvolucaoFaturamento({
  unitIds,
  year,
  month,
  metricas,
  escopo = "da rede",
}: {
  unitIds: string[]
  year: number
  month: number
  metricas?: string[]
  /** Genitivo do escopo pro título: "da rede" | "da loja" | "das lojas". */
  escopo?: string
}) {
  const periods = Array.from({ length: month }, (_, i) => ({
    year,
    month: i + 1,
  }))

  // Uma tarefa por (mês × plataforma), com concorrência limitada.
  const tarefas: { i: number; plat: PlatformId }[] = []
  periods.forEach((_, i) => PLATS.forEach((plat) => tarefas.push({ i, plat })))

  const [flat, avals] = await Promise.all([
    mapLimit(tarefas, 5, async (t) => {
      const map = await getUnitMetricsForMonth(
        unitIds,
        [t.plat],
        year,
        periods[t.i].month,
      )
      const agg: MesPlat = { bruto: 0, liquido: 0, pedidos: 0, cancelados: 0 }
      for (const m of map.values()) {
        agg.bruto += m.bruto
        agg.liquido += m.liquido
        agg.pedidos += m.pedidos
        agg.cancelados += m.cancelados
      }
      return { i: t.i, plat: t.plat, agg }
    }),
    mapLimit(periods, 4, (p) =>
      getAvaliacoesByUnitForMonth(p.year, p.month, unitIds),
    ),
  ])

  // Reindexa: byPlat[plataforma][mês].
  const byPlat: Record<PlatformId, MesPlat[]> = {
    ifood: periods.map(() => ({ bruto: 0, liquido: 0, pedidos: 0, cancelados: 0 })),
    "99food": periods.map(() => ({ bruto: 0, liquido: 0, pedidos: 0, cancelados: 0 })),
    keeta: periods.map(() => ({ bruto: 0, liquido: 0, pedidos: 0, cancelados: 0 })),
  }
  for (const r of flat) byPlat[r.plat][r.i] = r.agg

  const brutoMes = periods.map(
    (_, i) => byPlat.ifood[i].bruto + byPlat["99food"][i].bruto + byPlat.keeta[i].bruto,
  )
  const primeiro = brutoMes.findIndex((v) => v > 0)
  const idxs =
    primeiro < 0 ? [] : periods.map((_, i) => i).filter((i) => i >= primeiro)

  const porPlat = (fn: (m: MesPlat) => number | null) => ({
    ifood: idxs.map((i) => fn(byPlat.ifood[i])),
    ninefood: idxs.map((i) => fn(byPlat["99food"][i])),
    keeta: idxs.map((i) => fn(byPlat.keeta[i])),
  })

  const serie: SerieEvolucao = {
    meses: idxs.map((i) => MESES[periods[i].month - 1] ?? String(periods[i].month)),
    faturamento: porPlat((m) => Math.round(m.bruto)),
    ticket: porPlat((m) => (m.pedidos > 0 ? r2(m.bruto / m.pedidos) : null)),
    pedidos: porPlat((m) => m.pedidos),
    cancelamento: porPlat((m) =>
      m.pedidos > 0 ? r2((m.cancelados / m.pedidos) * 100) : null,
    ),
    nota: {
      ifood: idxs.map((i) => notaMes(avals[i], "ifood")),
      ninefood: idxs.map((i) => notaMes(avals[i], "99food")),
      keeta: idxs.map((i) => notaMes(avals[i], "keeta")),
    },
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold tracking-tight">
          Evolução {escopo}
        </h3>
        <p className="text-xs text-muted-foreground">
          Mês a mês em {year}, por plataforma — escolha a métrica
        </p>
      </div>
      {serie.meses.length >= 2 ? (
        <GraficoPrincipal serie={serie} metricas={metricas} />
      ) : (
        <p className="py-8 text-center text-xs text-muted-foreground">
          Ainda não há meses suficientes com dado pra desenhar a evolução.
        </p>
      )}
    </div>
  )
}

/** Esqueleto enquanto a série carrega (Suspense fallback). */
export function EvolucaoFaturamentoSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 space-y-1.5">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-3 w-56 animate-pulse rounded bg-muted" />
      </div>
      <div className="mb-2 flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-6 w-20 animate-pulse rounded-full bg-muted" />
        ))}
      </div>
      <div className="h-[150px] animate-pulse rounded-lg bg-muted/60" />
    </div>
  )
}
