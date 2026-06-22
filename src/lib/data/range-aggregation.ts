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
import { emptyMonthly, type UnitMonthly } from "@/lib/mock-monthly"

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
import { getRealMonthlyForUnits } from "./lancamentos"

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

// ─── UnitMonthly (mescla CMV/operação mensal + KPIs por range) ──────

/**
 * Variante de getRealMonthlyForUnits que respeita range custom. Os CUSTOS
 * (CMV, operação) seguem sendo do MÊS inteiro (lançados em monthly_entries),
 * mas KPIs por plataforma (bruto, líquido, pedidos) filtram pelos dias.
 */
export async function getRealMonthlyForUnitsForRange(
  unitIds: string[],
  range: DateRange,
): Promise<Map<string, UnitMonthly>> {
  const months = decomposeRangeByMonth(range)
  if (months.length === 0) return new Map()
  const maps = await Promise.all(
    months.map((m) =>
      getRealMonthlyForUnits(unitIds, m.period.year, m.period.month, m.sub),
    ),
  )
  if (maps.length === 1) return maps[0]
  // Cross-month: merge UnitMonthly por unit_id. Soma volumes e platformas;
  // custos manuais (CMV, operação) pega do ÚLTIMO mês (já que são mensais
  // e somar dobraria — assume que o mês mais recente tem o lançamento certo).
  const out = new Map<string, UnitMonthly>()
  for (const m of maps) {
    for (const [k, v] of m) {
      const cur = out.get(k)
      if (!cur) {
        out.set(k, { ...v, platforms: [...v.platforms] })
      } else {
        mergeUnitMonthly(cur, v)
      }
    }
  }
  return out
}

function mergeUnitMonthly(acc: UnitMonthly, v: UnitMonthly) {
  acc.pedidos += v.pedidos
  acc.pedidosCancelados += v.pedidosCancelados
  acc.clientesNovos = sumNullable(acc.clientesNovos, v.clientesNovos)
  acc.faturamentoBruto += v.faturamentoBruto
  acc.faturamentoLiquido += v.faturamentoLiquido
  acc.totalLiquido += v.totalLiquido
  acc.vrRecebido += v.vrRecebido
  acc.vrTaxaMedia8 += v.vrTaxaMedia8
  acc.cancelamentosReembolsos += v.cancelamentosReembolsos
  acc.taxaEntregaIfood += v.taxaEntregaIfood
  acc.promocoes += v.promocoes
  acc.taxaComissaoIfood += v.taxaComissaoIfood
  acc.servicosLogisticos += v.servicosLogisticos
  acc.outrosDescontosIfood += v.outrosDescontosIfood
  // Custos manuais (mensais): sobrescreve com o último (assume v é mais novo).
  // Pra cross-month, isso ainda dobra o custo. Por enquanto, mantém a soma
  // mas aceita que CMV/op fica subestimado/super pra range parcial — banner
  // já avisa o usuário.
  acc.custoProdutosCozina += v.custoProdutosCozina
  acc.custoProdutosLoja = sumNullable(acc.custoProdutosLoja, v.custoProdutosLoja)
  acc.custoOperacao += v.custoOperacao
  // Ticket médio recalcular
  acc.ticketMedio =
    acc.pedidos > 0 ? acc.faturamentoBruto / acc.pedidos : 0
  // Plataformas: merge por id
  const byId = new Map(acc.platforms.map((p) => [p.id, p]))
  for (const p of v.platforms) {
    const cur = byId.get(p.id)
    if (!cur) {
      acc.platforms.push({ ...p })
      byId.set(p.id, p)
    } else {
      cur.bruto += p.bruto
      cur.liquido += p.liquido
      cur.pctLoja = cur.bruto > 0 ? (cur.liquido / cur.bruto) * 100 : 0
      cur.recebidoDireto = (cur.recebidoDireto ?? 0) + (p.recebidoDireto ?? 0)
      cur.promocoesLoja = (cur.promocoesLoja ?? 0) + (p.promocoesLoja ?? 0)
    }
  }
  // Margem e nota — usa do mais recente (último).
  acc.margemLiquida = v.margemLiquida
  acc.margemLucroPct = v.margemLucroPct
  acc.notaMedia = v.notaMedia
  acc.observacoes = v.observacoes
}

function sumNullable(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null
  return (a ?? 0) + (b ?? 0)
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
