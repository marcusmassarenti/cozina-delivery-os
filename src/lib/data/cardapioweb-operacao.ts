import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

import {
  CANAIS_PROPRIOS,
  installIdsDeProducao,
  type DateRange,
} from "@/lib/data/cardapioweb-imported"

/**
 * Perfil da operação do Cardápio Web — o que só o hub da própria loja sabe.
 *
 * O pedido do Cardápio Web carrega coisas que marketplace nenhum entrega: se
 * foi delivery, retirada, mesa ou consumo no local; a hora exata; a forma de
 * pagamento real; o motivo do cancelamento em texto; e as taxas separadas do
 * total. Tudo isso já estava no banco e nenhuma tela lia.
 *
 * Uma chamada só (RPC `cardapioweb_operacao`) devolve todos os cortes, porque
 * as telas pedem os cortes JUNTOS. E a soma é feita no banco: baixar linha
 * crua pra somar aqui é a doença conhecida deste projeto — o PostgREST corta a
 * resposta em 1.000 linhas e vira um laço sequencial.
 */

export type CorteOperacao = {
  valor: string
  pedidos: number
  valorTotal: number
}

export type CortePagamento = {
  metodo: string
  /** "offline" = pago na entrega/balcão; "online" = antecipado. */
  tipo: string | null
  bandeira: string | null
  pedidos: number
  valorTotal: number
  /** Taxa da forma de pagamento. Só existe pra quem configurou lá. */
  taxa: number
}

export type CorteCancelamento = {
  motivo: string
  pedidos: number
  valorTotal: number
}

export type OperacaoCw = {
  total: {
    pedidos: number
    /** Inclui cancelado — é a cesta que o cliente chegou a montar. */
    bruto: number
    liquido: number
    cancelados: number
  }
  /** delivery | takeout | onsite | closed_table */
  tipo: CorteOperacao[]
  /** Hora cheia (0–23), fuso de Brasília. */
  hora: CorteOperacao[]
  /** 0 = domingo, igual ao getDay() do JavaScript. */
  diaSemana: CorteOperacao[]
  pagamento: CortePagamento[]
  cancelamento: CorteCancelamento[]
  taxas: {
    /** Cobrada do cliente — é receita da loja. */
    entrega: number
    /** Os 10% do garçom. NÃO é dinheiro da loja. */
    servico: number
    adicional: number
    pedidosComEntrega: number
    pedidosComServico: number
  }
  /** false = nenhuma loja do recorte tem Cardápio Web com dado no período. */
  temDados: boolean
}

export function operacaoVazia(): OperacaoCw {
  return {
    total: { pedidos: 0, bruto: 0, liquido: 0, cancelados: 0 },
    tipo: [],
    hora: [],
    diaSemana: [],
    pagamento: [],
    cancelamento: [],
    taxas: {
      entrega: 0,
      servico: 0,
      adicional: 0,
      pedidosComEntrega: 0,
      pedidosComServico: 0,
    },
    temDados: false,
  }
}

/** Rótulos dos tipos de pedido, na linguagem de quem opera a loja. */
export const ROTULO_TIPO: Record<string, string> = {
  delivery: "Delivery",
  takeout: "Retirada no balcão",
  onsite: "Consumo no local",
  closed_table: "Mesa / comanda",
  desconhecido: "Não informado",
}

/** Formas de pagamento — os nomes que o lojista usa, não os da API. */
export const ROTULO_PAGAMENTO: Record<string, string> = {
  money: "Dinheiro",
  pix: "Pix",
  pix_auto: "Pix automático",
  credit_card: "Crédito",
  debit_card: "Débito",
  meal_voucher: "Vale-refeição",
  food_voucher: "Vale-alimentação",
  custom: "Outro (personalizado)",
  ifood: "iFood (online)",
  desconhecido: "Não informado",
}

export const DIAS_SEMANA = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
]

