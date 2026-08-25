import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { fetchAllRows } from "@/lib/data/paginate"
import { HOLDING_DEMO_ID } from "@/lib/data/holding-demo"

/**
 * Os números da prova social da landing.
 *
 * ── A REGRA QUE VALE PRA TODOS ELES ──────────────────────────────────────
 * A rede de DEMONSTRAÇÃO fica de fora, sempre. Os dados dela são fictícios, e
 * prova social com loja inventada dentro não é prova — é o mesmo tipo de
 * exagero que o número velho cometia por baixo, só que na direção que dá
 * problema.
 *
 * ── E POR QUE SÃO CALCULADOS, NÃO DIGITADOS ──────────────────────────────
 * Eram digitados. O conjunto anterior (R$ 9,4 mi / 164 mil / 83 lojas) ficou
 * meses no ar enquanto o real dobrava, porque número velho não dá erro: ele
 * só vende menos do que a empresa é, em silêncio.
 *
 * O cálculo roda no cron uma vez por dia e grava em `landing_numeros`; a
 * página lê uma linha. A conta leva ~40s (o bruto do iFood sai de
 * `ifood_financeiro_resumo_by_units`, uma competência por chamada), e isso não
 * pode acontecer no render de uma página pública.
 */
export type LandingNumeros = {
  /** Σ do bruto de todas as plataformas, em R$. */
  vendas: number
  /** Pedidos lidos, sem contar duas vezes o que veio por duas fontes. */
  pedidos: number
  /** Lojas cadastradas (ativas ou não) de clientes reais. */
  lojas: number
  /** Avaliações de cliente lidas — iFood, 99 e Cardápio Web. */
  avaliacoes: number
  /** Σ do que as plataformas cobraram: comissão, entrega, transação, serviço. */
  taxas: number
  /** Estados (UF) com pelo menos uma loja. */
  estados: number
}

/**
 * ÚLTIMO VALOR CONHECIDO — só entra em cena se a tabela estiver vazia.
 *
 * Medido em 24/08/26. Existe pra que uma falha de leitura NUNCA vire "R$ 0" na
 * página: zero seria lido como "ninguém usa", que é pior que um número
 * desatualizado. Não é pra ser mantido à mão — é rede de segurança.
 */
const ULTIMO_CONHECIDO: LandingNumeros = {
  vendas: 19_885_620,
  pedidos: 348_837,
  lojas: 123,
  avaliacoes: 9_364,
  taxas: 4_168_000,
  estados: 14,
}

export async function getLandingNumeros(): Promise<LandingNumeros> {
  const { data, error } = await createAdminClient()
    .from("landing_numeros")
    .select("vendas, pedidos, lojas, avaliacoes, taxas, estados")
    .maybeSingle()
  if (error || !data) return ULTIMO_CONHECIDO
  return {
    vendas: Number(data.vendas) || 0,
    pedidos: Number(data.pedidos) || 0,
    lojas: Number(data.lojas) || 0,
    avaliacoes: Number(data.avaliacoes) || 0,
    taxas: Number(data.taxas) || 0,
    estados: Number(data.estados) || 0,
  }
}

/** As unidades de clientes reais (a rede de demonstração fica fora). */
async function unidadesReais(): Promise<{ ids: string[]; estados: number }> {
  const admin = createAdminClient()
  const rows = await fetchAllRows<{ id: string; state: string | null }>(
    (from, to) =>
      admin
        .from("units")
        .select("id, state, brands!inner(holding_id)")
        .neq("brands.holding_id", HOLDING_DEMO_ID)
        .order("id")
        .range(from, to) as unknown as PromiseLike<{
        data: { id: string; state: string | null }[] | null
        error: { message: string } | null
      }>,
    "landing:unidades",
  )
  const ufs = new Set<string>()
  for (const r of rows) {
    const uf = (r.state ?? "").trim().toUpperCase()
    if (uf) ufs.add(uf)
  }
  return { ids: rows.map((r) => r.id), estados: ufs.size }
}

