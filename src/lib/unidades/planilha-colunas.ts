/**
 * As colunas da planilha de unidades — usadas pra EXPORTAR e pra IMPORTAR.
 *
 * ⚠️ UM LUGAR SÓ, de propósito. Se a lista do modelo e a do leitor fossem
 * separadas, bastaria alguém acrescentar uma coluna num lado pra o cliente
 * preencher um campo que a importação ignora em silêncio — o pior tipo de
 * falha, porque parece que funcionou.
 *
 * A ordem aqui é a ordem das colunas no arquivo, e é a ordem de quem preenche:
 * identificação, depois endereço, depois o que é fiscal/operacional. Campo
 * obrigatório vem antes do opcional dentro de cada bloco.
 */
import {
  TIPOS_COZINHA,
  TIPOS_ENTREGA,
  TIPOS_OPERACAO,
} from "@/lib/unidade-perfil"

export const REGIMES_FISCAIS = [
  { id: "simples", label: "Simples Nacional" },
  { id: "normal", label: "Regime Normal (credita imposto)" },
] as const

export type ColunaPlanilha = {
  /** Cabeçalho exibido na planilha. É por ele que a importação encontra. */
  titulo: string
  /** Campo em `units` (ou pseudo-campo tratado à parte). */
  campo: string
  obrigatorio: boolean
  /** Ajuda que vai na aba de instruções. */
  ajuda: string
  /** Lista fechada: id aceito → rótulo humano. Vazio = texto livre. */
  opcoes?: { id: string; label: string }[]
  largura: number
}

export const COLUNAS: ColunaPlanilha[] = [
  {
    titulo: "Código",
    campo: "code",
    obrigatorio: true,
    ajuda:
      "Identificador da loja na sua rede (ex.: 01, 02, JK). É a CHAVE da importação: código que já existe ATUALIZA a loja, código novo CRIA. Não repita.",
    largura: 10,
  },
  {
    titulo: "Nome da unidade",
    campo: "name",
    obrigatorio: true,
    ajuda: "Como você chama a loja no dia a dia (ex.: Jardins, Shopping Ibirapuera).",
    largura: 28,
  },
  {
    titulo: "CNPJ",
    campo: "cnpj",
    obrigatorio: true,
    ajuda:
      "Só números ou com pontuação, tanto faz. É por ele que a loja do iFood casa sozinha com a daqui — sem CNPJ, o vínculo é manual.",
    largura: 20,
  },
  {
    titulo: "Razão social",
    campo: "razao_social",
    obrigatorio: true,
    ajuda: "Nome empresarial, como está na Receita.",
    largura: 30,
  },
  {
    titulo: "Tipo de cozinha",
    campo: "tipo_cozinha",
    obrigatorio: true,
    ajuda:
      "Escolha um da lista. É o que permite comparar sua loja com as outras do mesmo tipo.",
    opcoes: TIPOS_COZINHA.map((t) => ({ id: t.id, label: t.label })),
    largura: 22,
  },
  {
    titulo: "Endereço",
    campo: "logradouro",
    obrigatorio: true,
    ajuda: "Rua/avenida, sem o número.",
    largura: 30,
  },
  { titulo: "Número", campo: "numero", obrigatorio: true, ajuda: "Número do imóvel.", largura: 10 },
  {
    titulo: "Complemento",
    campo: "complemento",
    obrigatorio: false,
    ajuda: "Opcional — sala, andar, bloco.",
    largura: 16,
  },
  { titulo: "Bairro", campo: "bairro", obrigatorio: true, ajuda: "Bairro.", largura: 20 },
  {
    titulo: "Cidade",
    campo: "city",
    obrigatorio: true,
    ajuda:
      "Pode escrever sem acento ou em caixa alta: o sistema corrige pela lista oficial do IBGE ao salvar.",
    largura: 22,
  },
  {
    titulo: "UF",
    campo: "state",
    obrigatorio: true,
    ajuda: "Sigla de 2 letras (SP, MG, RJ…). Precisa bater com a cidade.",
    largura: 6,
  },
  { titulo: "CEP", campo: "cep", obrigatorio: true, ajuda: "Com ou sem traço.", largura: 12 },
  {
    titulo: "Telefone",
    campo: "telefone",
    obrigatorio: true,
    ajuda: "Com DDD.",
    largura: 16,
  },
  {
    titulo: "Responsável",
    campo: "responsavel_nome",
    obrigatorio: true,
    ajuda: "Quem responde pela loja no dia a dia.",
    largura: 24,
  },
  {
    titulo: "E-mail do responsável",
    campo: "responsavel_email",
    obrigatorio: false,
    ajuda:
      "Opcional. Muito gerente de loja não tem e-mail próprio, e travar o cadastro por isso fazia a pessoa desistir no meio.",
    largura: 28,
  },
  {
    titulo: "Modelo da unidade",
    campo: "tipo_operacao",
    obrigatorio: true,
    ajuda: "Própria, franquia ou licenciada.",
    opcoes: TIPOS_OPERACAO.map((t) => ({ id: t.id, label: t.label })),
    largura: 18,
  },
  {
    titulo: "Regime fiscal",
    campo: "regime_fiscal",
    obrigatorio: true,
    ajuda: "Muda como o imposto entra no custo.",
    opcoes: REGIMES_FISCAIS.map((t) => ({ id: t.id, label: t.label })),
    largura: 20,
  },
  {
    titulo: "Quem entrega",
    campo: "tipo_entrega",
    obrigatorio: true,
    ajuda:
      "Não é detalhe: em entrega própria o frete entra no caixa da loja e a comissão da plataforma tem outro nome no extrato. Comparar loja de entrega própria com loja de entrega da plataforma sem saber disso é comparar coisas diferentes.",
    opcoes: TIPOS_ENTREGA.map((t) => ({ id: t.id, label: t.label })),
    largura: 22,
  },
  {
    titulo: "Inauguração",
    campo: "data_inauguracao",
    obrigatorio: true,
    ajuda:
      "DD/MM/AAAA. A cobertura de importação ignora os meses anteriores à inauguração — sem ela, a loja aparece devendo dado que nunca existiu.",
    largura: 14,
  },
  {
    titulo: "Plataformas",
    campo: "platforms",
    obrigatorio: true,
    ajuda:
      "Onde a loja vende, separado por ponto e vírgula. Aceita: ifood; 99food; keeta; cardapioweb. Ex.: ifood;99food",
    largura: 26,
  },
  /* IDs da loja em cada plataforma.
   *
   * Pseudo-campos: não moram em `units` e sim em `unit_platforms`, como
   * `platforms` e `active`. Quem escreve é `sincronizarPlataformas`.
   *
   * Existem porque a criação em lote não tinha como gravá-los: a planilha
   * dizia QUAIS plataformas a loja usa e nunca QUAL loja ela é em cada uma.
   * As 16 lojas da Churrasco Royal entraram assim em 19/08/26 — o cadastro
   * completo, e o 99 sem ter como reconhecer nenhuma delas.
   *
   * Cardápio Web fica de fora de propósito: o vínculo dele é OAuth por loja e
   * mora em `cardapioweb_installs`, não aqui. Uma coluna seria preenchida à
   * toa. */
  {
    titulo: "ID iFood",
    campo: "id_ifood",
    obrigatorio: false,
    ajuda:
      "Número da loja no iFood (ex.: 260777) — o mesmo que aparece como ID DA LOJA nos relatórios. É por ele que a importação de planilha do iFood acha a loja. Quem conectou por API não precisa preencher.",
    largura: 14,
  },
  {
    titulo: "ID 99 Food",
    campo: "id_99food",
    obrigatorio: false,
    ajuda:
      "ID da loja no 99 Food — 19 dígitos, copie do relatório sem reformatar. Sem ele o dado do 99 chega e não acha a loja.",
    largura: 22,
  },
  {
    titulo: "ID Keeta",
    campo: "id_keeta",
    obrigatorio: false,
    ajuda: "ID da loja na Keeta (ex.: 159476634).",
    largura: 14,
  },
  {
    titulo: "Ativa",
    campo: "active",
    obrigatorio: false,
    ajuda:
      "sim ou não. Vazio = sim. Loja marcada como NÃO para de sincronizar e sai da lista padrão.",
    largura: 8,
  },
]

