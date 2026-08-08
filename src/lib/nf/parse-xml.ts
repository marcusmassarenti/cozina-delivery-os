/**
 * Leitor de NF-e (XML, modelo 55, layout 4.00).
 *
 * SEM biblioteca de XML de propósito: o que precisamos é um punhado de campos
 * de uma estrutura fixa e conhecida, e uma NF-e traz assinatura digital,
 * certificado X.509 em base64 e agora os blocos de IBS/CBS da reforma. Um
 * parser DOM completo carregaria tudo isso pra ler 12 tags. Aqui é regex sobre
 * o recorte certo -- e o `xml` original fica salvo no banco, então se um dia
 * precisarmos de um campo novo dá pra reprocessar sem pedir o arquivo de volta.
 *
 * Validado contra a NFe 2128 (CD Comercio de Alimentos → Churrasco no Pote
 * Brooklin, 07/08/2026): 22 itens, soma dos itens = vNF exato (R$ 18.895,86).
 */

export type NFItem = {
  nItem: number
  codigo: string
  descricao: string
  ncm: string | null
  cfop: string | null
  unidade: string
  quantidade: number
  valorUnitario: number
  valorTotal: number
  vIcms: number
  vPis: number
  vCofins: number
  vIpi: number
}

export type NFParsed = {
  chave: string
  numero: string | null
  serie: string | null
  emissao: string | null // YYYY-MM-DD
  emitCnpj: string | null
  emitNome: string | null
  destCnpj: string | null
  destNome: string | null
  valorTotal: number
  valorProdutos: number
  valorDesconto: number
  valorFrete: number
  valorIcms: number
  valorPis: number
  valorCofins: number
  valorIpi: number
  valorSt: number
  itens: NFItem[]
  /** Divergências encontradas — não impedem importar, mas a tela mostra. */
  avisos: string[]
}

export class NFInvalidaError extends Error {}

