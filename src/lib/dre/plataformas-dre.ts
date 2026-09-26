/**
 * As linhas de TAXA por plataforma do DRE — um lugar só pro DRE da rede
 * (`resultado.ts`) e o da loja (`financeiro-loja-tab.tsx`).
 *
 * ── POR QUE (Marcus, 25/09/26: "DRE não está batendo os valores com o
 * dashboard") ─────────────────────────────────────────────────────────────
 * As duas telas tinham uma cópia cada desta montagem, e as duas erravam igual
 * (a "cópia sem a regra" de novo):
 *
 *  1. A linha de cada plataforma mostrava só a soma das taxas ITEMIZADAS,
 *     enquanto o total da demonstração é `bruto − descontos − repasse −
 *     recebido direto`. O que a itemização não explicava ia pra uma linha
 *     escondida dentro da plataforma, e as linhas não somavam o total: no
 *     CnP de set/26, R$ 309.613 nas linhas contra R$ 387.098 no total.
 *  2. iFood: a "Taxa de entrega" parceira entrava como custo da loja. Ela é
 *     paga pelo cliente (vem dentro da Entrada Financeira) e o portal a marca
 *     como informativa — ver `lib/ifood-bruto.ts`. O mesmo vale pra taxa de
 *     serviço cobrada do cliente. Contá-las gerava um "recebido a mais que as
 *     taxas explicam" de R$ 57.503 no CnP. E a taxa de transação, que É custo,
 *     não aparecia.
 *  3. Keeta: a abertura vinha da Fatura, que é por CICLO de repasse e fica
 *     incompleta no mês corrente — R$ 134.988 de "diferença não explicada".
 *     Os pedidos fecham ao centavo (0272).
 *
 * A regra agora: a linha da plataforma É a taxa real (a mesma conta do total
 * e do Dashboard); a abertura mostra os itens e, se sobrar diferença, ela
 * aparece com nome — nunca some.
 */
import type { PlatformId } from "@/components/platform-logo"

export type ItemTaxaDre = {
  label: string
  value: number
  /** Linha positiva (a plataforma devolveu/creditou). Subtrai da soma. */
  credit?: boolean
  /** Mostra, mas não soma (já está dentro do bruto — ver DrePlat). */
  info?: boolean
}

export type PlataformaDre = {
  id: PlatformId
  name: string
  bruto: number
  liquido: number
  taxaTotal: number
  vrLiquido: number
  recebidoDireto: number
  perdaCancelamento: number
  cancelQtd: number
  descontos: { label: string; value: number }[]
  /** Promoção/cupom que a LOJA bancou (card "Para onde vai o bruto"). */
  promocoesLoja: number
  itens: ItemTaxaDre[]
}

/**
 * O que sobra da conta do iFood depois dos itens: anúncio avulso, saldo
 * devedor, frete sob demanda (débitos) ou ressarcimento, reembolso de
 * subsídio, frete da entrega própria (créditos). No CnP de set/26, ~R$ 1,6 mil
 * de R$ 163,6 mil.
 */
export const ROTULO_DIFERENCA_IFOOD = {
  falta: "Outros débitos do extrato (anúncios avulsos, saldo devedor…)",
  sobra: "Outros créditos do extrato (ressarcimentos, reembolsos…)",
}

/** Abertura das taxas do iFood a partir do resumo da conciliação. */
export function itensTaxaIfood(r: {
  comissao: number
  transacao: number
  promoLoja: number
  mensalidadeAnuncios: number
}): ItemTaxaDre[] {
  return [
    { label: "Comissão", value: Math.abs(r.comissao) },
    { label: "Taxa de transação", value: Math.abs(r.transacao) },
    { label: "Promoções (loja bancou)", value: Math.abs(r.promoLoja) },
    { label: "Mensalidade / anúncios", value: Math.abs(r.mensalidadeAnuncios) },
  ]
}

/** Quebra oficial da Fatura da Keeta (só como reserva — ver o topo). */
export type FaturaKeeta = {
  hasData: boolean
  comissao: number
  taxaDistancia: number
  taxaPagamentoOnline: number
  taxaSaqueAntecipado: number
  taxaServicoMensal: number
  publicidade: number
  ajusteComissao: number
  deducaoAjuda: number
  promoLoja: number
}

/**
 * Abertura das taxas da Keeta. PEDIDOS primeiro (fecham ao centavo com o
 * repasse, que também vem deles); a Fatura só quando não há relatório de
 * pedidos no mês; sem nenhum dos dois, ao menos a promoção.
 */
export function itensTaxaKeeta(r: {
  pedidos?: {
    comissao: number
    pagamentoOnline: number
    promoLoja: number
    outrosGanhos: number
  } | null
  fatura?: FaturaKeeta | null
  promoFallback?: number
}): ItemTaxaDre[] {
  const p = r.pedidos
  if (p && Math.abs(p.comissao) + Math.abs(p.pagamentoOnline) + Math.abs(p.promoLoja) > 0) {
    return [
      { label: "Comissão + distância", value: p.comissao },
      { label: "Taxa de pagamento online", value: p.pagamentoOnline },
      { label: "Promoções (loja bancou)", value: p.promoLoja },
      { label: "Outros ganhos (crédito da Keeta)", value: p.outrosGanhos, credit: true },
    ]
  }
  const f = r.fatura
  if (f?.hasData) {
    return [
      { label: "Comissão", value: f.comissao },
      { label: "Taxa de distância", value: f.taxaDistancia },
      { label: "Taxa de pagamento online", value: f.taxaPagamentoOnline },
      { label: "Saque antecipado", value: f.taxaSaqueAntecipado },
      { label: "Taxa de serviço mensal", value: f.taxaServicoMensal },
      { label: "Publicidade / marketing", value: f.publicidade },
      { label: "Ajuste de comissão", value: f.ajusteComissao },
      { label: "Serviço da Ajuda", value: f.deducaoAjuda },
      { label: "Promoções (loja bancou)", value: f.promoLoja },
    ]
  }
  return [{ label: "Promoções (loja bancou)", value: r.promoFallback ?? 0 }]
}

