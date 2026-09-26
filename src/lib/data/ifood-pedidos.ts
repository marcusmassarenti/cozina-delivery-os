/**
 * Queries em cima dos pedidos do iFood (migration 0017) — foco em forma de
 * pagamento e VR por bandeira. NÃO é fonte de faturamento (isso vem da
 * conciliação); aqui o objetivo é o mix de pagamento e o VR pra conciliar.
 *
 * "Valor" do VR = TOTAL PAGO PELO CLIENTE (o que foi cobrado no cartão).
 */

import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { rpcTodasAsLinhas } from "@/lib/data/paginate"

/** Bandeiras de VR conhecidas, na ordem de exibição. */
export const VR_BANDEIRAS = [
  "SODEXO",
  "ALELO",
  "VR",
  "TICKET",
  "IFOOD",
  "OUTROS",
] as const
export type VrBandeira = (typeof VR_BANDEIRAS)[number]

/** Grupos de forma de pagamento, na ordem de exibição. */
export const FORMA_GRUPOS = [
  "Vale-Refeição",
  "Crédito",
  "PIX",
  "Carteira",
  "Débito",
  "Outros",
] as const

export type VrPorBandeira = { bandeira: string; pedidos: number; valor: number }
export type MixForma = { grupo: string; pedidos: number; valor: number }
export type PorChave = { chave: string; pedidos: number; valor: number }

export type PagamentoResumo = {
  totalPedidos: number
  /** Total pago pelos clientes (soma) */
  totalValor: number
  /** Soma do valor dos itens (sem entrega) */
  valorItens: number
  ticketMedio: number
  concluidos: number
  cancelados: number
  // Pagamento / VR
  vrPedidos: number
  vrValor: number
  vrPct: number // % do valor que foi em VR
  porBandeira: VrPorBandeira[]
  mix: MixForma[]
  // Promoções / incentivos (somas)
  incentivoIfood: number
  incentivoLoja: number
  incentivoRede: number
  // Taxas que o iFood cobra (somas)
  taxaServico: number
  taxasComissoes: number
  taxaEntregaCliente: number
  valorLiquido: number
  // Distribuições
  porTurno: PorChave[]
  porEntrega: PorChave[]
  hasData: boolean
}

function emptyResumo(): PagamentoResumo {
  return {
    totalPedidos: 0,
    totalValor: 0,
    valorItens: 0,
    ticketMedio: 0,
    concluidos: 0,
    cancelados: 0,
    vrPedidos: 0,
    vrValor: 0,
    vrPct: 0,
    porBandeira: [],
    mix: [],
    incentivoIfood: 0,
    incentivoLoja: 0,
    incentivoRede: 0,
    taxaServico: 0,
    taxasComissoes: 0,
    taxaEntregaCliente: 0,
    valorLiquido: 0,
    porTurno: [],
    porEntrega: [],
    hasData: false,
  }
}

async function pageAll<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
  maxRows = 300000,
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (from < maxRows) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) {
      console.error("ifood-pedidos pageAll error:", error.message)
      break
    }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}


/** Um grupo de pedidos já somado no banco (ifood_pedidos_pagamento_grupos). */
type GrupoPagamento = {
  forma_grupo: string
  turno: string
  produto_logistico: string
  bandeira_vr: string | null
  situacao: "concluido" | "cancelado" | "outro"
  pedidos: number | string
  total_pago: number | string
  valor_itens: number | string
  incentivo_ifood: number | string
  incentivo_loja: number | string
  incentivo_rede: number | string
  taxa_servico: number | string
  taxas_comissoes: number | string
  taxa_entrega_cliente: number | string
  valor_liquido: number | string
}

/**
 * O painel de pagamentos a partir dos GRUPOS que o banco já somou (migration
 * 0269) — em vez de baixar todo pedido do mês com 15 colunas (2,2 s no CnP).
 * Mesmo resultado do `aggregate()` acima (conferido em 25/09/26); os grupos
 * vêm pelas mesmas chaves que ele usa pra contar.
 */
