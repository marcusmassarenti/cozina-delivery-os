/**
 * Tipos e constantes dos atendimentos — SEM `server-only`.
 *
 * Existe separado porque a tela é um componente cliente e precisa da lista de
 * tipos pra montar o seletor. Importar do módulo de dados arrastava
 * `createAdminClient` (e a service_role junto) pro bundle do navegador; o
 * Next barra, e com razão. Mesmo padrão de `units-page-tipos`.
 */

export const TIPOS = [
  { id: "cardapio", label: "Ajuste de cardápio" },
  { id: "promocao", label: "Promoção" },
  { id: "contato", label: "Contato com o lojista" },
  { id: "operacao", label: "Operação" },
  { id: "financeiro", label: "Financeiro" },
  { id: "outro", label: "Outro" },
] as const

export type TipoAtendimento = (typeof TIPOS)[number]["id"]

export type Passo = {
  id: string
  texto: string
  autorNome: string | null
  criadoEm: string
}

export type Atendimento = {
  id: string
  unitId: string
  code: string
  loja: string
  tipo: TipoAtendimento
  tipoLabel: string
  titulo: string
  abertoEm: string
  resolvidoEm: string | null
  /** Dias em aberto — ou quantos levou pra resolver. */
  dias: number
  passos: Passo[]
}
