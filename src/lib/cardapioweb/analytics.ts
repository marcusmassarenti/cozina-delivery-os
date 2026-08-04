/**
 * Leitura analítica dos pedidos do Cardápio Web — pra tela de integração.
 *
 * O diferencial daqui é o `sales_channel`: o Cardápio Web é um hub, então
 * ele sabe de ONDE veio cada pedido (catálogo próprio, portal, WhatsApp,
 * iFood…). Nenhuma outra integração nossa tem isso. É o que responde
 * "quanto do meu faturamento é do MEU canal vs. dos marketplaces" — a
 * pergunta que decide se vale a pena pagar comissão.
 *
 * Tudo agregado no banco (SQL puro via RPC), não em JS: numa loja com
 * dezenas de milhares de pedidos, puxar linha a linha estouraria memória.
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { CANAIS_PROPRIOS as LISTA_CANAIS_PROPRIOS } from "@/lib/data/cardapioweb-imported"

/**
 * Canais próprios (sem comissão de marketplace). O resto é de terceiro.
 *
 * Vem da MESMA lista que decide o que entra no dashboard e no DRE. Aqui já
 * houve uma cópia da lista, e ela divergiu: o totem virou canal próprio lá e
 * continuou pintado de laranja como "marketplace" nesta tela. Duas listas pra
 * uma regra de negócio só sempre acabam assim.
 */
const CANAIS_PROPRIOS = new Set(LISTA_CANAIS_PROPRIOS)

const ROTULO_CANAL: Record<string, string> = {
  catalog: "Catálogo digital",
  store_front_catalog: "Cardápio da loja",
  portal: "Portal",
  whatsapp_extension: "WhatsApp",
  totem: "Totem da loja",
  ifood: "iFood",
}

const ROTULO_PAGAMENTO: Record<string, string> = {
  money: "Dinheiro",
  credit_card: "Crédito",
  debit_card: "Débito",
  pix: "Pix",
  pix_auto: "Pix automático",
  meal_voucher: "Vale-refeição",
  food_voucher: "Vale-alimentação",
  bank_transfer: "Transferência",
  bank_slip: "Boleto",
  picpay: "PicPay",
  online_credit_card: "Crédito online",
  ifood: "iFood",
  ifood_voucher: "iFood (voucher)",
  food99: "99Food",
  food99_voucher: "99Food (voucher)",
  // "debt book" = caderneta de fiado. Apareceu no dado real da loja 275 e
  // vazava cru na tela como "debt_book".
  debt_book: "Fiado (caderneta)",
}

/**
 * Rótulo de uma forma de pagamento.
 *
 * A doc do Cardápio Web NÃO publica o enum completo, então a lista acima nunca
 * estará garantidamente fechada — eles podem adicionar uma forma nova a
 * qualquer momento. Quando isso acontece, o desconhecido vira algo legível
 * ("meal_ticket" → "Meal ticket") em vez de parecer código de programador na
 * cara do lojista.
 */
function rotuloPagamento(forma: string): string {
  const conhecido = ROTULO_PAGAMENTO[forma]
  if (conhecido) return conhecido
  const limpo = forma.replace(/_/g, " ").trim()
  return limpo ? limpo.charAt(0).toUpperCase() + limpo.slice(1) : "Outros"
}

export type FaturamentoAnalytics = {
  pedidos: number
  cancelados: number
  faturamento: number
  ticket: number
  proprioValor: number
  proprioPedidos: number
  terceiroValor: number
  terceiroPedidos: number
  porCanal: Array<{ canal: string; rotulo: string; proprio: boolean; pedidos: number; valor: number }>
  porPagamento: Array<{ forma: string; rotulo: string; pedidos: number; valor: number }>
}

type PedidoRow = {
  sales_channel: string | null
  status: string | null
  total: number | string | null
  forma_pagamento: string | null
}

/**
 * Puxa os pedidos detalhados da instalação em páginas e agrega em memória.
 * (Paginação manual porque o supabase-js corta em 1.000 por default; aqui
 * lemos poucas colunas, então dá pra varrer sem custo.)
 */
