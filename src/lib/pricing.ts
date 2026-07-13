/**
 * Regra de preço Mensal x Anual — módulo PURO (sem server-only), pra ser
 * importado tanto no server (ação de assinatura) quanto no client (landing,
 * checkout) sem vazar código de servidor pro bundle.
 *
 * A BASE guardada em `platform_settings` (49/99/159 por loja) é o preço do
 * ANUAL por mês. O mensal custa +30%. O anual é cobrado à vista no cartão
 * (12 meses de uma vez, 1 cobrança por ano — cycle YEARLY no Asaas).
 */

export type BillingCycle = "mensal" | "anual"

/** Quanto o mensal custa a mais que o anual (por mês). */
export const MENSAL_MULT = 1.3

/** Arredonda pra 2 casas (centavos). */
function round2(v: number): number {
  return Math.round(v * 100) / 100
}

/**
 * Valor que vai pro Asaas conforme o ciclo, a partir do preço-base (anual/mês).
 *  - anual: 12× o base, cobrado à vista numa cobrança (cycle YEARLY)
 *  - mensal: base × 1,3 (+30%), recorrente todo mês (cycle MONTHLY)
 */
export function valorCobranca(baseAnualMes: number, cycle: BillingCycle): number {
  return cycle === "anual"
    ? round2(baseAnualMes * 12)
    : round2(baseAnualMes * MENSAL_MULT)
}

/** Valor por MÊS exibido na vitrine conforme o ciclo (anual = base; mensal = +30%). */
export function valorMensalExibido(baseAnualMes: number, cycle: BillingCycle): number {
  return cycle === "anual" ? baseAnualMes : round2(baseAnualMes * MENSAL_MULT)
}

/** Ciclo do Asaas correspondente. */
export function asaasCycle(cycle: BillingCycle): "MONTHLY" | "YEARLY" {
  return cycle === "anual" ? "YEARLY" : "MONTHLY"
}

/** "49" quando inteiro, "63,70" quando tem centavos. */
export function precoStr(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",")
}