/** Primeira ocorrência de <tag>…</tag>, ignorando prefixo de namespace. */
function tag(xml: string, nome: string): string | null {
  const m = xml.match(
    new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`),
  )
  return m ? m[1].trim() : null
}

function num(xml: string, nome: string): number {
  const v = tag(xml, nome)
  const n = v == null ? NaN : Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Blocos <det>…</det> — um por item da nota. */
function blocosDet(xml: string): string[] {
  return [
    ...xml.matchAll(/<(?:\w+:)?det\s[^>]*>([\s\S]*?)<\/(?:\w+:)?det>/g),
  ].map((m) => m[1])
}

function apenasDigitos(v: string | null): string | null {
  if (!v) return null
  const d = v.replace(/\D/g, "")
  return d || null
}

export function parseNFe(xml: string): NFParsed {
  if (!/<(?:\w+:)?infNFe/.test(xml)) {
    throw new NFInvalidaError(
      "Este arquivo não é uma NF-e. Suba o XML da nota (o arquivo que termina em .xml, não o DANFE em PDF).",
    )
  }

  // A chave mora no atributo Id do infNFe, no formato "NFe" + 44 dígitos.
  const idMatch = xml.match(/<(?:\w+:)?infNFe[^>]*\bId="NFe(\d{44})"/)
  if (!idMatch) {
    throw new NFInvalidaError(
      "Não encontrei a chave de acesso da nota. O arquivo pode estar incompleto.",
    )
  }
  const chave = idMatch[1]

  const avisos: string[] = []

  // Nota cancelada ou denegada não é compra: não pode virar custo. cStat 100 =
  // autorizada. Sem protocolo é XML de envio, ainda não é documento fiscal.
  const cStat = tag(xml, "cStat")
  if (cStat && cStat !== "100") {
    throw new NFInvalidaError(
      `A nota não está autorizada (situação ${cStat}${
        tag(xml, "xMotivo") ? ` — ${tag(xml, "xMotivo")}` : ""
      }). Só entra nota autorizada.`,
    )
  }
  if (!cStat) avisos.push("XML sem protocolo de autorização da SEFAZ.")

  // Recortes: emit/dest têm CNPJ e xNome com os MESMOS nomes de tag, então ler
  // no XML inteiro pegaria sempre o emitente.
  const emit = tag(xml, "emit") ?? ""
  const dest = tag(xml, "dest") ?? ""
  const totais = tag(xml, "ICMSTot") ?? ""
  const ide = tag(xml, "ide") ?? ""

  const itens: NFItem[] = []
  for (const det of blocosDet(xml)) {
    const prod = tag(det, "prod") ?? ""
    const imposto = tag(det, "imposto") ?? ""
    const quantidade = num(prod, "qCom")
    const valorTotal = num(prod, "vProd")
    itens.push({
      nItem: itens.length + 1,
      codigo: tag(prod, "cProd") ?? "",
      descricao: tag(prod, "xProd") ?? "",
      ncm: tag(prod, "NCM"),
      cfop: tag(prod, "CFOP"),
      unidade: (tag(prod, "uCom") ?? "").toLowerCase(),
      quantidade,
      valorUnitario: num(prod, "vUnCom"),
      valorTotal,
      // Dentro de <imposto> os nomes são únicos, então tag() é seguro. Item
      // isento traz o bloco sem o valor (PISNT, COFINSNT) e num() devolve 0.
      vIcms: num(imposto, "vICMS"),
      vPis: num(imposto, "vPIS"),
      vCofins: num(imposto, "vCOFINS"),
      vIpi: num(imposto, "vIPI"),
    })
  }

  if (itens.length === 0) {
    throw new NFInvalidaError("A nota não tem nenhum item.")
  }

  const valorProdutos = num(totais, "vProd")
  const somaItens = itens.reduce((s, i) => s + i.valorTotal, 0)
  // Tolerância de 1 centavo por item: a NF-e arredonda cada linha, e a soma
  // pode ficar a centavos do total declarado sem que nada esteja errado.
  if (Math.abs(somaItens - valorProdutos) > itens.length * 0.01 + 0.01) {
    avisos.push(
      `A soma dos itens (R$ ${somaItens.toFixed(2)}) não bate com o total de produtos da nota (R$ ${valorProdutos.toFixed(2)}).`,
    )
  }

  const emissaoRaw = tag(ide, "dhEmi") ?? tag(ide, "dEmi")

  return {
    chave,
    numero: tag(ide, "nNF"),
    serie: tag(ide, "serie"),
    emissao: emissaoRaw ? emissaoRaw.slice(0, 10) : null,
    emitCnpj: apenasDigitos(tag(emit, "CNPJ")),
    emitNome: tag(emit, "xNome"),
    destCnpj: apenasDigitos(tag(dest, "CNPJ") ?? tag(dest, "CPF")),
    destNome: tag(dest, "xNome"),
    valorTotal: num(totais, "vNF"),
    valorProdutos,
    valorDesconto: num(totais, "vDesc"),
    valorFrete: num(totais, "vFrete"),
    valorIcms: num(totais, "vICMS"),
    valorPis: num(totais, "vPIS"),
    valorCofins: num(totais, "vCOFINS"),
    valorIpi: num(totais, "vIPI"),
    valorSt: num(totais, "vST"),
    itens,
    avisos,
  }
}

/**
 * Custo de um item, já considerando o regime da loja.
 *
 * Simples Nacional não credita imposto: o custo é o valor cheio da linha.
 * Regime Normal credita ICMS, PIS e COFINS -- eles saem do custo, porque
 * voltam. IPI não entra: nesta operação (CFOP 5102, revenda) ele não aparece,
 * e quando aparecer, para quem credita ele também sai.
 *
 * O rateio de frete e desconto NÃO está aqui de propósito: a nota validada tem
 * os dois zerados, e ratear sem caso real pra conferir é inventar. Quando
 * aparecer uma nota com frete, isto vira o lugar de tratar -- e o `xml` salvo
 * permite reprocessar o que já entrou.
 */
export function custoDoItem(
  item: Pick<NFItem, "valorTotal" | "vIcms" | "vPis" | "vCofins">,
  regime: "simples" | "normal",
): number {
  if (regime === "simples") return item.valorTotal
  const creditos = item.vIcms + item.vPis + item.vCofins
  // Crédito maior que a linha seria erro de leitura; nunca devolve negativo.
  return Math.max(0, item.valorTotal - creditos)
}
