/**
 * Perfil da unidade: tipo de cozinha e modelo de operação.
 *
 * Lista FECHADA de propósito. Em texto livre a mesma coisa vira "Japonês",
 * "japonesa" e "comida japonesa" na mesma base — e aí não dá pra responder a
 * pergunta que justifica ter o campo: "a minha hamburgueria fatura acima ou
 * abaixo das outras hamburguerias?".
 *
 * A ordem é por frequência no delivery brasileiro, não alfabética: quem
 * cadastra encontra o seu nas primeiras opções.
 */
export const TIPOS_COZINHA = [
  { id: "hamburgueria", label: "Hamburgueria" },
  { id: "pizzaria", label: "Pizzaria" },
  { id: "japonesa", label: "Japonesa / Oriental" },
  { id: "brasileira", label: "Brasileira / Caseira" },
  { id: "marmita", label: "Marmita / Prato feito" },
  { id: "lanches", label: "Lanches / Sanduíches" },
  { id: "churrasco", label: "Churrasco / Espetinho" },
  { id: "frango", label: "Frango / Assados" },
  { id: "acai", label: "Açaí" },
  { id: "doces", label: "Doces / Confeitaria" },
  { id: "sorveteria", label: "Sorveteria" },
  { id: "saudavel", label: "Saudável / Fit" },
  { id: "italiana", label: "Italiana" },
  { id: "massas", label: "Massas" },
  { id: "arabe", label: "Árabe" },
  { id: "mexicana", label: "Mexicana" },
  { id: "peixes", label: "Peixes / Frutos do mar" },
  { id: "vegetariana", label: "Vegetariana / Vegana" },
  { id: "pastel", label: "Pastelaria" },
  { id: "salgados", label: "Salgados" },
  { id: "padaria", label: "Padaria" },
  { id: "cafeteria", label: "Cafeteria" },
  { id: "bebidas", label: "Bebidas / Adega" },
  { id: "mercado", label: "Mercado / Conveniência" },
  { id: "outros", label: "Outros" },
] as const

export const TIPOS_OPERACAO = [
  { id: "propria", label: "Própria" },
  { id: "franquia", label: "Franquia" },
  { id: "licenciada", label: "Licenciada" },
] as const

/**
 * Quem entrega. Não é detalhe de cadastro: muda a leitura do dinheiro.
 *
 * Em entrega própria o iFood nomeia a comissão de outro jeito, o frete cobrado
 * do cliente entra no caixa da loja, e o "% que fica na loja" tem outro
 * patamar. Comparar uma loja de entrega própria com uma de entrega iFood sem
 * saber disso é comparar coisas diferentes — foi o que confundiu a leitura da
 * Yakisushi em 31/07.
 */
export const TIPOS_ENTREGA = [
  { id: "plataforma", label: "Entrega da plataforma" },
  { id: "propria", label: "Entrega própria da loja" },
  { id: "ambas", label: "As duas" },
] as const

export type TipoCozinha = (typeof TIPOS_COZINHA)[number]["id"]

export const rotuloCozinha = (id: string | null | undefined) =>
  TIPOS_COZINHA.find((t) => t.id === id)?.label ?? null

/* ------------------------------------------------------------------ *
 * Sugestão de cozinha pelo nome
 *
 * O iFood não devolve categoria na Merchant API (só id, name e
 * corporateName), então o nome da loja é o melhor sinal disponível.
 *
 * Conservador de propósito: quando o nome não diz nada ("Pasqual", "Sabores
 * da Luh"), devolve null em vez de chutar. Cadastro errado é pior que vazio —
 * ele contamina a comparação entre lojas do mesmo tipo, que é justamente o que
 * justifica o campo existir.
 * ------------------------------------------------------------------ */

/**
 * Camada de cima: quando a loja escreve a própria categoria no nome ("Santo
 * Peixe - Comida Japonesa"), isso vale mais que qualquer palavra da marca.
 * Sem isso, "Peixe" ganhava de "Japonesa" só por vir antes.
 */
const COZINHA_DECLARADA: Array<[TipoCozinha, RegExp]> = [
  ["japonesa", /comida (japon|oriental)/],
  ["brasileira", /comida (caseira|brasileira|mineira|baiana)/],
  ["arabe", /comida [áa]rabe/],
  ["mexicana", /comida mexicana/],
  ["italiana", /comida italiana/],
  ["vegetariana", /comida (vegetariana|vegana)/],
]

/**
 * Camada do meio. A ordem só desempata quando duas casam na MESMA posição —
 * o critério principal é vencer quem aparece antes no nome.
 *
 * Pela ordem da lista, "O Conde Churrascaria" virava pizzaria e "Espeto do
 * Chefe - Churrasco e Marmitex" virava marmita. Loja põe na frente o que ela é.
 */
