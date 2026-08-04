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
