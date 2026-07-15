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
 * Código do serviço municipal: 1.01 - Análise e desenvolvimento de sistemas.
 *
 * ⚠️ Sem o zero à esquerda de propósito. O painel do Asaas MOSTRA "02660",
 * mas o catálogo da prefeitura (GET /invoices/municipalServices) devolve
 * "2660 | 1.01 - Análise e desenvolvimento de sistemas" — é esse o valor que
 * a API reconhece. Mandar "02660" arrisca a nota não ser emitida.
 * Confira em /api/integracao/nf-setup → codigoConfere.
 */
export const FISCAL_SERVICE_CODE = process.env.ASAAS_NF_SERVICE_CODE ?? "2660"

/** Descrição que sai na nota. Igual à cadastrada no painel. */
export const FISCAL_SERVICE_NAME =
  process.env.ASAAS_NF_SERVICE_NAME ?? "Delivery OS Assinatura Mensal"

/**
 * Impostos. A conta é Simples Nacional com regime especial "Isenta", então os
 * federais vão zerados (recolhidos no DAS) e só o ISS é informado — 2,9%, que
 * é a alíquota do 1.01 no catálogo da prefeitura e o que está no serviço
 * padrão cadastrado no painel.
 *
 * `retainIss: false` = a nota NÃO tem ISS retido na fonte; quem recolhe somos
 * nós (via DAS), não o cliente.
 */
export const FISCAL_TAXES = {
  retainIss: false,
  iss: Number(process.env.ASAAS_NF_ISS ?? 2.9),
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