async function pagamentoResumoViaBanco(
  unitIds: string[] | null,
  year: number,
  month: number,
  dateRange?: { start: string; end: string },
): Promise<PagamentoResumo> {
  const admin = createAdminClient()
  const { data, error } = await rpcTodasAsLinhas<GrupoPagamento>((a, b) =>
    admin
      .rpc("ifood_pedidos_pagamento_grupos", {
        p_unit_ids: unitIds,
        p_year: year,
        p_month: month,
        p_de: dateRange?.start ?? null,
        p_ate: dateRange?.end ?? null,
      })
      .order("forma_grupo")
      .order("turno")
      .order("produto_logistico")
      .order("bandeira_vr")
      .order("situacao")
      .range(a, b),
  )
  if (error) {
    console.error("ifood_pedidos_pagamento_grupos:", error.message)
    return emptyResumo()
  }
  const grupos = data ?? []
  if (grupos.length === 0) return emptyResumo()
  const num = (v: number | string | null) => Number(v) || 0

  const byBandeira = new Map<string, { pedidos: number; valor: number }>()
  const byGrupo = new Map<string, { pedidos: number; valor: number }>()
  const byTurno = new Map<string, { pedidos: number; valor: number }>()
  const byEntrega = new Map<string, { pedidos: number; valor: number }>()
  const soma = (
    m: Map<string, { pedidos: number; valor: number }>,
    key: string,
    pedidos: number,
    v: number,
  ) => {
    const e = m.get(key) ?? { pedidos: 0, valor: 0 }
    e.pedidos += pedidos
    e.valor += v
    m.set(key, e)
  }
  let totalPedidos = 0
  let totalValor = 0
  let valorItens = 0
  let vrPedidos = 0
  let vrValor = 0
  let concluidos = 0
  let cancelados = 0
  let incentivoIfood = 0
  let incentivoLoja = 0
  let incentivoRede = 0
  let taxaServico = 0
  let taxasComissoes = 0
  let taxaEntregaCliente = 0
  let valorLiquido = 0
  for (const g of grupos) {
    const n = num(g.pedidos)
    const v = num(g.total_pago)
    totalPedidos += n
    totalValor += v
    valorItens += num(g.valor_itens)
    incentivoIfood += num(g.incentivo_ifood)
    incentivoLoja += num(g.incentivo_loja)
    incentivoRede += num(g.incentivo_rede)
    taxaServico += num(g.taxa_servico)
    taxasComissoes += num(g.taxas_comissoes)
    taxaEntregaCliente += num(g.taxa_entrega_cliente)
    valorLiquido += num(g.valor_liquido)
    if (g.situacao === "concluido") concluidos += n
    else if (g.situacao === "cancelado") cancelados += n
    soma(byGrupo, g.forma_grupo, n, v)
    soma(byTurno, g.turno, n, v)
    soma(byEntrega, g.produto_logistico, n, v)
    if (g.bandeira_vr) {
      vrPedidos += n
      vrValor += v
      soma(byBandeira, g.bandeira_vr, n, v)
    }
  }

  const round = (x: number) => Math.round(x * 100) / 100
  const toList = (m: Map<string, { pedidos: number; valor: number }>): PorChave[] =>
    Array.from(m.entries())
      .map(([chave, e]) => ({ chave, pedidos: e.pedidos, valor: round(e.valor) }))
      .sort((a, b) => b.pedidos - a.pedidos)
  const porBandeira: VrPorBandeira[] = VR_BANDEIRAS.map((bandeira) => {
    const b = byBandeira.get(bandeira) ?? { pedidos: 0, valor: 0 }
    return { bandeira, pedidos: b.pedidos, valor: round(b.valor) }
  }).filter((b) => b.pedidos > 0)
  for (const [bandeira, b] of byBandeira) {
    if (!VR_BANDEIRAS.includes(bandeira as VrBandeira)) {
      porBandeira.push({ bandeira, pedidos: b.pedidos, valor: round(b.valor) })
    }
  }
  porBandeira.sort((a, b) => b.valor - a.valor)
  const mix: MixForma[] = FORMA_GRUPOS.map((grupo) => {
    const g = byGrupo.get(grupo) ?? { pedidos: 0, valor: 0 }
    return { grupo, pedidos: g.pedidos, valor: round(g.valor) }
  }).filter((g) => g.pedidos > 0)

  return {
    totalPedidos,
    totalValor: round(totalValor),
    valorItens: round(valorItens),
    ticketMedio: totalPedidos > 0 ? round(totalValor / totalPedidos) : 0,
    concluidos,
    cancelados,
    vrPedidos,
    vrValor: round(vrValor),
    vrPct: totalValor > 0 ? (vrValor / totalValor) * 100 : 0,
    porBandeira,
    mix,
    incentivoIfood: round(incentivoIfood),
    incentivoLoja: round(incentivoLoja),
    incentivoRede: round(incentivoRede),
    taxaServico: round(taxaServico),
    taxasComissoes: round(taxasComissoes),
    taxaEntregaCliente: round(taxaEntregaCliente),
    valorLiquido: round(valorLiquido),
    porTurno: toList(byTurno),
    porEntrega: toList(byEntrega),
    hasData: true,
  }
}

