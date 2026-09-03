/**
 * "A receber do 99" — venda já feita cujo repasse ainda não caiu na conta.
 *
 * ## Por que existe
 *
 * O 99 paga com 4 a 9 dias de atraso. O painel conta por DATA DA VENDA; o
 * extrato do banco, por DATA DO REPASSE. Resultado: todo dono de loja que
 * compara as duas telas encontra uma diferença e conclui que recebeu menos
 * do que vendeu — especialmente loja crescendo, onde a fila de repasse é
 * proporcionalmente maior.
 *
 * Aconteceu com a Kawaii Poke (DG FOODS, via Diego, 01/09/26): R$ 19.741 no
 * banco contra R$ 23.100 na tela. Não faltava dinheiro; faltavam R$ 3.678,89
 * de vendas de 21 a 29/08 que ainda estavam na fila do 99, mais o que o
 * cliente pagou em dinheiro na porta. Mostrar esse número fecha a pergunta
 * antes de ela virar chamado.
 *
 * ## A fonte é o próprio 99, não estimativa nossa
 *
 * `expect_settle_date` é a data que a 99 informa por pedido, e
 * `settlement_amount` é o valor que ela vai depositar — já líquido de
 * promoção que a loja bancou e dos ajustes do período (medido em ago/26:
 * `orderAmount` some R$ 252,8 mil e `settlementAmount` R$ 200,2 mil na
 * rede; a diferença são exatamente essas deduções, e o que cai no banco é o
 * segundo). É o mesmo par que o Fluxo de Caixa já usa pra projetar entrada.
 *
 * ⚠️ SÓ EXISTE PRA LOJA CONECTADA POR API. Loja que só sobe planilha não tem
 * `expect_settle_date` — e aqui a resposta é ausência declarada (`null`),
 * NUNCA zero. Zero diria "não há nada a receber", que é uma afirmação falsa
 * sobre uma loja que vende; a tela precisa poder dizer "não sei" em vez de
 * inventar tranquilidade. Cobertura em 01/09/26: 33 lojas conectadas, 100%
 * das linhas com data prevista (7.083 de 7.083).
 */
import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export type AReceber99 = {
  /** Σ do que a 99 ainda vai depositar (repasse previsto pra hoje ou depois). */
  valor: number
  /** Data do próximo depósito previsto (YYYY-MM-DD), se houver. */
  proximaData: string | null
  /** Quantos pedidos compõem o valor — dá tamanho à espera. */
  pedidos: number
}

/**
 * Quanto cada loja ainda tem pra receber do 99.
 *
 * Devolve entrada só pras lojas CONECTADAS. Ausência da chave = "não dá pra
 * saber" (loja sem API), e quem exibe deve tratar diferente de zero.
 */
export async function getAReceber99ByUnits(
  unitIds: string[],
): Promise<Map<string, AReceber99>> {
  const out = new Map<string, AReceber99>()
  if (unitIds.length === 0) return out
  const admin = createAdminClient()

  const { data: links } = await admin
    .from("ninefood_store_links")
    .select("unit_id, app_shop_id")
    .in("unit_id", unitIds)
    .eq("active", true)
  const unitPorShop = new Map<string, string>()
  for (const l of (links ?? []) as { unit_id: string | null; app_shop_id: string }[]) {
    if (l.unit_id) unitPorShop.set(l.app_shop_id, l.unit_id)
  }
  if (unitPorShop.size === 0) return out

  // Loja conectada nasce com entrada zerada: ela SABE que não tem nada na
  // fila, que é diferente de não saber. A distinção é o ponto do módulo.
  for (const unitId of new Set(unitPorShop.values())) {
    out.set(unitId, { valor: 0, proximaData: null, pedidos: 0 })
  }

  const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
  // Agregado no banco: a tabela passa de 100 mil linhas e trazer linha crua
  // pra somar em JS é a doença que já mordeu o Fluxo de Caixa (127 requisições
  // sequenciais pra produzir 5 números).
  const { data, error } = await admin.rpc("ninefood_a_receber_by_shops", {
    p_shop_ids: [...unitPorShop.keys()],
    p_de: hoje,
  })
  // Erro NÃO pode virar "nada a receber": esse é justamente o número que o
  // lojista usa pra concluir que falta dinheiro na conta dele.
  if (error) {
    throw new Error(`a-receber-99: ${error.message}`)
  }

  for (const r of (data ?? []) as {
    app_shop_id: string
    valor: number | string
    proxima_data: string | null
    pedidos: number
  }[]) {
    const unitId = unitPorShop.get(r.app_shop_id)
    if (!unitId) continue
    const atual = out.get(unitId) ?? { valor: 0, proximaData: null, pedidos: 0 }
    atual.valor += Number(r.valor) || 0
    atual.pedidos += Number(r.pedidos) || 0
    // Uma unidade pode ter mais de um shop: vale a data mais próxima.
    if (
      r.proxima_data &&
      (atual.proximaData === null || r.proxima_data < atual.proximaData)
    ) {
      atual.proximaData = r.proxima_data
    }
    out.set(unitId, atual)
  }
  return out
}

/** Versão de UMA loja — o caminho da página da unidade. */
export async function getAReceber99ForUnit(
  unitId: string,
): Promise<AReceber99 | null> {
  const m = await getAReceber99ByUnits([unitId])
  return m.get(unitId) ?? null
}
