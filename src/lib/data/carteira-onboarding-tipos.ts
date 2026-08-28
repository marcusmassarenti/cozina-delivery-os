/**
 * Constantes da fila de onboarding da AGÊNCIA — sem `server-only`.
 *
 * ⚠️ Não confundir com `data/onboarding.ts`, que é o checklist de primeiros
 * passos do cliente dentro do produto. Nome parecido, assunto oposto: aquele
 * ensina o cliente a usar o sistema; este acompanha a loja entre "vendida" e
 * "sendo cuidada". Por isso o prefixo `carteira-`.
 */

export const STATUS = [
  { id: "pronto", label: "Pronto para agendamento" },
  { id: "agendado", label: "Reunião agendada" },
  { id: "concluido", label: "Onboarding concluído" },
] as const

export type StatusOnboarding = (typeof STATUS)[number]["id"]

export type LojaOnboarding = {
  id: string
  code: string
  nome: string
  vendedorNome: string | null
  dataVenda: string | null
  promessa: string | null
  sucessoResponsavel: string | null
  status: StatusOnboarding | null
  reuniaoEm: string | null
  link: string | null
  observacoes: string | null
  gestorNome: string | null
  checklistOk: boolean
  cardapioOk: boolean
  encaminhada: boolean
  /** Dias desde a venda — quanto maior, mais tempo o cliente paga sem ser
   *  atendido. É o número que a tela existe pra não deixar crescer. */
  diasDesdeVenda: number | null
}
