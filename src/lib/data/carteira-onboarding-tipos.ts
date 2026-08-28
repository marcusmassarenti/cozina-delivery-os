/**
 * Tipos da fila de onboarding da AGÊNCIA — sem `server-only`.
 *
 * ⚠️ Não confundir com `data/onboarding.ts`, que é o checklist de primeiros
 * passos do cliente dentro do produto. Nome parecido, assunto oposto: aquele
 * ensina o cliente a usar o sistema; este acompanha a loja entre "vendida" e
 * "sendo cuidada". Por isso o prefixo `carteira-`.
 */

export type Etapa = {
  id: string
  nome: string
  ordem: number
  /** A etapa que significa "terminou" — é ela que libera o gestor. */
  conclui: boolean
}

/** As colunas com que uma agência nova começa. Depois ela edita as dela. */
export const ETAPAS_PADRAO = [
  { nome: "Pronto para agendamento", ordem: 0, conclui: false },
  { nome: "Reunião agendada", ordem: 1, conclui: false },
  { nome: "Onboarding concluído", ordem: 2, conclui: true },
]

export type LojaOnboarding = {
  id: string
  code: string
  nome: string
  logoUrl: string | null
  cnpj: string | null
  cidade: string | null
  vendedorNome: string | null
  vendedorId: string | null
  dataVenda: string | null
  mensalidade: number | null
  promessa: string | null
  sucessoResponsavel: string | null
  etapaId: string | null
  etapaNome: string | null
  concluida: boolean
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
