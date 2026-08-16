/**
 * Os campos que fazem um cadastro de loja estar COMPLETO — em um lugar só.
 *
 * POR QUE EXISTE: a mesma lista já vivia em dois lugares (a contagem do aviso
 * e a validação do formulário), com um comentário em cada dizendo "se mudar
 * lá, muda aqui". Quando o selo por loja precisou da mesma resposta, a escolha
 * era criar a terceira cópia ou parar de copiar. Neste projeto já nasceram
 * cinco definições de "margem" exatamente assim.
 *
 * ⚠️ `complemento` e `responsavel_email` NÃO entram, de propósito: são
 * opcionais no formulário, e campo que o sistema não pede não pode contar como
 * lacuna — a loja ficaria eternamente "incompleta" por algo que ninguém cobra.
 *
 * Não é `server-only`: a lista precisa rodar no cliente pra pintar o selo em
 * cada card sem uma segunda ida ao banco.
 */

export const CAMPOS_CADASTRO = [
  "cnpj",
  "razao_social",
  "tipo_cozinha",
  "logradouro",
  "numero",
  "bairro",
  "cep",
  "telefone",
  "responsavel_nome",
  "tipo_operacao",
  "regime_fiscal",
  "tipo_entrega",
] as const

export type CampoCadastro = (typeof CAMPOS_CADASTRO)[number]

/** Rótulo humano de cada campo — pro tooltip dizer o que falta. */
export const ROTULO_CAMPO: Record<CampoCadastro | "data_inauguracao", string> = {
  cnpj: "CNPJ",
  razao_social: "razão social",
  tipo_cozinha: "tipo de cozinha",
  logradouro: "endereço",
  numero: "número",
  bairro: "bairro",
  cep: "CEP",
  telefone: "telefone",
  responsavel_nome: "responsável",
  tipo_operacao: "modelo da unidade",
  regime_fiscal: "regime fiscal",
  tipo_entrega: "quem entrega",
  data_inauguracao: "data de inauguração",
}

type UnidadeParcial = Partial<Record<CampoCadastro, string | null>> & {
  data_inauguracao?: string | null
}

/**
 * Quais campos faltam nesta loja, já com rótulo humano.
 *
 * `data_inauguracao` e a plataforma entram junto porque o formulário também as
 * exige — elas só não estão em CAMPOS_CADASTRO porque não são texto na tabela
 * de unidades (a plataforma mora em `unit_platforms`).
 */
export function camposFaltando(
  u: UnidadeParcial,
  opts: { temPlataforma?: boolean } = {},
): string[] {
  const faltam: string[] = []
  for (const c of CAMPOS_CADASTRO) {
    const v = u[c]
    if (!v || String(v).trim() === "") faltam.push(ROTULO_CAMPO[c])
  }
  if (!u.data_inauguracao) faltam.push(ROTULO_CAMPO.data_inauguracao)
  if (opts.temPlataforma === false) faltam.push("plataforma")
  return faltam
}
