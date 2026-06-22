/**
 * Wrappers das queries por (year, month) que aceitam um DateRange e:
 *  - Se o range cabe em 1 mês: 1 chamada com filtro de dias.
 *  - Se cruza meses (ex.: "últimos 30 dias"): decompõe em sub-ranges por
 *    mês, chama em paralelo e mergeia o Map<unitId, Resumo> resultante.
 *
 * Faz sentido por plataforma — os Resumos têm campos diferentes e o merge
 * precisa saber quais somar/agregar.
 */
import "server-only"

import { decomposeRangeByMonth, type DateRange } from "@/lib/period"

import {
  getFinanceiroResumoByUnits,
  type FinanceiroResumo,
} from "./ifood-imported"
import {
  getNinefoodResumoByUnits,
  type NinefoodResumo,
} from "./ninefood-imported"
import {
  getKeetaResumoByUnits,
  type KeetaResumo,
} from "./keeta-imported"
import { getNetworkDeliveryFee, type DeliveryFee } from "./taxa-entrega"

// ─── iFood ──────────────────────────────────────────────────────────

function mergeFinResumo(acc: FinanceiroResumo, v: FinanceiroResumo) {
  acc.pedidosUnicos += v.pedidosUnicos
  acc.bruto += v.bruto
  acc.comissaoIfood += v.comissaoIfood
  acc.taxaEntrega += v.taxaEntrega
  acc.taxaTransacao += v.taxaTransacao
  acc.taxaServicoCliente += v.taxaServicoCliente
  acc.promocaoLoja += v.promocaoLoja
  acc.promocaoIfood += v.promocaoIfood
  acc.pacoteAnuncios += v.pacoteAnuncios
  acc.ressarcimentos += v.ressarcimentos
  acc.cancelamentoTotalQtd += v.cancelamentoTotalQtd
  acc.cancelamentoParcialQtd += v.cancelamentoParcialQtd
  acc.perdaCancelamento += v.perdaCancelamento
  acc.liquido += v.liquido
  acc.recebidoDireto += v.recebidoDireto
  acc.hasData = acc.hasData || v.hasData
}

export async function getFinanceiroResumoByUnitsForRange(
  unitIds: string[],
  range: DateRange,
): Promise<Map<string, FinanceiroResumo>> {
  const months = decomposeRangeByMonth(range)
  if (months.length === 0) return new Map()
  const maps = await Promise.all(
    months.map((m) =>
      getFinanceiroResumoByUnits(unitIds, m.period.year, m.period.month, m.sub),
    ),
  )
  if (maps.length === 1) return maps[0]
  const out = new Map<string, FinanceiroResumo>()
  for (const m of maps) {
    for (const [k, v] of m) {
      const cur = out.get(k)
      if (!cur) {
        out.set(k, { ...v })
      } else {
        mergeFinResumo(cur, v)
      }
    }
  }
  return out
}

// ─── 99 Food ────────────────────────────────────────────────────────

function mergeNineResumo(acc: NinefoodResumo, v: NinefoodResumo) {
  acc.pedidos += v.pedidos
  acc.bruto += v.bruto
  acc.liquido += v.liquido
  acc.comissaoRs += v.comissaoRs
  acc.taxaCanalPagamentoRs += v.taxaCanalPagamentoRs
  acc.promocoesRs += v.promocoesRs
  acc.cancelamentosQtd += v.cancelamentosQtd
  acc.diasComDados += v.diasComDados
  acc.hasData = acc.hasData || v.hasData
  // Médias: dá pra fazer média simples das médias ponderadas dos dois mêses
  // (aproximação razoável quando os mêses são parecidos em tamanho).
  acc.avaliacaoMedia = avgNullable(acc.avaliacaoMedia, v.avaliacaoMedia)
  acc.taxaAceitacaoMedia = avgNullable(
    acc.taxaAceitacaoMedia,
    v.taxaAceitacaoMedia,
  )
  acc.tempoPreparoMedio = avgNullable(acc.tempoPreparoMedio, v.tempoPreparoMedio)
  // Recalcula derivados
  acc.ticketMedio = acc.pedidos > 0 ? acc.bruto / acc.pedidos : 0
  acc.pctLoja = acc.bruto > 0 ? (acc.liquido / acc.bruto) * 100 : 0
}

function avgNullable(a: number | null, b: number | null): number | null {
  if (a == null) return b
  if (b == null) return a
  return (a + b) / 2
}

export async function getNinefoodResumoByUnitsForRange(
  unitIds: string[],
  range: DateRange,
): Promise<Map<string, NinefoodResumo>> {
  const months = decomposeRangeByMonth(range)
  if (months.length === 0) return new Map()
  const maps = await Promise.all(
    months.map((m) =>
      getNinefoodResumoByUnits(unitIds, m.period.year, m.period.month, m.sub),
    ),
  )
  if (maps.length === 1) return maps[0]
  const out = new Map<string, NinefoodResumo>()
  for (const m of maps) {
    for (const [k, v] of m) {
      const cur = out.get(k)
      if (!cur) {
        out.set(k, { ...v })
      } else {
        mergeNineResumo(cur, v)
      }
    }
  }
  return out
}

// ─── Keeta ──────────────────────────────────────────────────────────

function mergeKeetaResumo(acc: KeetaResumo, v: KeetaResumo) {
  acc.pedidos += v.pedidos
  acc.bruto += v.bruto
  acc.liquido += v.liquido
  acc.cancelamentosQtd += v.cancelamentosQtd
  acc.promocoesLoja += v.promocoesLoja
  acc.hasData = acc.hasData || v.hasData
  acc.ticketMedio = acc.pedidos > 0 ? acc.bruto / acc.pedidos : 0
  acc.pctLoja = acc.bruto > 0 ? (acc.liquido / acc.bruto) * 100 : 0
}

export async function getKeetaResumoByUnitsForRange(
  unitIds: string[],
  range: DateRange,
): Promise<Map<string, KeetaResumo>> {
  const months = decomposeRangeByMonth(range)
  if (months.length === 0) return new Map()
  const maps = await Promise.all(
    months.map((m) =>
      getKeetaResumoByUnits(unitIds, m.period.year, m.period.month, m.sub),
    ),
  )
  if (maps.length === 1) return maps[0]
  const out = new Map<string, KeetaResumo>()
  for (const m of maps) {
    for (const [k, v] of m) {
      const cur = out.get(k)
      if (!cur) {
        out.set(k, { ...v })
      } else {
        mergeKeetaResumo(cur, v)
      }
    }
  }
  return out
}

// ─── Custo de entrega (DeliveryFee — 3 plataformas somadas) ─────────

export async function getNetworkDeliveryFeeForRange(
  unitIds: string[],
  range: DateRange,
): Promise<DeliveryFee> {
  const months = decomposeRangeByMonth(range)
  if (months.length === 0) return { ifood: 0, ninefood: 0, keeta: 0, total: 0 }
  const fees = await Promise.all(
    months.map((m) =>
      getNetworkDeliveryFee(unitIds, m.period.year, m.period.month, m.sub),
    ),
  )
  const acc: DeliveryFee = { ifood: 0, ninefood: 0, keeta: 0, total: 0 }
  for (const f of fees) {
    acc.ifood += f.ifood
    acc.ninefood += f.ninefood
    acc.keeta += f.keeta
  }
  acc.ifood = Math.round(acc.ifood * 100) / 100
  acc.ninefood = Math.round(acc.ninefood * 100) / 100
  acc.keeta = Math.round(acc.keeta * 100) / 100
  acc.total = Math.round((acc.ifood + acc.ninefood + acc.keeta) * 100) / 100
  return acc
}