/** Resumo de pagamento/VR de UMA unidade no mês. */
export async function getPagamentoResumoForMonth(
  unitId: string,
  year: number,
  month: number,
  /**
   * Recorte de dias do filtro. Sem ele, a aba Financeiro somava as taxas do
   * MES inteiro contra a receita de 10 dias e a margem saia destruida.
   */
  dateRange?: { start: string; end: string },
): Promise<PagamentoResumo> {
  // Somado no banco (0269) — ver pagamentoResumoViaBanco.
  return pagamentoResumoViaBanco([unitId], year, month, dateRange)
}

/** Resumo de pagamento/VR da rede no mês (com filtro opcional de unidades). */
export async function getNetworkPagamentoResumo(
  year: number,
  month: number,
  filterUnitIds?: string[],
  /** Recorte de dias do filtro. Sem ele a tela somava o mês inteiro. */
  dateRange?: { start: string; end: string },
): Promise<PagamentoResumo> {
  /* Somado no banco (0269): baixar todo pedido do mês custava 2,5 s no CnP e
     9–12 s na DG (20 mil pedidos). Conferido igual em 25/09/26 — rede, loja
     e recorte de dias (a DATA manda quando há range, como antes). */
  return pagamentoResumoViaBanco(filterUnitIds ?? null, year, month, dateRange)
}

export type VrPorUnidade = {
  unitId: string
  unitCode: string
  unitName: string
  vrPedidos: number
  vrValor: number
  totalPedidos: number
  totalValor: number
  /** Soma de "VALOR DOS ITENS" — fallback de faturamento se não há conciliação. */
  valorItens: number
  /** Soma de "VALOR LIQUIDO" — fallback de líquido se não há conciliação. */
  valorLiquido: number
  /** Faturamento (bruto da conciliação) — preenchido fora, na página. */
  faturamento: number
  porBandeira: VrPorBandeira[]
}

/** VR por unidade no mês — pra ranking/tabela na tela Pedidos. */
/**
 * Só o VALOR de VR por loja — para o dashboard, que precisa de um número e não
 * do painel de pagamentos inteiro.
 *
 * `getVrByUnits` puxa 15 colunas de TODOS os pedidos do mês pra depois somar
 * em memória: no dashboard isso são dezenas de milhares de linhas atravessando
 * a rede pra virar um `sum()`. Aqui o filtro `bandeira_vr not null` corta pra
 * algumas centenas (só pedido pago em vale) e traz 2 colunas.
 */
