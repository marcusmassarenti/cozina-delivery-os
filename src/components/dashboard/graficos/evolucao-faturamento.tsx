import "server-only"

import {
  PLATAFORMAS,
  type PlatformId,
} from "@/components/platform-logo"
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
// PLATAFORMAS, não lista fixa: o mapa `byPlat` já tinha a chave do canal
// próprio, mas sem a série sendo BUSCADA ela ficava zerada e a plataforma
// sumia da legenda do gráfico.
const PLATS: PlatformId[] = PLATAFORMAS

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
  plataformas,
}: {
  unitIds: string[]
  year: number
  month: number
  metricas?: string[]
  /** Genitivo do escopo pro título: "da rede" | "da loja" | "das lojas". */
  escopo?: string
  /**
   * Filtro de plataforma do dashboard. Vazio/ausente = todas.
   *
   * ── POR QUE (Marcus, 26/08/26) ───────────────────────────────────────
   * "quando seleciono só a keeta, na evolução tem que sair os logos 99 e
   * ifood". O gráfico não recebia o filtro: o cabeçalho do dashboard filtrava
   * tudo e ele continuava desenhando as três linhas, então a tela dizia duas
   * coisas diferentes ao mesmo tempo.
   *
   * Filtrar aqui também CORTA CONSULTA: são (meses × plataformas) chamadas, e
   * com uma plataforma selecionada isso cai a um terço.
   */
  plataformas?: PlatformId[]
}) {
  const periods = Array.from({ length: month }, (_, i) => ({
    year,
    month: i + 1,
  }))

  const platsAtivas =
    plataformas && plataformas.length > 0
      ? PLATS.filter((p) => plataformas.includes(p))
      : PLATS

  // Uma tarefa por (mês × plataforma), com concorrência limitada.
  const tarefas: { i: number; plat: PlatformId }[] = []
  periods.forEach((_, i) =>
    platsAtivas.forEach((plat) => tarefas.push({ i, plat })),
  )

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
    cardapioweb: periods.map(() => ({
      bruto: 0,
      liquido: 0,
      pedidos: 0,
      cancelados: 0,
    })),
  }
  for (const r of flat) byPlat[r.plat][r.i] = r.agg

  const brutoMes = periods.map(
    (_, i) =>
      byPlat.ifood[i].bruto +
      byPlat["99food"][i].bruto +
      byPlat.keeta[i].bruto +
      byPlat.cardapioweb[i].bruto,
  )
  const primeiro = brutoMes.findIndex((v) => v > 0)
  const idxs =
    primeiro < 0 ? [] : periods.map((_, i) => i).filter((i) => i >= primeiro)

  const porPlat = (fn: (m: MesPlat) => number | null) => ({
    ifood: idxs.map((i) => fn(byPlat.ifood[i])),
    ninefood: idxs.map((i) => fn(byPlat["99food"][i])),
    keeta: idxs.map((i) => fn(byPlat.keeta[i])),
    cardapioweb: idxs.map((i) => fn(byPlat.cardapioweb[i])),
  })

  const serie: SerieEvolucao = {
    meses: idxs.map((i) => MESES[periods[i].month - 1] ?? String(periods[i].month)),
    faturamento: porPlat((m) => Math.round(m.bruto)),
    ticket: porPlat((m) => (m.pedidos > 0 ? r2(m.bruto / m.pedidos) : null)),
    pedidos: porPlat((m) => m.pedidos),
    cancelamento: porPlat((m) =>
      m.pedidos > 0 ? r2((m.cancelados / m.pedidos) * 100) : null,
    ),
    /**
     * A NOTA PRECISA DO MESMO FILTRO, e por um motivo que não é óbvio: ela não
     * vem de `byPlat` (que já nasce zerado pra plataforma não buscada) — vem de
     * `avals`, que é uma consulta só, sem recorte de plataforma. Sem filtrar
     * aqui, o gráfico escondia iFood e 99 em Faturamento/Ticket/Pedidos e as
     * mostrava de volta ao clicar em Nota.
     */
    nota: {
      ifood: platsAtivas.includes("ifood")
        ? idxs.map((i) => notaMes(avals[i], "ifood"))
        : idxs.map(() => null),
      ninefood: platsAtivas.includes("99food")
        ? idxs.map((i) => notaMes(avals[i], "99food"))
        : idxs.map(() => null),
      keeta: platsAtivas.includes("keeta")
        ? idxs.map((i) => notaMes(avals[i], "keeta"))
        : idxs.map(() => null),
      // Cardápio Web não expõe avaliação — série sempre nula, e o filtro de
      // série vazia no gráfico a esconde da legenda de Nota.
      cardapioweb: idxs.map(() => null),
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
