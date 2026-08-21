/**
 * Quanto um cliente paga por mês — a conta inteira, num lugar só.
 *
 * São quatro camadas que sempre andam juntas e que já viveram espalhadas por
 * arquivos diferentes: preço do plano por loja, preço negociado (que substitui
 * o plano), multiplicador do ciclo e desconto acordado. Cada cópia que existia
 * esquecia uma delas — e o sintoma nunca era erro, era número diferente em
 * duas telas.
 */
import "server-only"

import { precoDoPlano, type PlanId, type PrecosPlano } from "@/lib/data/assinatura"
import { aplicarDescontos, type DescontoNegociado } from "@/lib/data/descontos"
import { valorMensalExibido, type BillingCycle } from "@/lib/pricing"

export type DadosMensalidade = {
  plan_tier?: string | null
  monthly_fee?: number | string | null
  price_per_unit?: number | string | null
  included_units?: number | null
  billing_cycle?: string | null
  desconto_tipo?: string | null
  desconto_valor?: number | string | null
  desconto_ate?: string | null
}

/**
 * @param ativas lojas cobradas (ativas + compartilhadas, quando for o caso)
 * @param hojeISO data de referência pro prazo do desconto
 */
export function mensalidadeDoCliente(
  h: DadosMensalidade,
  ativas: number,
  precos: PrecosPlano,
  hojeISO: string,
): { cheio: number; valor: number } {
  let cheio: number
  if (h.monthly_fee != null) {
    // Preço negociado NÃO leva multiplicador de ciclo: o valor foi combinado à
    // mão e já é o que o cliente paga.
    const inclusas = Number(h.included_units ?? 1)
    const extras = Math.max(0, ativas - inclusas)
    cheio = Number(h.monthly_fee) + extras * Number(h.price_per_unit ?? 0)
  } else if (h.plan_tier) {
    cheio = valorMensalExibido(
      precoDoPlano(precos, h.plan_tier as PlanId, ativas),
      (h.billing_cycle as BillingCycle | null) ?? "anual",
    )
  } else {
    return { cheio: 0, valor: 0 }
  }

  const negociado: DescontoNegociado = {
    tipo: (h.desconto_tipo ?? null) as DescontoNegociado["tipo"],
    valor: Number(h.desconto_valor ?? 0),
    ate: (h.desconto_ate ?? null) as string | null,
  }
  // Cupom fora: ele vale só na 1ª fatura, e isto aqui é o que se repete.
  return { cheio, valor: aplicarDescontos(cheio, negociado, 0, hojeISO).valor }
}