export async function getVrValorByUnits(
  year: number,
  month: number,
  filterUnitIds: string[],
  dateRange?: { start: string; end: string },
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (filterUnitIds.length === 0) return out
  const admin = createAdminClient()
  const rows = await pageAll<{ unit_id: string; total_pago_cliente: number }>(
    (a, b) => {
      let q = admin
        .from("ifood_pedidos")
        .select("unit_id, total_pago_cliente")
        .not("bandeira_vr", "is", null)
        .in("unit_id", filterUnitIds)
      if (dateRange) {
        q = q.gte("data", dateRange.start).lte("data", dateRange.end)
      } else {
        q = q.eq("ref_year", year).eq("ref_month", month)
      }
      return q.order("id").range(a, b)
    },
  )
  for (const r of rows) {
    out.set(r.unit_id, (out.get(r.unit_id) ?? 0) + (Number(r.total_pago_cliente) || 0))
  }
  return out
}

/**
 * Os cinco números do iFood que o DRE usa por loja — somados NO BANCO.
 *
 * Substitui `getVrByUnits` no caminho da rede. Aquele baixava 15 colunas de
 * TODOS os pedidos do mês (24.895 em agosto/26) em páginas de 1.000 pra somar
 * em memória — e sem índice por competência cada página fazia seq scan da
 * tabela inteira mais um sort em disco: ~350 ms × 25 páginas, além dos 8 s do
 * PostgREST. Foi um dos três timeouts da Início em 19/08/26.
 *
 * Pior que a lentidão: `pageAll` faz `break` quando a página falha e devolve o
 * que já tinha. O VR da rede saía pela METADE com cara de total.
 *
 * `getVrByUnits` continua existindo pra tela Pedidos, que precisa do painel de
 * bandeiras/turnos e olha uma loja por vez.
 */
export type IfoodPedidosResumo = {
  unitId: string
  totalPedidos: number
  totalValor: number
  valorItens: number
  valorLiquido: number
  vrPedidos: number
  vrValor: number
}

export async function getIfoodPedidosResumoByUnits(
  year: number,
  month: number,
  unitIds: string[],
  dateRange?: { start: string; end: string },
): Promise<IfoodPedidosResumo[]> {
  if (unitIds.length === 0) return []
  const { data, error } = await createAdminClient().rpc(
    "ifood_pedidos_resumo_by_units",
    {
      p_unit_ids: unitIds,
      p_year: year,
      p_month: month,
      p_start: dateRange?.start ?? null,
      p_end: dateRange?.end ?? null,
    },
  )
  if (error) {
    // Nunca devolve parcial: erro aqui some com o fallback de faturamento de
    // quem não tem Conciliação, e um zero é mais honesto que meio número.
    console.error("ifood_pedidos_resumo_by_units:", error.message)
    return []
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    unitId: String(r.unit_id),
    totalPedidos: Number(r.total_pedidos) || 0,
    totalValor: Number(r.total_valor) || 0,
    valorItens: Number(r.valor_itens) || 0,
    valorLiquido: Number(r.valor_liquido) || 0,
    vrPedidos: Number(r.vr_pedidos) || 0,
    vrValor: Number(r.vr_valor) || 0,
  }))
}

/**
 * VR por loja a partir do que o banco já somou (migration 0270) — mesma saída
 * de `getVrByUnits`, sem baixar todo pedido do mês.
 */
