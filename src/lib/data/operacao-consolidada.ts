import "server-only"

import { getFinanceiroResumoForMonth } from "@/lib/data/ifood-imported"
import { getNinefoodResumoForMonth } from "@/lib/data/ninefood-imported"
import { getKeetaResumoForMonth } from "@/lib/data/keeta-imported"

export type PlatId = "ifood" | "99food" | "keeta"

export type PlatBreak = {
  id: PlatId
  label: string
  bruto: number
  pedidos: number
  ticket: number
  sharePct: number // % do faturamento total
  temDados: boolean
  /** Extras quando a plataforma expõe */
  notaMedia?: number | null
  tempoPreparoMin?: number | null
  taxaAceitacaoPct?: number | null
  cancelamentosQtd?: number | null
}

export type Consolidado = {
  total: { bruto: number; pedidos: number; ticket: number }
  plataformas: PlatBreak[]
  /** Quantas plataformas têm dado. */
  ativas: number
}

const LABEL: Record<PlatId, string> = {
  ifood: "iFood",
  "99food": "99 Food",
  keeta: "Keeta",
}

/**
 * Retrato da operação da loja no mês SOMANDO as 3 plataformas, com a quebra
 * por plataforma (pra o comparativo e pra alimentar a IA da operação toda).
 */
export async function getOperacaoConsolidada(
  unitId: string,
  year: number,
  month: number,
): Promise<Consolidado> {
  const [ifood, nine, keeta] = await Promise.all([
    getFinanceiroResumoForMonth(unitId, year, month),
    getNinefoodResumoForMonth(unitId, year, month),
    getKeetaResumoForMonth(unitId, year, month),
  ])

  const raw: Omit<PlatBreak, "sharePct">[] = [
    {
      id: "ifood",
      label: LABEL.ifood,
      bruto: ifood.hasData ? ifood.bruto : 0,
      pedidos: ifood.hasData ? ifood.pedidosUnicos : 0,
      ticket:
        ifood.hasData && ifood.pedidosUnicos > 0
          ? ifood.bruto / ifood.pedidosUnicos
          : 0,
      temDados: ifood.hasData,
    },
    {
      id: "99food",
      label: LABEL["99food"],
      bruto: nine.bruto,
      pedidos: nine.pedidos,
      ticket: nine.ticketMedio,
      temDados: nine.hasData,
      notaMedia: nine.avaliacaoMedia,
      tempoPreparoMin: nine.tempoPreparoMedio,
      taxaAceitacaoPct: nine.taxaAceitacaoMedia,
      cancelamentosQtd: nine.cancelamentosQtd,
    },
    {
      id: "keeta",
      label: LABEL.keeta,
      bruto: keeta.bruto,
      pedidos: keeta.pedidos,
      ticket: keeta.ticketMedio,
      temDados: keeta.hasData,
      cancelamentosQtd: keeta.cancelamentosQtd,
    },
  ]

  const totalBruto = raw.reduce((a, p) => a + p.bruto, 0)
  const totalPedidos = raw.reduce((a, p) => a + p.pedidos, 0)

  const plataformas: PlatBreak[] = raw.map((p) => ({
    ...p,
    sharePct: totalBruto > 0 ? (p.bruto / totalBruto) * 100 : 0,
  }))

  return {
    total: {
      bruto: totalBruto,
      pedidos: totalPedidos,
      ticket: totalPedidos > 0 ? totalBruto / totalPedidos : 0,
    },
    plataformas,
    ativas: plataformas.filter((p) => p.temDados).length,
  }
}