const COZINHA_REGRAS: Array<[TipoCozinha, RegExp]> = [
  ["pizzaria", /pizza|forno a lenha|esfih/],
  ["japonesa", /sushi|temaki|yaki|poke|japon|oriental|wok|sashimi/],
  ["hamburgueria", /h[aá]mb|hamburg|burgu|burger|smash/],
  ["acai", /a[çc]a[íi]/],
  ["sorveteria", /sorvete|gelato|milkshake/],
  ["doces", /brownie|confeit|doces|bolo|chocolat|sobremesa/],
  ["marmita", /marmit|prato feito|quentinha/],
  ["churrasco", /churrasc|espet|espeto|grill|parrilla|costela/],
  ["frango", /frango|galeto|assados/],
  ["peixes", /peixe|frutos do mar|camar[ãa]o/],
  ["padaria", /padaria|pane|p[ãa]o/],
  ["salgados", /salgad|coxinh/],
  ["pastel", /pastel|pastelaria/],
  ["arabe", /[áa]rabe|kebab|shawarma|esfiha/],
  ["mexicana", /mexican|burrito|taco/],
  ["saudavel", /fit|saud[áa]vel|natural|salad/],
  ["cafeteria", /caf[ée]|cafeteria/],
  ["massas", /massas|macarr[ãa]o|talharim/],
  ["italiana", /italian|cantina/],
  // Genéricos por último: "Lanches" perde pra "Burguer" se os dois aparecem.
  ["lanches", /lanche|dog|hot ?dog|submarine|sandu|x-|xis /],
  ["brasileira", /caseir|fog[ãa]o|comidinha|sabor fam/],
]

/**
 * Camada de baixo: palavra que descreve o formato, não o prato. Só entra se
 * NENHUMA regra específica casou — senão "Restaurante Colher de Pau -
 * Marmitas" vira brasileira só porque "Restaurante" abre o nome.
 */
const COZINHA_GENERICA: Array<[TipoCozinha, RegExp]> = [
  ["brasileira", /restaurante|buffet|self ?service/],
]

function melhorCozinha(
  texto: string,
  regras: Array<[TipoCozinha, RegExp]>,
): TipoCozinha | null {
  const n = texto.toLowerCase()
  let melhor: { tipo: TipoCozinha; pos: number; ordem: number } | null = null
  regras.forEach(([tipo, re], ordem) => {
    const m = n.match(re)
    if (!m || m.index === undefined) return
    if (
      !melhor ||
      m.index < melhor.pos ||
      (m.index === melhor.pos && ordem < melhor.ordem)
    ) {
      melhor = { tipo, pos: m.index, ordem }
    }
  })
  return melhor ? (melhor as { tipo: TipoCozinha }).tipo : null
}

/**
 * O nome interno manda. O nome fantasia da Receita só entra quando o interno
 * não diz nada — ele costuma ser mais genérico e às vezes cita um produto
 * secundário da casa.
 */
export function inferirCozinha(
  nome: string,
  nomeFantasia?: string | null,
): TipoCozinha | null {
  const f = nomeFantasia ?? ""
  return (
    melhorCozinha(nome, COZINHA_DECLARADA) ??
    melhorCozinha(f, COZINHA_DECLARADA) ??
    melhorCozinha(nome, COZINHA_REGRAS) ??
    melhorCozinha(f, COZINHA_REGRAS) ??
    melhorCozinha(nome, COZINHA_GENERICA) ??
    melhorCozinha(f, COZINHA_GENERICA)
  )
}

/** O que a BrasilAPI devolve e a gente aproveita. */
export type DadosReceita = {
  razaoSocial: string
  nomeFantasia: string | null
  cnaeCodigo: string | null
  cnaeDescricao: string | null
  dataAbertura: string | null
  situacao: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cep: string | null
  cidade: string | null
  uf: string | null
  telefone: string | null
}

/**
 * Consulta o CNPJ na BrasilAPI (pública, sem chave, já liberada no CSP).
 *
 * Roda no NAVEGADOR de propósito: é o usuário digitando e vendo o campo
 * preencher. Se fosse no servidor, cada tecla viraria round-trip.
 *
 * Devolve null em qualquer falha — cadastro não pode travar porque a Receita
 * está fora do ar. O CNPJ continua obrigatório; o preenchimento é que é
 * conveniência.
 */
export async function consultarCnpj(
  cnpjDigitos: string,
): Promise<DadosReceita | null> {
  try {
    const r = await fetch(
      `https://brasilapi.com.br/api/cnpj/v1/${cnpjDigitos}`,
      { headers: { Accept: "application/json" } },
    )
    if (!r.ok) return null
    const d = (await r.json()) as Record<string, unknown>
    const txt = (k: string) => {
      const v = d[k]
      return typeof v === "string" && v.trim() ? v.trim() : null
    }
    return {
      razaoSocial: txt("razao_social") ?? "",
      nomeFantasia: txt("nome_fantasia"),
      cnaeCodigo: d.cnae_fiscal ? String(d.cnae_fiscal) : null,
      cnaeDescricao: txt("cnae_fiscal_descricao"),
      dataAbertura: txt("data_inicio_atividade"),
      situacao: txt("descricao_situacao_cadastral"),
      logradouro: txt("logradouro"),
      numero: txt("numero"),
      complemento: txt("complemento"),
      bairro: txt("bairro"),
      cep: txt("cep"),
      cidade: txt("municipio"),
      uf: txt("uf"),
      telefone: txt("ddd_telefone_1"),
    }
  } catch {
    return null
  }
}
