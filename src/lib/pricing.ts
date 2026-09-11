/**
 * Regra de preço dos três ciclos — módulo PURO (sem server-only), pra ser
 * importado tanto no server (ação de assinatura) quanto no client (landing,
 * checkout) sem vazar código de servidor pro bundle.
 *
 * A BASE guardada em `platform_settings` (primeira loja + adicional) é o preço
 * do ANUAL À VISTA, por mês. Os outros dois ciclos saem dela:
 *
 *   anual     → base, cobrado à vista (12 meses numa cobrança, cycle YEARLY)
 *   anual_12x → base + acréscimo, em 12 parcelas no cartão (parcelamento do
 *               Asaas — a assinatura de lá não aceita parcelas)
 *   mensal    → base + 30%, recorrente todo mês (cycle MONTHLY)
 *
 * ⚠️ O ACRÉSCIMO DO 12x É PARÂMETRO OBRIGATÓRIO, de propósito. Ele mora no
 * banco (`platform_settings.acrescimo_12x_pct`) e o Marcus muda quando quiser
 * em Clientes → Preços dos planos. Com um valor padrão aqui, a primeira tela
 * que esquecesse de passá-lo mostraria 10% enquanto o checkout cobrava outro
 * número — o mesmo erro de "cópia sem a regra" que já custou caro. Sendo
 * obrigatório, quem esquece não compila.
 */

export type BillingCycle = "mensal" | "anual" | "anual_12x"

/** Ordem de exibição: o mais barato primeiro. */
export const CICLOS: readonly BillingCycle[] = ["anual", "anual_12x", "mensal"]

/** Quanto o mensal custa a mais que o anual à vista (por mês). */
export const MENSAL_MULT = 1.3

/** Número de parcelas do anual parcelado. */
export const PARCELAS_12X = 12

/** Acréscimo do 12x quando o banco não responde (é o default da migration 0257). */
export const ACRESCIMO_12X_PADRAO = 10

/** O que varia por configuração. Hoje, só o acréscimo do 12x. */
export type RegraCiclos = { acrescimo12xPct: number }

export const ROTULO_CICLO: Record<BillingCycle, string> = {
  anual: "Anual à vista",
  anual_12x: "Anual em 12x",
  mensal: "Mensal",
}

/** Arredonda pra 2 casas (centavos). */
function round2(v: number): number {
  return Math.round(v * 100) / 100
}

/**
 * Lê o ciclo gravado no banco. Nulo = cobrança manual, que sempre usou a base
 * (anual) — e continua usando.
 */
export function cicloDoBanco(v: unknown): BillingCycle {
  return v === "mensal" || v === "anual_12x" ? v : "anual"
}

/** Fator sobre a base: 1 (anual), 1 + acréscimo (12x), 1,3 (mensal). */
export function multiplicadorDoCiclo(
  cycle: BillingCycle,
  regra: RegraCiclos,
): number {
  if (cycle === "mensal") return MENSAL_MULT
  if (cycle === "anual_12x") return 1 + regra.acrescimo12xPct / 100
  return 1
}

/**
 * Valor por MÊS exibido na vitrine conforme o ciclo. No 12x, é exatamente o
 * valor da parcela.
 */
export function valorMensalExibido(
  baseAnualMes: number,
  cycle: BillingCycle,
  regra: RegraCiclos,
): number {
  return round2(baseAnualMes * multiplicadorDoCiclo(cycle, regra))
}

/**
 * O que é cobrado POR CICLO, a partir do preço-base (anual/mês):
 *  - anual: 12× o base, à vista numa cobrança (cycle YEARLY)
 *  - anual_12x: o TOTAL do ano. A parcela é arredondada ANTES de multiplicar,
 *    pra as 12 saírem iguais e o total bater com "12x de R$ X" da tela.
 *  - mensal: base × 1,3, recorrente todo mês (cycle MONTHLY)
 */
export function valorCobranca(
  baseAnualMes: number,
  cycle: BillingCycle,
  regra: RegraCiclos,
): number {
  if (cycle === "mensal") return valorMensalExibido(baseAnualMes, "mensal", regra)
  return round2(valorMensalExibido(baseAnualMes, cycle, regra) * PARCELAS_12X)
}

/** Ciclo do Asaas pra ASSINATURA. O 12x não passa por aqui: é parcelamento. */
export function asaasCycle(cycle: "mensal" | "anual"): "MONTHLY" | "YEARLY" {
  return cycle === "anual" ? "YEARLY" : "MONTHLY"
}

/** Meses cobertos por um ciclo pago. */
export function mesesDoCiclo(cycle: BillingCycle): number {
  return cycle === "mensal" ? 1 : 12
}

/**
 * Quanto o anual à vista economiza sobre o mensal, em % inteiro. Com o +30%
 * dá 23 (1 − 1/1,3) — é o número do selo "Economize", e sai da mesma
 * constante pra nunca prometer uma economia que a conta não entrega.
 */
export function economiaAnualPct(): number {
  return Math.round((1 - 1 / MENSAL_MULT) * 100)
}

/** "49" quando inteiro, "63,70" quando tem centavos. */
export function precoStr(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",")
}
