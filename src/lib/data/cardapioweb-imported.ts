import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Camada de leitura do Cardápio Web no MESMO contrato das outras plataformas
 * (ifood-imported / ninefood-imported / keeta-imported), pra ele entrar no
 * faturamento consolidado sem cada tela precisar saber que ele é diferente.
 *
 * Uma diferença real, que vale explicar: canal PRÓPRIO não cobra comissão.
 * A loja recebe o que o cliente pagou. Por isso `liquido` aqui não é "bruto
 * menos taxa da plataforma" — é o bruto dos pedidos que não foram cancelados.
 * Não é otimismo do cálculo: é o que de fato entra no caixa.
 */
export type CardapioWebResumo = {
  pedidos: number
  bruto: number
  liquido: number
  cancelamentosQtd: number
  ticketMedio: number
  hasData: boolean
  /**
   * Cabeçalhos ainda sem detalhe (o valor vem do detalhe). Enquanto o
   * backfill roda, o bruto está incompleto — quem exibe pode avisar.
   */
  semDetalhe: number
}

export function emptyCardapioWeb(): CardapioWebResumo {
  return {
    pedidos: 0,
    bruto: 0,
    liquido: 0,
    cancelamentosQtd: 0,
    ticketMedio: 0,
    hasData: false,
    semDetalhe: 0,
  }
}

/**
 * A API do Cardápio Web não publica a lista de status. O sandbox só devolveu
 * `closed`. Em vez de fixar um valor que pode não existir, trata como
 * cancelado qualquer status que comece com "cancel" — cobre canceled,
 * cancelled e cancelado sem chutar qual deles é.
 */
function ehCancelado(status: string | null): boolean {
  return (status ?? "").toLowerCase().startsWith("cancel")
}

/**
 * Canais em que a venda é DA LOJA (sem marketplace no meio).
 *
 * O Cardápio Web também funciona como HUB: um pedido feito no iFood pode
 * chegar aqui com `sales_channel = "ifood"`. Esse pedido já está sendo contado
 * pela integração do próprio iFood — somar de novo pelo Cardápio Web
 * inflaria o faturamento da loja com dinheiro que não existe.
 *
 * Por isso o filtro é uma LISTA DE PERMISSÃO, não uma exclusão de "ifood":
 * quando eles adicionarem um marketplace novo, ele fica de fora por padrão em
 * vez de entrar silenciosamente no bruto.
 *
 * O contrapeso da lista de permissão é este: canal PRÓPRIO esquecido também
 * fica de fora calado. Foi o que aconteceu com `totem` — o autoatendimento
 * dentro da loja, que não tem marketplace nem comissão e é a venda mais
 * própria que existe. Ficava classificado como marketplace na tela e sumia do
 * dashboard e do DRE (R$ 253 só na primeira loja de produção, jun+jul/26).
 * Ao adicionar canal aqui, a pergunta é uma só: tem intermediário levando
 * comissão? Se não tem, é próprio.
 */
export const CANAIS_PROPRIOS = [
  "catalog",
  "store_front_catalog",
  "portal",
  "whatsapp_extension",
  "totem",
]

/**
 * Instalações que valem para número consolidado: só PRODUÇÃO.
 *
 * Sandbox existe para testar a integração, e o dado dele é fictício — lote de
 * teste, valor digitado à toa. Enquanto isso entrava no DRE e no Dashboard, a
 * rede aparecia faturando dinheiro que não existe. A tela da própria
 * integração (/integracao/cardapioweb) segue mostrando tudo: lá o objetivo é
 * justamente conferir o que veio, inclusive do sandbox.
 */
export async function installIdsDeProducao(): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("cardapioweb_installs")
    .select("id")
    .eq("ambiente", "producao")
  return (data ?? []).map((r) => r.id as string)
}

function inicioDoDiaBRT(data: string): string {
  return `${data}T00:00:00-03:00`
}

function fimDoDiaBRT(data: string): string {
  return `${data}T23:59:59.999-03:00`
}

type Linha = {
  unit_id: string | null
  status: string | null
  total: number | string | null
}

export type DateRange = { start: string; end: string }