type Bruto = {
  total?: { pedidos?: number; bruto?: number; liquido?: number; cancelados?: number }
  tipo?: { valor?: string; pedidos?: number; valor_total?: number }[]
  hora?: { valor?: number; pedidos?: number; valor_total?: number }[]
  dia_semana?: { valor?: number; pedidos?: number; valor_total?: number }[]
  pagamento?: {
    metodo?: string
    tipo?: string | null
    bandeira?: string | null
    pedidos?: number
    valor_total?: number
    taxa?: number
  }[]
  cancelamento?: { motivo?: string; pedidos?: number; valor_total?: number }[]
  taxas?: {
    entrega?: number
    servico?: number
    adicional?: number
    pedidos_com_entrega?: number
    pedidos_com_servico?: number
  }
}

const num = (v: unknown): number => Number(v ?? 0) || 0

function corte(
  linhas: { valor?: string | number; pedidos?: number; valor_total?: number }[] = [],
): CorteOperacao[] {
  return linhas.map((l) => ({
    valor: String(l.valor ?? ""),
    pedidos: num(l.pedidos),
    valorTotal: num(l.valor_total),
  }))
}

/**
 * Busca o perfil da operação das lojas no período.
 *
 * `dateRange` é o recorte de dias; sem ele, o mês inteiro de (year, month).
 * `todosOsCanais` só pra tela de conferência da integração — no número
 * consolidado vale a lista de permissão de sempre, senão pedido de marketplace
 * que passa pelo hub entraria em dobro.
 */
