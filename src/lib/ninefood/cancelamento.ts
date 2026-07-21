/**
 * Tradução dos campos de cancelamento do 99 Food (relatório "Dados do pedido").
 *
 * O XLSX da 99 traz esses campos em inglês/código cru:
 *  - "Parte responsável pelo cancelamento" → "B duty" / "P duty" / "C duty" /
 *    "D duty" (convenção DiDi: B=Business/loja, P=Platform, C=Customer, D=Delivery).
 *  - "Motivos de cancelamentos por parte do comerciante" → frases em inglês.
 *
 * Traduzimos na exibição (nada é regravado). Motivo desconhecido passa direto.
 */

/** "B duty" → "Loja", etc. Vazio → "Não informado". */
export function responsavelCancelamentoLabel(raw: string | null): string {
  const text = (raw ?? "").trim()
  if (!text) return "Não informado"

  const letra = text.charAt(0).toUpperCase()
  const map: Record<string, string> = {
    B: "Loja",
    P: "Plataforma (99Food)",
    C: "Cliente",
    D: "Entregador",
  }
  // Só traduz o padrão "<letra> duty"; qualquer outra coisa passa direto.
  if (/^[a-z]\s*duty$/i.test(text) && map[letra]) return map[letra]
  return text
}

/** Motivos conhecidos do relatório da 99 → pt-BR. Desconhecido passa direto. */
const MOTIVO_LABEL: Record<string, string> = {
  "courier report-store is closed": "Loja fechada (reportado pelo entregador)",
  "courier-store not open": "Loja não abriu (entregador)",
  "shop-item sold out": "Item esgotado",
  "shop-item sold out and order cancelled directly":
    "Item esgotado (cancelou direto)",
  "shop-store cannot prepare order": "Loja não conseguiu preparar",
  "store falsely reported that the order was ready for pickup":
    "Loja marcou “pronto” indevidamente",
  "system-store do not confirm orders in time":
    "Loja não confirmou a tempo",
}

export function motivoCancelamentoLabel(raw: string | null): string {
  const text = (raw ?? "").trim()
  if (!text) return text
  return MOTIVO_LABEL[text.toLowerCase()] ?? text
}

/**
 * Rótulo pro ranking de cancelamentos do 99.
 *
 * A 99 só preenche "motivo" quando o cancelamento é do comerciante — na
 * maioria dos casos ele vem vazio e a única pista é a parte responsável
 * ("B/P/C/D duty"). Agrupar só por motivo escondia esses cancelamentos do
 * dashboard; agora o responsável entra como rótulo quando o motivo falta.
 *
 * Devolve `null` quando não há motivo nem responsável — aí não há o que
 * mostrar e a linha continua fora do ranking.
 */
export function cancelamentoRankingLabel(
  motivo: string | null,
  parteResponsavel: string | null,
): string | null {
  const mot = motivoCancelamentoLabel(motivo)
  if (mot) return mot
  if (!(parteResponsavel ?? "").trim()) return null
  return `Cancelado — ${responsavelCancelamentoLabel(parteResponsavel)}`
}