/**
 * Recalcula e grava. Chamado pelo cron diário — nunca no render da página.
 *
 * Devolve o que gravou pra o cron poder registrar no resumo: número que muda
 * sozinho precisa deixar rastro de quando mudou, senão fica impossível saber
 * se ele parou de ser calculado (que é como o conjunto anterior envelheceu).
 */
export async function recalcularLandingNumeros(): Promise<LandingNumeros> {
  const admin = createAdminClient()
  const { ids, estados } = await unidadesReais()
  if (ids.length === 0) return ULTIMO_CONHECIDO

  const numero = (v: unknown) => Number(v) || 0

  // ── iFood ────────────────────────────────────────────────────────────
  // Uma chamada por competência: o RPC é a fonte da régua do bruto, e derivar
  // aqui uma conta paralela criaria a segunda cópia do mesmo conceito — o
  // erro que este projeto já pagou caro pra aprender.
  const competencias = await competenciasDoIfood(ids)
  let vendas = 0
  let pedidos = 0
  let taxas = 0
  for (const c of competencias) {
    const { data, error } = await admin.rpc(
      "ifood_financeiro_resumo_by_units",
      {
        p_unit_ids: ids,
        p_year: c.ano,
        p_month: c.mes,
        p_start_date: null,
        p_end_date: null,
      },
    )
    /**
     * ⚠️ COMPETÊNCIA QUE FALHA ABORTA O CÁLCULO INTEIRO.
     *
     * Somar as que deram certo e gravar mesmo assim publicaria um número
     * MENOR do que a verdade, sem ninguém desconfiar — foi exatamente assim
     * que um e-mail de conexão saiu com um terço do faturamento em 24/08/26.
     * Melhor manter o valor de ontem, que está certo.
     */
    if (error) throw new Error(`landing: ${c.ano}-${c.mes}: ${error.message}`)
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      vendas += numero(r.bruto)
      pedidos += numero(r.pedidos_unicos)
      taxas +=
        Math.abs(numero(r.comissao_ifood)) +
        Math.abs(numero(r.taxa_entrega)) +
        Math.abs(numero(r.taxa_transacao)) +
        Math.abs(numero(r.taxa_servico_cliente)) +
        Math.abs(numero(r.mensalidade))
    }
  }

  // ── 99, Keeta e Cardápio Web ─────────────────────────────────────────
  // Um SELECT agregado por plataforma. O 99 tem duas fontes e a API só entra
  // nos dias que a planilha não cobre — somar as duas dobraria o pedido que
  // veio pelos dois caminhos.
  const { data: outras, error: errOutras } = await admin.rpc(
    "landing_numeros_outras_plataformas",
    { p_unit_ids: ids },
  )
  if (errOutras) throw new Error(`landing: outras: ${errOutras.message}`)
  const o = ((outras ?? []) as Record<string, unknown>[])[0] ?? {}
  vendas += numero(o.vendas)
  pedidos += numero(o.pedidos)
  taxas += numero(o.taxas)

  const avaliacoes = numero(o.avaliacoes)

  const numeros: LandingNumeros = {
    vendas: Math.round(vendas),
    pedidos: Math.round(pedidos),
    lojas: ids.length,
    avaliacoes: Math.round(avaliacoes),
    taxas: Math.round(taxas),
    estados,
  }

  await admin.from("landing_numeros").upsert(
    { id: true, ...numeros, calculado_em: new Date().toISOString() },
    { onConflict: "id" },
  )
  return numeros
}

/** As competências com lançamento do iFood, do mais antigo ao mais novo. */
async function competenciasDoIfood(
  unitIds: string[],
): Promise<{ ano: number; mes: number }[]> {
  const { data, error } = await createAdminClient().rpc(
    "ifood_competencias_com_dado",
    { p_unit_ids: unitIds },
  )
  if (error) throw new Error(`landing: competências: ${error.message}`)
  return ((data ?? []) as { ref_year: number; ref_month: number }[]).map(
    (r) => ({ ano: r.ref_year, mes: r.ref_month }),
  )
}
