/**
 * As duas formas de desconto, num lugar só.
 *
 *  • NEGOCIADO — o que foi combinado com o cliente. Vale todo mês, enquanto
 *    durar (`ate` vazio = enquanto ele for cliente).
 *  • CUPOM de indicação — vale UMA vez, na primeira fatura.
 *
 * ── REGRA: VALE O MAIOR, NÃO OS DOIS ─────────────────────────────────────
 * Somar transformava "20% + metade no primeiro mês" em 60,4% de desconto
 * (545 → 436 → 218,40), um número que não sai de nenhuma conversa e que
 * ninguém explica pro cliente. "Metade no primeiro mês" quer dizer metade do
 * preço; é isso que a fatura precisa mostrar.
 *
 * ── POR QUE UM MÓDULO SÓ ─────────────────────────────────────────────────
 * O mesmo cálculo acontece em dois lugares que não se conversam: a emissão de
 * faturas (cobrança manual) e o checkout do Asaas (self-service). Enquanto
 * eram duas contas escritas à mão, o desconto negociado existia numa e não na
 * outra — cliente com 20% acordado que migrasse pro Asaas voltava a pagar
 * cheio, em silêncio.
 */

export type DescontoNegociado = {
  tipo: "percentual" | "valor" | null
  valor: number
  /** YYYY-MM-DD. Vazio = sem prazo. */
  ate: string | null
}

export type ResultadoDesconto = {
  /** O que cobrar. */
  valor: number
  /** Preço sem desconto nenhum. */
  cheio: number
  /** Qual desconto valeu neste mês. */
  origem: "cheio" | "negociado" | "cupom"
  /** Quanto ficaria com o negociado — pra dizer o valor dos meses seguintes. */
  valorNegociado: number | null
  valorCupom: number | null
  /** Frase pra nota da fatura / tela. */
  nota: string | null
}

function vigente(d: DescontoNegociado, hojeISO: string): boolean {
  return d.tipo != null && d.valor > 0 && (!d.ate || d.ate >= hojeISO)
}

export function aplicarDescontos(
  cheio: number,
  negociado: DescontoNegociado,
  cupomPct: number,
  hojeISO: string,
  notaNegociada?: string | null,
): ResultadoDesconto {
  if (cheio <= 0)
    return {
      valor: cheio,
      cheio,
      origem: "cheio",
      valorNegociado: null,
      valorCupom: null,
      nota: null,
    }

  const valorNegociado = vigente(negociado, hojeISO)
    ? Math.max(
        0,
        negociado.tipo === "percentual"
          ? Math.round(cheio * (100 - negociado.valor)) / 100
          : Math.round((cheio - negociado.valor) * 100) / 100,
      )
    : null

  const valorCupom =
    cupomPct > 0 ? Math.round(cheio * (100 - cupomPct)) / 100 : null

  const candidatos = [valorNegociado, valorCupom].filter(
    (v): v is number => v != null,
  )
  const valor = candidatos.length ? Math.min(...candidatos) : cheio
  const origem =
    valorCupom != null && valor === valorCupom
      ? "cupom"
      : valorNegociado != null && valor === valorNegociado
        ? "negociado"
        : "cheio"

  const rotuloNeg =
    negociado.tipo === "percentual"
      ? `${negociado.valor}%`
      : `R$ ${negociado.valor.toFixed(2)}`

  let nota: string | null = null
  if (origem === "cupom") {
    nota = `Cupom de indicação: ${cupomPct}% na 1ª fatura (de ${cheio.toFixed(2)} por ${valor.toFixed(2)}).`
    if (valorNegociado != null)
      nota += ` A partir da próxima, vale o desconto negociado de ${rotuloNeg} (R$ ${valorNegociado.toFixed(2)}).`
  } else if (origem === "negociado") {
    nota = `Desconto negociado: ${rotuloNeg}${
      negociado.ate
        ? ` (até ${negociado.ate.split("-").reverse().join("/")})`
        : ""
    } — de ${cheio.toFixed(2)} por ${valor.toFixed(2)}.${
      notaNegociada ? ` ${notaNegociada}` : ""
    }`
    if (valorCupom != null)
      nota += ` (O cupom de ${cupomPct}% na 1ª fatura daria ${valorCupom.toFixed(2)}; vale o maior desconto, não os dois.)`
  }

  return { valor, cheio, origem, valorNegociado, valorCupom, nota }
}
