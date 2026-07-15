import "server-only"

/**
 * Dados fiscais da nota do Delivery OS (emitente: LAB OF CHANGE LTDA).
 *
 * Espelha o serviço marcado como PADRÃO no painel do Asaas, em
 * Configurações fiscais → Serviços cadastrados. Se o contador mudar o
 * cadastro lá, mude aqui também — ou sobrescreva por env var, sem deploy de
 * código.
 *
 * ⚠️ Estes valores saem impressos na nota fiscal do cliente. Não chute:
 * qualquer alteração passa pelo contador antes.
 */

/**
 * Código do serviço municipal. No painel aparece como
 * "01899 | 17.03 - Planejamento, coordenação, programação ou organização
 * técnica, financeira ou administrativa" — o código é a primeira parte.
 */
export const FISCAL_SERVICE_CODE =
  process.env.ASAAS_NF_SERVICE_CODE ?? "01899"

/** Descrição que sai na nota. Igual à cadastrada no painel. */
export const FISCAL_SERVICE_NAME =
  process.env.ASAAS_NF_SERVICE_NAME ?? "Delivery OS Assinatura Mensal"

/**
 * Impostos. A conta é Simples Nacional com regime especial "Isenta", então os
 * federais vão zerados (recolhidos no DAS) e só o ISS é informado — 5%, que é
 * o que está no serviço cadastrado.
 *
 * `retainIss: false` = a nota NÃO tem ISS retido na fonte; quem recolhe somos
 * nós (via DAS), não o cliente.
 */
export const FISCAL_TAXES = {
  retainIss: false,
  iss: Number(process.env.ASAAS_NF_ISS ?? 5),
  cofins: 0,
  csll: 0,
  inss: 0,
  ir: 0,
  pis: 0,
} as const

/**
 * Quando emitir. ON_PAYMENT_CONFIRMATION = assim que o pagamento é
 * confirmado, que é o certo pra assinatura no cartão: só existe nota se
 * dinheiro entrou. Evita nota emitida de cobrança que acabou não sendo paga.
 */
export const FISCAL_EFFECTIVE_DATE_PERIOD = "ON_PAYMENT_CONFIRMATION" as const

/** Payload pronto pro POST /subscriptions/{id}/invoiceSettings. */
export function fiscalInvoiceSettings() {
  return {
    municipalServiceCode: FISCAL_SERVICE_CODE,
    municipalServiceName: FISCAL_SERVICE_NAME,
    effectiveDatePeriod: FISCAL_EFFECTIVE_DATE_PERIOD,
    deductions: 0,
    receivedOnly: false,
    taxes: { ...FISCAL_TAXES },
  }
}
