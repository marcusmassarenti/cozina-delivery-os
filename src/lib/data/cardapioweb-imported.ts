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
  /**
   * Cesta dos pedidos CANCELADOS. Fica FORA de `bruto` e de `liquido` — é
   * perda, não receita e muito menos taxa. Existe pra quem quiser exibir o
   * "valor das vendas" no formato do portal (válidos + cancelados), igual o
   * painel já faz com o iFood.
   */
  cestaCancelados: number
  /**
   * Igual a `pedidos` hoje — os dois contam só quem tem valor. Mantido
   * separado porque o nome diz a intenção no ponto de uso.
   */
  pedidosComValor: number
  /** Válidos E com valor — o divisor honesto do ticket. */
  validosComValor: number
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
    cestaCancelados: 0,
    pedidosComValor: 0,
    validosComValor: 0,
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

/**
 * Lojas com Cardápio Web conectado DE VERDADE (instalação ativa, de produção,
 * já vinculada a uma unidade).
 *
 * Diferente de `unit_platforms`, que só diz que a loja *usa* o Cardápio Web —
 * alguém pode ter marcado a plataforma sem nunca ter autorizado. Aqui é o
 * equivalente ao "via API" do iFood: o dado entra sozinho.
 */
export async function unitIdsConectadosCw(): Promise<Set<string>> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("cardapioweb_installs")
    .select("unit_id")
    .eq("ambiente", "producao")
    .eq("active", true)
    .not("unit_id", "is", null)
  return new Set((data ?? []).map((r) => r.unit_id as string))
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

    if (valor === null || Number.isNaN(valor)) {
      // NÃO conta como pedido. O cabeçalho chegou, o detalhe (que traz o
      // valor) não — então não sabemos quanto ele vale. Contá-lo mantinha
      // `pedidos` cheio e `bruto` vazio: o ticket desabava e a tela parecia
      // mostrar queda de faturamento.
      //
      // Em julho/26 eram 103 de 135 na loja do João Nilson, e a origem nem era
      // backfill: são pedidos de uma instalação INATIVA ("Real Food /
      // Mercados", token recusado com HTTP 429) apontada pra unidade dele.
      // Filtrar por `active` resolveria este caso e quebraria outro — loja que
      // desconecta amanhã não pode perder o histórico. Ignorar o que não tem
      // valor é a regra que vale nos dois.
      r.semDetalhe += 1
    } else {
      r.pedidos += 1
      r.pedidosComValor += 1
      // CANCELADO FICA FORA DO BRUTO — igual ao iFood, cuja RPC descarta o
      // pedido cancelado do `bruto` e devolve a cesta à parte.
      //
      // Antes o bruto incluía cancelado e o líquido não, "pra bater com o
      // portal". O comentário estava errado sobre o iFood, e o efeito foi
      // caro: toda tela calcula `taxa = bruto − líquido`, então a cesta dos
      // cancelados virava TAXA de um canal que não cobra comissão nenhuma —
      // R$ 212,70 em julho/26 rotulados "Fica com a plataforma", derrubando
      // junto o "% que fica na loja" da rede.
      //
      // Quem quiser o número do portal (válidos + cancelados) soma
      // `cestaCancelados`, que é o mesmo gesto já feito com o iFood.
      if (cancelado) r.cestaCancelados += valor
      else {
        r.bruto += valor
        r.liquido += valor
        r.validosComValor += 1
      }
    }
    // Só cancelado COM valor: senão `cancelados` poderia passar de `pedidos`.
    if (cancelado && valor !== null && !Number.isNaN(valor)) {
      r.cancelamentosQtd += 1
    }

    r.hasData = true
    porUnidade.set(l.unit_id, r)
  }

  for (const r of porUnidade.values()) {
    // Divisor = pedidos VÁLIDOS E COM VALOR. Antes era `pedidos − cancelados`,
    // que inclui o cabeçalho ainda sem detalhe — pedido que conta 1 e vale
    // R$ 0. Em julho/26 eram 103 de 135 (76%) nessa situação, e o ticket do
    // canal próprio saía R$ 16,40 onde o real é ~R$ 69. O número parecia
    // completo e a "queda de ticket" parecia notícia.
    // Contado no laço, não derivado: `cancelamentosQtd` inclui cancelado SEM
    // valor, então `pedidosComValor − cancelados` erraria pra menos.
    r.ticketMedio =
      r.validosComValor > 0 ? r.liquido / r.validosComValor : 0
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