export async function getOperacaoCardapioWeb(
  unitIds: string[],
  year: number,
  month: number,
  dateRange?: DateRange,
  opts: { todosOsCanais?: boolean } = {},
): Promise<OperacaoCw> {
  if (unitIds.length === 0) return operacaoVazia()

  // Limites em horário de Brasília: o pedido das 23h do dia 31 é do dia 31, não
  // do dia 1º do mês seguinte.
  const inicio = dateRange
    ? `${dateRange.start}T00:00:00-03:00`
    : `${year}-${String(month).padStart(2, "0")}-01T00:00:00-03:00`
  const fimBase = dateRange
    ? new Date(`${dateRange.end}T00:00:00-03:00`)
    : new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00-03:00`)
  if (dateRange) fimBase.setDate(fimBase.getDate() + 1)
  else fimBase.setMonth(fimBase.getMonth() + 1)

  const admin = createAdminClient()
  const installs = await installIdsDeProducao()
  // Sem instalação de produção não há o que somar — e mandar array vazio pro
  // banco significaria "todas", que traria o sandbox pro consolidado.
  if (installs.length === 0) return operacaoVazia()

  const { data, error } = await admin.rpc("cardapioweb_operacao", {
    p_unit_ids: unitIds,
    p_inicio: inicio,
    p_fim: fimBase.toISOString(),
    p_canais: opts.todosOsCanais ? [] : CANAIS_PROPRIOS,
    p_install_ids: installs,
  })

  if (error) {
    // Erro vira erro. Devolver "operação vazia" faria a tela dizer que a loja
    // não vendeu nada num dia em que ela vendeu — mentira pior que tela quebrada.
    throw new Error(`cardapioweb_operacao: ${error.message}`)
  }

  const b = (data ?? {}) as Bruto
  const t = b.total ?? {}
  const tx = b.taxas ?? {}

  return {
    total: {
      pedidos: num(t.pedidos),
      bruto: num(t.bruto),
      liquido: num(t.liquido),
      cancelados: num(t.cancelados),
    },
    tipo: corte(b.tipo),
    hora: corte(b.hora),
    diaSemana: corte(b.dia_semana),
    pagamento: (b.pagamento ?? []).map((p) => ({
      metodo: p.metodo ?? "desconhecido",
      tipo: p.tipo ?? null,
      bandeira: p.bandeira ?? null,
      pedidos: num(p.pedidos),
      valorTotal: num(p.valor_total),
      taxa: num(p.taxa),
    })),
    cancelamento: (b.cancelamento ?? []).map((c) => ({
      motivo: c.motivo ?? "Sem motivo informado",
      pedidos: num(c.pedidos),
      valorTotal: num(c.valor_total),
    })),
    taxas: {
      entrega: num(tx.entrega),
      servico: num(tx.servico),
      adicional: num(tx.adicional),
      pedidosComEntrega: num(tx.pedidos_com_entrega),
      pedidosComServico: num(tx.pedidos_com_servico),
    },
    temDados: num(t.pedidos) > 0,
  }
}

/* ────────────────────────────────────────────────────────────────────────── */

export type ItemVendidoCw = {
  nome: string
  externalCode: string | null
  /** O item apareceu como parte de um combo em algum pedido. */
  emCombo: boolean
  qtd: number
  receita: number
  pedidos: number
}

export type ComplementoCw = {
  nome: string
  grupo: string
  qtd: number
  receita: number
  pedidos: number
}

export type VendasItensCw = {
  total: {
    itensDistintos: number
    unidades: number
    receita: number
    pedidos: number
  }
  /** Mais vendidos, por receita. */
  itens: ItemVendidoCw[]
  /** Menos vendidos — entre os que VENDERAM ao menos uma vez. */
  menos: ItemVendidoCw[]
  complementos: ComplementoCw[]
  temDados: boolean
}

export function vendasItensVazio(): VendasItensCw {
  return {
    total: { itensDistintos: 0, unidades: 0, receita: 0, pedidos: 0 },
    itens: [],
    menos: [],
    complementos: [],
    temDados: false,
  }
}

/**
 * Itens e complementos VENDIDOS no Cardápio Web.
 *
 * É o equivalente da aba Cardápio do iFood e da 99: o que saiu, quanto rendeu,
 * o que menos sai. Sai dos PEDIDOS, não do catálogo — o catálogo é uma foto de
 * hoje e não serve pra falar do passado (a API não guarda versões).
 *
 * "Menos vendidos" são os que venderam POUCO, nunca os que não venderam: item
 * que não aparece em pedido nenhum pode nem existir mais no cardápio.
 *
 * Agregado no banco. Um mês de loja movimentada passa fácil das 1.000 linhas
 * que o PostgREST devolve, e somar isso em JavaScript é a doença conhecida
 * daqui.
 */
export async function getVendasItensCardapioWeb(
  unitIds: string[],
  year: number,
  month: number,
  dateRange?: DateRange,
): Promise<VendasItensCw> {
  if (unitIds.length === 0) return vendasItensVazio()

  const inicio = dateRange
    ? `${dateRange.start}T00:00:00-03:00`
    : `${year}-${String(month).padStart(2, "0")}-01T00:00:00-03:00`
  const fim = dateRange
    ? new Date(`${dateRange.end}T00:00:00-03:00`)
    : new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00-03:00`)
  if (dateRange) fim.setDate(fim.getDate() + 1)
  else fim.setMonth(fim.getMonth() + 1)

  const admin = createAdminClient()
  const installs = await installIdsDeProducao()
  if (installs.length === 0) return vendasItensVazio()

  const { data, error } = await admin.rpc("cardapioweb_itens_vendidos", {
    p_unit_ids: unitIds,
    p_inicio: inicio,
    p_fim: fim.toISOString(),
    p_canais: CANAIS_PROPRIOS,
    p_install_ids: installs,
    p_limite: 60,
  })
  if (error) throw new Error(`cardapioweb_itens_vendidos: ${error.message}`)

  const b = (data ?? {}) as {
    total?: {
      itens_distintos?: number
      unidades?: number
      receita?: number
      pedidos?: number
    }
    itens?: ItemVendidoCw[]
    menos?: ItemVendidoCw[]
    complementos?: ComplementoCw[]
  }
  const t = b.total ?? {}
  const item = (x: ItemVendidoCw): ItemVendidoCw => ({
    nome: x.nome,
    externalCode: x.externalCode ?? null,
    emCombo: !!x.emCombo,
    qtd: num(x.qtd),
    receita: num(x.receita),
    pedidos: num(x.pedidos),
  })

  return {
    total: {
      itensDistintos: num(t.itens_distintos),
      unidades: num(t.unidades),
      receita: num(t.receita),
      pedidos: num(t.pedidos),
    },
    itens: (b.itens ?? []).map(item),
    menos: (b.menos ?? []).map(item),
    complementos: (b.complementos ?? []).map((c) => ({
      nome: c.nome,
      grupo: c.grupo,
      qtd: num(c.qtd),
      receita: num(c.receita),
      pedidos: num(c.pedidos),
    })),
    temDados: num(t.itens_distintos) > 0,
  }
}
