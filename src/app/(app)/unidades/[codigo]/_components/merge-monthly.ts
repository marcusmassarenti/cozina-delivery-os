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
    // Pacote de anúncios + MENSALIDADE do plano. As duas são cobranças de
    // período (não de pedido) e por isso escapavam de todas as outras linhas.
    // A mensalidade já saía do bolso do lojista via `liquido` — só não
    // aparecia em lugar nenhum que ele pudesse ver. 57 lojas pagam, de R$ 55 a
    // R$ 150/mês (medido em 07/ago/26).
    outrosDescontosIfood:
      Math.abs(fin.pacoteAnuncios) + Math.abs(fin.mensalidade),
  }
}
