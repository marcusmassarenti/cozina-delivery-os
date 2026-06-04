import type { UnitMonthly } from "@/lib/mock-monthly"
import type { getFinanceiroResumoForMonth } from "@/lib/data/ifood-imported"
import type { getNinefoodResumoForMonth } from "@/lib/data/ninefood-imported"
import type { getKeetaResumoForMonth } from "@/lib/data/keeta-imported"

/**
 * Enriquece o monthly canônico (getRealMonthlyForUnits) com os campos
 * granulares do iFood (taxa entrega, comissão, promoções, anúncios) que vêm da
 * Conciliação — usados na aba Financeiro ("Para onde foram as taxas"). NÃO
 * recalcula KPIs (bruto/líquido/margem/pedidos já vêm certos do agregador).
 */
export function mergeMonthly(
  manual: UnitMonthly,
  fin: Awaited<ReturnType<typeof getFinanceiroResumoForMonth>>,
  nine: Awaited<ReturnType<typeof getNinefoodResumoForMonth>>,
  keeta: Awaited<ReturnType<typeof getKeetaResumoForMonth>>,
): UnitMonthly {
  if (!fin.hasData && !nine.hasData && !keeta.hasData) return manual
  if (!fin.hasData) return manual
  return {
    ...manual,
    cancelamentosReembolsos: Math.abs(fin.perdaCancelamento),
    taxaEntregaIfood: Math.abs(fin.taxaEntrega),
    promocoes: Math.abs(fin.promocaoLoja),
    taxaComissaoIfood:
      Math.abs(fin.comissaoIfood) +
      Math.abs(fin.taxaTransacao) +
      Math.abs(fin.taxaServicoCliente),
    outrosDescontosIfood: Math.abs(fin.pacoteAnuncios),
  }
}