async function vrPorLojaViaBanco(
  year: number,
  month: number,
  filterUnitIds?: string[],
  dateRange?: { start: string; end: string },
): Promise<VrPorUnidade[]> {
  const admin = createAdminClient()
  const { data, error } = await rpcTodasAsLinhas<{
    unit_id: string
    bandeira_vr: string | null
    pedidos: number | string
    total_pago: number | string
    valor_itens: number | string
    valor_liquido: number | string
  }>((a, b) =>
    admin
      .rpc("ifood_pedidos_vr_por_loja", {
        p_unit_ids: filterUnitIds ?? null,
        p_year: year,
        p_month: month,
        p_de: dateRange?.start ?? null,
        p_ate: dateRange?.end ?? null,
      })
      .order("unit_id")
      .order("bandeira_vr")
      .range(a, b),
  )
  if (error) {
    console.error("ifood_pedidos_vr_por_loja:", error.message)
    return []
  }
  const linhas = data ?? []
  if (linhas.length === 0) return []
  const num = (v: number | string | null) => Number(v) || 0
  const round = (x: number) => Math.round(x * 100) / 100

  type Acc = {
    totalPedidos: number
    totalValor: number
    valorItens: number
    valorLiquido: number
    vrPedidos: number
    vrValor: number
    bandeiras: Map<string, { pedidos: number; valor: number }>
  }
  const porLoja = new Map<string, Acc>()
  for (const l of linhas) {
    const a = porLoja.get(l.unit_id) ?? {
      totalPedidos: 0,
      totalValor: 0,
      valorItens: 0,
      valorLiquido: 0,
      vrPedidos: 0,
      vrValor: 0,
      bandeiras: new Map(),
    }
    const n = num(l.pedidos)
    const v = num(l.total_pago)
    a.totalPedidos += n
    a.totalValor += v
    a.valorItens += num(l.valor_itens)
    a.valorLiquido += num(l.valor_liquido)
    if (l.bandeira_vr) {
      a.vrPedidos += n
      a.vrValor += v
      const b = a.bandeiras.get(l.bandeira_vr) ?? { pedidos: 0, valor: 0 }
      b.pedidos += n
      b.valor += v
      a.bandeiras.set(l.bandeira_vr, b)
    }
    porLoja.set(l.unit_id, a)
  }

  const unitIds = Array.from(porLoja.keys())
  const { data: units } = await admin.from("units").select("id, code, name").in("id", unitIds)
  const nameMap = new Map((units ?? []).map((u) => [u.id, { code: u.code, name: u.name }]))

  return unitIds
    .map((id) => {
      const a = porLoja.get(id)!
      // Mesma ordem do `aggregate()`: bandeiras conhecidas primeiro, depois as
      // outras, e tudo por valor.
      const porBandeira: VrPorBandeira[] = VR_BANDEIRAS.map((bandeira) => {
        const b = a.bandeiras.get(bandeira) ?? { pedidos: 0, valor: 0 }
        return { bandeira, pedidos: b.pedidos, valor: round(b.valor) }
      }).filter((b) => b.pedidos > 0)
      for (const [bandeira, b] of a.bandeiras) {
        if (!VR_BANDEIRAS.includes(bandeira as VrBandeira)) {
          porBandeira.push({ bandeira, pedidos: b.pedidos, valor: round(b.valor) })
        }
      }
      porBandeira.sort((x, y) => y.valor - x.valor)
      return {
        unitId: id,
        unitCode: nameMap.get(id)?.code ?? "?",
        unitName: nameMap.get(id)?.name ?? "(unidade)",
        vrPedidos: a.vrPedidos,
        vrValor: round(a.vrValor),
        totalPedidos: a.totalPedidos,
        totalValor: round(a.totalValor),
        valorItens: round(a.valorItens),
        valorLiquido: round(a.valorLiquido),
        faturamento: 0, // preenchido na página com a conciliação
        porBandeira,
      }
    })
    .sort((x, y) => y.totalValor - x.totalValor)
}

export async function getVrByUnits(
  year: number,
  month: number,
  filterUnitIds?: string[],
  /** Período customizado do dashboard. Quando vem, manda no lugar do mês. */
  dateRange?: { start: string; end: string },
): Promise<VrPorUnidade[]> {
  /* Somado no banco (0270): baixar todo pedido do mês custava 2,3 s no CnP
     e 7–11 s na DG. Conferido igual em 25/09/26 (rede, mês e recorte). */
  return vrPorLojaViaBanco(year, month, filterUnitIds, dateRange)
}