/** Campos que NÃO são colunas de `units` — vivem em `unit_platforms`. */
export const PSEUDO_CAMPOS = new Set([
  "platforms",
  "active",
  "id_ifood",
  "id_99food",
  "id_keeta",
])

/** Coluna de ID → plataforma correspondente. */
export const CAMPO_ID_POR_PLATAFORMA = {
  ifood: "id_ifood",
  "99food": "id_99food",
  keeta: "id_keeta",
} as const

/** Cabeçalho do arquivo, na ordem. */
export const CABECALHO = COLUNAS.map((c) => c.titulo)

/**
 * Acha a coluna pelo título do arquivo, tolerando o que o Excel faz com o
 * texto: acento perdido, caixa trocada, espaço sobrando. Sem isso, uma
 * planilha salva como CSV em outro editor deixaria de ser lida por causa de
 * um "Codigo" sem acento.
 */
export function acharColuna(tituloDoArquivo: string): ColunaPlanilha | null {
  const chave = normalizar(tituloDoArquivo)
  return COLUNAS.find((c) => normalizar(c.titulo) === chave) ?? null
}

export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

/**
 * Converte o que a pessoa escreveu num campo de lista pro id do sistema.
 * Aceita o id ("propria") e o rótulo ("Própria"), com ou sem acento — quem
 * preenche vê o rótulo na planilha e é isso que vai digitar.
 */
export function idDaOpcao(
  coluna: ColunaPlanilha,
  valor: string,
): string | null {
  if (!coluna.opcoes) return valor
  const v = normalizar(valor)
  if (!v) return null
  const achou = coluna.opcoes.find(
    (o) => normalizar(o.id) === v || normalizar(o.label) === v,
  )
  return achou?.id ?? null
}