async function buscarLinhas(
  unitIds: string[],
  year: number,
  month: number,
  dateRange?: DateRange,
): Promise<Linha[]> {
  if (unitIds.length === 0) return []
  const admin = createAdminClient()

  const installs = await installIdsDeProducao()
  if (installs.length === 0) return []

  let q = admin
    .from("cardapioweb_pedidos")
    .select("unit_id, status, total")
    .in("unit_id", unitIds)
    .in("install_id", installs)
    // Só venda direta: pedido de marketplace que passou por aqui já é contado
    // pela integração daquele marketplace.
    .in("sales_channel", CANAIS_PROPRIOS)
    .eq("ref_year", year)
    .eq("ref_month", month)

  // Range custom (filtro de período) restringe DENTRO do mês — ref_year/mes
  // ficam pra pegar o índice.
  if (dateRange) {
    q = q
      .gte("criado_em", inicioDoDiaBRT(dateRange.start))
      .lte("criado_em", fimDoDiaBRT(dateRange.end))
  }

  const { data, error } = await q
  if (error) {
    console.error("cardapioweb resumo error:", error.message)
    return []
  }
  return (data ?? []) as Linha[]
}

/** Resumo do mês por unidade. Só aparece unidade que tem pedido no período. */
export async function getCardapioWebResumoByUnits(
  unitIds: string[],
  year: number,
  month: number,
  dateRange?: DateRange,
): Promise<Map<string, CardapioWebResumo>> {
  const linhas = await buscarLinhas(unitIds, year, month, dateRange)
  const porUnidade = new Map<string, CardapioWebResumo>()

  for (const l of linhas) {
    if (!l.unit_id) continue
    const r = porUnidade.get(l.unit_id) ?? emptyCardapioWeb()

    const valor = l.total === null ? null : Number(l.total)
    const cancelado = ehCancelado(l.status)

    r.pedidos += 1
    if (valor === null || Number.isNaN(valor)) {
      r.semDetalhe += 1
    } else {
      // Bruto inclui cancelado de propósito: é a cesta que o cliente montou,
      // mesma régua já usada no iFood pra bater com o portal da plataforma.
      r.bruto += valor
      if (!cancelado) r.liquido += valor
    }
    if (cancelado) r.cancelamentosQtd += 1

    r.hasData = true
    porUnidade.set(l.unit_id, r)
  }

  for (const r of porUnidade.values()) {
    const validos = r.pedidos - r.cancelamentosQtd
    r.ticketMedio = validos > 0 ? r.liquido / validos : 0
  }

  return porUnidade
}

/** Resumo do mês de UMA unidade. */
export async function getCardapioWebResumoForMonth(
  unitId: string,
  year: number,
  month: number,
  dateRange?: DateRange,
): Promise<CardapioWebResumo> {
  const mapa = await getCardapioWebResumoByUnits(
    [unitId],
    year,
    month,
    dateRange,
  )
  return mapa.get(unitId) ?? emptyCardapioWeb()
}

export type CardapioWebTopItem = {
  nomeItem: string
  qtdVendida: number
  valorTotal: number
}

/**
 * Itens mais vendidos no canal próprio, no formato dos outros rankings de
 * produto da rede.
 *
 * Sub-item de combo conta separado, igual à tela da integração: é o que amarra
 * na ficha técnica (o combo consome os componentes).
 */
export async function getNetworkCardapioWebTopItemsForMonth(
  year: number,
  month: number,
  limit: number,
  unitIds: string[],
): Promise<CardapioWebTopItem[]> {
  if (unitIds.length === 0) return []
  const admin = createAdminClient()

  const installs = await installIdsDeProducao()
  if (installs.length === 0) return []

  const { data, error } = await admin
    .from("cardapioweb_pedido_itens")
    .select(
      "nome, quantidade, preco_total, cardapioweb_pedidos!inner(unit_id, ref_year, ref_month, sales_channel, status)",
    )
    .in("cardapioweb_pedidos.unit_id", unitIds)
    .eq("cardapioweb_pedidos.ref_year", year)
    .eq("cardapioweb_pedidos.ref_month", month)
    .in("cardapioweb_pedidos.sales_channel", CANAIS_PROPRIOS)
    .in("cardapioweb_pedidos.install_id", installs)
    .limit(10000)

  if (error) {
    console.error("cardapioweb top itens error:", error.message)
    return []
  }

  type Row = {
    nome: string | null
    quantidade: number | string | null
    preco_total: number | string | null
    cardapioweb_pedidos: { status: string | null } | null
  }

  const acc = new Map<string, CardapioWebTopItem>()
  for (const r of (data ?? []) as unknown as Row[]) {
    // Pedido cancelado não é venda — fora do ranking.
    if (ehCancelado(r.cardapioweb_pedidos?.status ?? null)) continue
    const nomeItem = r.nome ?? "(sem nome)"
    const cur = acc.get(nomeItem) ?? { nomeItem, qtdVendida: 0, valorTotal: 0 }
    cur.qtdVendida += Number(r.quantidade) || 0
    cur.valorTotal += Number(r.preco_total) || 0
    acc.set(nomeItem, cur)
  }

  return [...acc.values()]
    .sort((a, b) => b.valorTotal - a.valorTotal)
    .slice(0, limit)
}