/**
 * Monta a linha de uma plataforma. A taxa é a REAL — `bruto − descontos −
 * repasse − recebido direto` —, a mesma conta do total e do Dashboard.
 *
 * Exceção: quando essa conta dá NEGATIVA (repasse maior que o bruto), vale a
 * soma dos itens. É o caso da Pizzaria Forno a Lenha 4 (DG FOODS): o líquido
 * do 99 veio maior que a venda, a conta dava −R$ 2.688,14 e a tela mostrava
 * "Taxas R$ 0,00" com R$ 11.601,89 de taxa itemizada embaixo.
 */
export function montarPlataformaDre(p: {
  id: PlatformId
  name: string
  bruto: number
  liquido: number
  itens: ItemTaxaDre[]
  vrLiquido?: number
  recebidoDireto?: number
  descontos?: { label: string; value: number }[]
  cancel?: { valor: number; qtd: number }
  promoLoja?: number
  /** Nome da diferença quando falta taxa / quando sobra crédito. */
  rotuloDiferenca?: { falta: string; sobra: string }
}): PlataformaDre | null {
  if (p.bruto <= 0) return null
  const descontos = p.descontos ?? []
  const recebidoDireto = p.recebidoDireto ?? 0
  const lista: ItemTaxaDre[] = p.itens.filter((i) => Math.abs(i.value) > 0.005)
  const somaItens = lista.reduce(
    (s, i) => s + (i.info ? 0 : i.credit ? -Math.abs(i.value) : i.value),
    0,
  )
  const descontoTotal = descontos.reduce((s, d) => s + Math.max(0, d.value), 0)
  const derivada = p.bruto - descontoTotal - p.liquido - recebidoDireto
  const temRepasse = p.liquido > 0
  const taxaTotal =
    temRepasse && derivada >= 0
      ? derivada
      : somaItens > 0
        ? somaItens
        : Math.max(0, derivada)

  /* O que a itemização não explica aparece COM NOME e dentro da conta: a
     abertura soma a linha da plataforma, que soma o total. */
  const diferenca = temRepasse ? derivada - somaItens : 0
  if (Math.abs(diferenca) > 0.5) {
    const rot = p.rotuloDiferenca ?? {
      falta: "Diferença não explicada pelas taxas",
      sobra: "Recebido a mais que as taxas explicam",
    }
    lista.push({
      label: diferenca > 0 ? rot.falta : rot.sobra,
      value: Math.abs(diferenca),
      credit: diferenca < 0,
    })
  }

  return {
    id: p.id,
    name: p.name,
    bruto: p.bruto,
    liquido: p.liquido,
    taxaTotal,
    vrLiquido: p.vrLiquido ?? 0,
    recebidoDireto,
    perdaCancelamento: p.cancel?.valor ?? 0,
    cancelQtd: p.cancel?.qtd ?? 0,
    descontos,
    promocoesLoja: Math.min(Math.abs(p.promoLoja ?? 0), taxaTotal + descontoTotal),
    itens: lista,
  }
}

/**
 * Promoções do iFood por quem bancou — card "Promoções (quem bancou)" do DRE
 * da rede e da aba Financeiro da loja (um lugar só: a loja ficou sem esta
 * regra e mostrou R$ 0,00 com R$ 14,8 mil no extrato, Brooklin set/26).
 *
 * Vem do EXTRATO, não da planilha de Pedidos (10/08/26): a planilha não
 * existe em loja só-API — 0 de 147.134 pedidos com incentivo preenchido — e
 * o card dizia R$ 0,00 numa rede que investiu R$ 67 mil no mês. Sem extrato
 * nenhum, cai no que a planilha tiver. (A tela Pedidos tem a versão com o
 * estorno aberto, de propósito.)
 */
export function promocoesIfoodQuemBancou(
  extrato: { promocaoIfood: number; promocaoLoja: number }[],
  planilha?: { incentivoIfood: number; incentivoLoja: number } | null,
): { ifood: number; loja: number } {
  const ext = extrato.reduce(
    (a, f) => ({
      ifood: a.ifood + Math.abs(f.promocaoIfood),
      loja: a.loja + Math.abs(f.promocaoLoja),
    }),
    { ifood: 0, loja: 0 },
  )
  if (ext.ifood + ext.loja > 0) return ext
  return { ifood: planilha?.incentivoIfood ?? 0, loja: planilha?.incentivoLoja ?? 0 }
}

/** Turno só existe na planilha de Pedidos; pela API tudo vem como "—". */
export function temTurnoReal(porTurno: { chave: string }[] | null | undefined): boolean {
  return (porTurno ?? []).some((t) => t.chave !== "—")
}
