/**
 * Tratamento do motivo de cancelamento da Keeta.
 *
 * Diferente do iFood (códigos: "411 - O pedido está atrasado") e do 99
 * ("Shop-Item sold out"), a Keeta não manda motivo estruturado: o campo
 * `motivo_cancelamento` é o TEXTO LIVRE que o cliente escreveu na
 * reclamação, com os links das fotos anexados no fim:
 *
 *   "Pedi e paguei por um churrasco de cupim e recebi frango  Link da
 *    imagem : http://img-eu.mykeeta.net/…jpg,http://…jpg"
 *
 * Consequência: agrupar pelo texto cru dava 1 ocorrência por cancelamento
 * (153 cancelamentos = 153 "motivos"), e o Top 5 virava 5 reclamações
 * soltas com URL vazando no card.
 *
 * Aqui a gente (1) limpa o texto e (2) classifica em tema, pra o ranking
 * responder "o que mais faz cliente cancelar" em vez de listar frases.
 */

/**
 * Tira os links de foto e normaliza o espaçamento.
 * Devolve "" quando o cliente só anexou imagem, sem escrever nada.
 */
export function limparMotivoKeeta(raw: string | null): string {
  if (!raw) return ""
  return raw
    // "Link da imagem : http://…,http://…" — sempre vem no fim.
    // [\s\S] no lugar da flag /s: o target do tsconfig é pré-ES2018.
    .replace(/link da imagem\s*:[\s\S]*$/i, "")
    // Sobra de URL solta, caso a Keeta mude o rótulo.
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Temas, em ordem de prioridade — o primeiro da lista ganha quando dois
 * empatam na pontuação. A ordem é por gravidade/acionabilidade: corpo
 * estranho é o que mais queima a loja, "outros" é o resto.
 *
 * Cada padrão tem peso: 2 = indício forte (a frase diz o tema com todas as
 * letras), 1 = indício fraco (sugere, mas pode ser outra coisa). Isso
 * resolve as reclamações mistas — "pedi um book e veio faltado o
 * refrigerante" tem o fraco de troca ("pedi … e veio") e o forte de falta
 * ("faltado"), então cai em falta, que é o certo.
 */
const TEMAS: Array<{ tema: string; padroes: Array<[RegExp, number]> }> = [
  {
    tema: "Corpo estranho",
    padroes: [
      [/fio de cabelo|cabelo\b/, 2],
      [/vidro|brinco|inseto|barata|mosca|unha|prego|par[aá]fuso/, 2],
    ],
  },
  {
    tema: "Item errado",
    padroes: [
      [/veio errado|pedido errado|veio trocad|trocad[oa]\b/, 2],
      [/ao inv[eé]s|inv[eé]s de|em vez de|no lugar veio/, 2],
      [/outro restaurante|outra pessoa|de outra loja|da loja \w/, 2],
      [/totalmente diferente|item diferente|produto diferente/, 2],
      [/(?:mandaram|enviaram|me enviaram|mandou)\s+(?:outr|um outro)/, 2],
      // "pedi costela e veio frango" — mas não "pedi e não veio a salada".
      [
        /\bpedi\b[^.!?]{0,90}?[,e]\s+(?:me\s+)?(?:veio|vieram|recebi|mandaram|enviaram|mandou|enviou)\b/,
        1,
      ],
      // "veio coca normal, eu solicitei coca zero" / "me enviaram aipim…
      // eu pedi mandioquinha"
      [
        /(?:veio|vieram|enviaram|mandaram|recebi)\b[^.!?]{0,60}?[.,]?\s*(?:eu\s+)?(?:solicitei|pedi)\b/,
        1,
      ],
      // "paguei por costela e me enviaram sobrecoxa"
      [
        /pagu(?:ei|amos)\b[^.!?]{0,90}?[,e]\s+(?:me\s+)?(?:veio|vieram|recebi|enviaram|mandaram)\b/,
        1,
      ],
      // "pedi brisket e costela. Porém, veio 2 de brisket" (cruza a frase)
      [/por[ée]m,?\s*(?:veio|vieram)/, 1],
    ],
  },
  {
    tema: "Item faltando",
    padroes: [
      [/falt(?:ou|ando|ado|a|am)\b/, 2],
      [/n[ãa]o\s+(?:veio|vieram|recebi|foi enviad|enviaram|chegou)/, 2],
      [/esquec(?:eram|eu)/, 2],
      [/incomplet[oa]/, 2],
      [/(?:veio|vieram|chegou|entregue)\s+sem\b/, 2],
      // Reclamação em inglês aparece de vez em quando.
      [/did not receive|not received|\bmissing\b/, 2],
      [
        /s[óo]\s+(?:veio|vieram|tem|chegou|um|uma|\d)\b|apenas (?:um|uma|\d)\b/,
        1,
      ],
      // "o milho veio, o brigadeiro nao" — item citado seguido de negação.
      [/,\s*(?:o|a|os|as)\s+[\wáâãéêíóôõúç]+\s+n[ãa]o\b/, 1],
    ],
  },
  {
    tema: "Embalagem/derramou",
    padroes: [
      [/derram|vaz(?:ou|ando|amento)|esparramad|virad[oa]\b/, 2],
      [/rasgad|violad|estourad|lacre/, 2],
      [/(?:veio|chegou)\s+abert[oa]/, 2],
      [/bagun[çc]ad|mexid[oa]\b|caindo/, 1],
    ],
  },
  {
    tema: "Qualidade da comida",
    padroes: [
      [/gelad[oa]|congelad[oa]|\bfri[oa]\b/, 2],
      [/\bcru\b|sem gosto|sem tempero|mal passad|queimad/, 2],
      [/quase nada|pouca (?:comida|quantidade)|muito arroz/, 1],
    ],
  },
  {
    tema: "Atraso na entrega",
    padroes: [[/atras(?:o|ou|ad)|demor(?:a|ou|ando)|vai demorar/, 2]],
  },
  {
    tema: "Problema no entregador",
    padroes: [[/motoboy|entregador|motoqueiro/, 2]],
  },
  {
    tema: "Loja fechada",
    padroes: [
      [
        /estabelecimento fechado|loja fechada|fechado para pausa|n[ãa]o abriu/,
        2,
      ],
    ],
  },
  {
    tema: "Cliente desistiu",
    padroes: [
      [
        /cliente pediu para cancelar|desisti|quero pedir (?:um )?(?:maior|outro)|pedido duplicad/,
        2,
      ],
    ],
  },
]

/** Quando o cliente só mandou foto, sem escrever. */
export const TEMA_SEM_DESCRICAO = "Sem descrição (só foto)"
/** Escreveu algo que não se encaixa em nenhum tema conhecido. */
export const TEMA_OUTROS = "Outros motivos"

/**
 * Classifica o motivo livre da Keeta num tema.
 *
 * Soma os pesos dos padrões que batem, em vez de parar no primeiro match:
 * reclamação costuma misturar assunto ("o brigadeiro não veio, no lugar
 * veio milho" é falta E troca). Ganha o tema com mais pontos; no empate, a
 * ordem de TEMAS decide.
 *
 * Recebe o texto CRU — a limpeza acontece aqui dentro.
 */
export function temaCancelamentoKeeta(raw: string | null): string {
  const texto = limparMotivoKeeta(raw).toLowerCase()
  if (!texto) return TEMA_SEM_DESCRICAO

  let melhor = { tema: TEMA_OUTROS, pontos: 0 }
  for (const { tema, padroes } of TEMAS) {
    const pontos = padroes.reduce(
      (n, [re, peso]) => n + (re.test(texto) ? peso : 0),
      0,
    )
    // `>` e não `>=`: no empate fica o de maior prioridade (o que veio antes).
    if (pontos > melhor.pontos) melhor = { tema, pontos }
  }
  return melhor.tema
}