export async function getFaturamentoCardapioWeb(
  installId: string,
): Promise<FaturamentoAnalytics> {
  const admin = createAdminClient()

  const linhas: PedidoRow[] = []
  const PAGINA = 1000
  let de = 0
  for (;;) {
    const { data } = await admin
      .from("cardapioweb_pedidos")
      .select("sales_channel, status, total, forma_pagamento")
      .eq("install_id", installId)
      .eq("detalhe_ok", true)
      .range(de, de + PAGINA - 1)
    const lote = (data ?? []) as PedidoRow[]
    linhas.push(...lote)
    if (lote.length < PAGINA) break
    de += PAGINA
  }

  const canais = new Map<string, { pedidos: number; valor: number }>()
  const pagamentos = new Map<string, { pedidos: number; valor: number }>()

  let pedidos = 0
  let cancelados = 0
  let faturamento = 0
  let proprioValor = 0
  let proprioPedidos = 0
  let terceiroValor = 0
  let terceiroPedidos = 0

  for (const r of linhas) {
    const fechado = r.status === "closed"
    const valor = fechado ? Number(r.total) || 0 : 0
    pedidos++
    if (r.status === "canceled") cancelados++

    const canal = r.sales_channel ?? "outros"
    const c = canais.get(canal) ?? { pedidos: 0, valor: 0 }
    c.pedidos++
    c.valor += valor
    canais.set(canal, c)

    if (fechado) {
      faturamento += valor
      if (CANAIS_PROPRIOS.has(canal)) {
        proprioValor += valor
        proprioPedidos++
      } else {
        terceiroValor += valor
        terceiroPedidos++
      }
      const forma = r.forma_pagamento ?? "outros"
      const p = pagamentos.get(forma) ?? { pedidos: 0, valor: 0 }
      p.pedidos++
      p.valor += valor
      pagamentos.set(forma, p)
    }
  }

  const fechados = pedidos - cancelados

  return {
    pedidos,
    cancelados,
    faturamento,
    ticket: fechados > 0 ? faturamento / fechados : 0,
    proprioValor,
    proprioPedidos,
    terceiroValor,
    terceiroPedidos,
    porCanal: Array.from(canais.entries())
      .map(([canal, v]) => ({
        canal,
        rotulo: ROTULO_CANAL[canal] ?? canal,
        proprio: CANAIS_PROPRIOS.has(canal),
        pedidos: v.pedidos,
        valor: v.valor,
      }))
      .sort((a, b) => b.valor - a.valor),
    porPagamento: Array.from(pagamentos.entries())
      .map(([forma, v]) => ({
        forma,
        rotulo: rotuloPagamento(forma),
        pedidos: v.pedidos,
        valor: v.valor,
      }))
      .sort((a, b) => b.valor - a.valor),
  }
}

// ─── Top produtos (com sub-item de combo tratado) ───────────────────────

export type ProdutoRank = {
  nome: string
  qtd: number
  valor: number
  combo: boolean
  dentroDeCombo: boolean
}

export async function getTopProdutos(
  installId: string,
  limite = 10,
): Promise<ProdutoRank[]> {
  const admin = createAdminClient()

  // Só os itens dos pedidos dessa instalação. O join garante o escopo.
  const { data } = await admin
    .from("cardapioweb_pedido_itens")
    .select(
      "nome, quantidade, preco_total, kind, parent_item_id, cardapioweb_pedidos!inner(install_id)",
    )
    .eq("cardapioweb_pedidos.install_id", installId)
    .limit(5000)

  const acc = new Map<string, ProdutoRank>()
  for (const r of (data ?? []) as unknown as Array<{
    nome: string | null
    quantidade: number | string | null
    preco_total: number | string | null
    kind: string | null
    parent_item_id: number | null
  }>) {
    const nome = r.nome ?? "(sem nome)"
    const cur = acc.get(nome) ?? {
      nome,
      qtd: 0,
      valor: 0,
      combo: r.kind === "combo",
      dentroDeCombo: r.parent_item_id !== null,
    }
    cur.qtd += Number(r.quantidade) || 0
    cur.valor += Number(r.preco_total) || 0
    if (r.parent_item_id !== null) cur.dentroDeCombo = true
    if (r.kind === "combo") cur.combo = true
    acc.set(nome, cur)
  }

  return Array.from(acc.values())
    .sort((a, b) => b.valor - a.valor)
    .slice(0, limite)
}
