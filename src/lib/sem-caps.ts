/** Palavras que ficam minúsculas no meio do nome (ligação, não conteúdo). */
const LIGACAO = new Set(["de", "da", "do", "das", "dos", "e", "em", "para"])

/** Siglas que perderiam o sentido em caixa baixa. */
const SIGLAS = new Set([
  "pix", "ted", "doc", "cnpj", "cpf", "ltda", "sa", "s.a", "me", "epp",
  "eireli", "mei", "id", "cd", "vr", "va", "pr", "sp", "rj", "mg", "df",
  "iof", "ir", "gnre", "fgts", "inss",
])

/**
 * Tira o CAIXA ALTA do histórico bancário.
 *
 * O banco manda tudo maiúsculo — "PIX RECEBIDO DE VR BENEFICIOS E SERVICOS DE
 * PR" — e uma tela inteira assim cansa: sem as alturas de letra (o "b" que
 * sobe, o "p" que desce) a palavra perde a silhueta e a leitura vira
 * decodificação, letra por letra.
 *
 * ⚠️ NÃO altera o dado, só a exibição — quem chama põe o texto original no
 * `title`. O histórico do extrato é documento: quem for conferir com o banco
 * precisa dele caractere a caractere.
 *
 * Mora em `lib/` porque o mesmo histórico aparece em mais de uma tela
 * (Lançamentos e "Últimos lançamentos" da Visão Geral). Duplicar as listas de
 * siglas garantiria que uma sigla nova entrasse só numa delas.
 *
 * As regras saíram de rodar contra o extrato real do BTG:
 *  • texto com menos de 60% de maiúsculas passa intacto — "Aluguel SBC" tem
 *    40% e viraria "Aluguel Sbc";
 *  • palavra que JÁ tem minúscula não é tocada — sem isso "Visa
 *    Electron-Débito", que estava certo, virava "Visa electron-débito";
 *  • token com número (CNPJ, valor, código) fica exatamente como veio;
 *  • letra sozinha se preserva, senão "BRASIL S A" virava "Brasil S a";
 *  • capitaliza a primeira LETRA e não o primeiro caractere, senão "(CARTÃO"
 *    virava "(cartão" — o parêntese comia a maiúscula.
 */
export function semCaps(texto: string): string {
  const letras = texto.replace(/[^A-Za-zÀ-ÿ]/g, "")
  if (letras.length < 4) return texto
  const maiusculas = (texto.match(/[A-ZÀ-Þ]/g) ?? []).length
  if (maiusculas / letras.length < 0.6) return texto

  return texto
    .split(" ")
    .map((palavra, i) => {
      if (/\d/.test(palavra)) return palavra
      if (/[a-zà-ÿ]/.test(palavra)) return palavra
      const limpa = palavra
        .replace(/[^A-Za-zÀ-ÿ.]/g, "")
        .replace(/\.+$/, "")
        .toLowerCase()
      if (limpa.length <= 1) {
        return i > 0 && limpa === "e" ? palavra.toLowerCase() : palavra
      }
      if (SIGLAS.has(limpa)) return palavra
      const baixa = palavra.toLowerCase()
      if (i > 0 && LIGACAO.has(limpa)) return baixa
      return baixa.replace(/[a-zà-ÿ]/, (c) => c.toUpperCase())
    })
    .join(" ")
}
