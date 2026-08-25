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
  /** Para onde vai cada R$ 100 de faturamento. */
  porCem: PorCem
}

/**
 * A conta do "de cada R$ 100, sobra quanto".
 *
 * ⚠️ ERA DIGITADA (comissão 23, entrega 7, cupom 6, frete grátis 6, transação
 * 3 = R$ 45). Número inventado onde existe medição — e o medido é mais forte:
 * na rede saem R$ 35,50, na loja MEDIANA R$ 31,50, e uma em cada dez passa de
 * R$ 60. "Podem sumir R$ 45" é vago; o intervalo real é específico.
 *
 * A composição vem da rede CONSOLIDADA (soma tudo, divide pelo bruto total),
 * porque assim os segmentos fecham exatamente no total. Mediana e p90 vêm da
 * distribuição LOJA A LOJA — são perguntas diferentes: "quanto some no
 * agregado" e "quanto some na loja típica, e na pior".
 */
export type PorCem = {
  /** Σ dos segmentos, em reais por R$ 100. */
  total: number
  /** 100 − total. */
  sobra: number
  /** A loja do meio da distribuição. */
  mediana: number
  /** O corte de 1 em cada 10 lojas — o que a landing chama de "pior caso". */
  p90: number
  segmentos: { l: string; v: number }[]
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
  avaliacoes: 11_212,
  taxas: 4_202_120,
  estados: 14,
  porCem: {
    total: 35.5,
    sobra: 64.5,
    mediana: 31.5,
    p90: 60.4,
    segmentos: [
      { l: "Comissão", v: 15.3 },
      { l: "Promoção que você bancou", v: 8.9 },
      { l: "Taxa de entrega", v: 5.4 },
      { l: "Taxa de transação", v: 2.8 },
      { l: "Taxa de serviço", v: 1.8 },
      { l: "Cancelamento", v: 1 },
      { l: "Mensalidade", v: 0.3 },
    ],
  },
}

export async function getLandingNumeros(): Promise<LandingNumeros> {
  const { data, error } = await createAdminClient()
    .from("landing_numeros")
    .select("vendas, pedidos, lojas, avaliacoes, taxas, estados, por_cem")
    .maybeSingle()
  if (error || !data) return ULTIMO_CONHECIDO
  return {
    vendas: Number(data.vendas) || 0,
    pedidos: Number(data.pedidos) || 0,
    lojas: Number(data.lojas) || 0,
    avaliacoes: Number(data.avaliacoes) || 0,
    taxas: Number(data.taxas) || 0,
    estados: Number(data.estados) || 0,
    // Coluna nova: enquanto o cron não recalcula, cai no último conhecido em
    // vez de renderizar uma barra vazia.
    porCem: (data.por_cem as PorCem | null) ?? ULTIMO_CONHECIDO.porCem,
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
  /** Σ de cada linha de dedução, pra montar o "de cada R$ 100". */
  const seg = {
    comissao: 0,
    promocao: 0,
    entrega: 0,
    transacao: 0,
    servico: 0,
    cancelamento: 0,
    mensalidade: 0,
  }
  /** Bruto e deduções POR LOJA — a mediana e o p90 saem daqui. */
  const porLoja = new Map<string, { bruto: number; tira: number }>()
  let brutoIfood = 0
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
      const bruto = numero(r.bruto)
      vendas += bruto
      brutoIfood += bruto
      pedidos += numero(r.pedidos_unicos)

      const comissao = Math.abs(numero(r.comissao_ifood))
      const entrega = Math.abs(numero(r.taxa_entrega))
      const transacao = Math.abs(numero(r.taxa_transacao))
      const servico = Math.abs(numero(r.taxa_servico_cliente))
      const mensalidade = Math.abs(numero(r.mensalidade))
      const promocao = Math.abs(numero(r.promocao_loja))
      const cancelamento = Math.abs(numero(r.perda_cancelamento))

      // `taxas` é o KPI "em taxas identificadas": só o que a PLATAFORMA
      // cobrou. Promoção e cancelamento saem do bolso da loja mas não são
      // taxa — entram na conta do "de cada R$ 100", não nesse número.
      taxas += comissao + entrega + transacao + servico + mensalidade

      seg.comissao += comissao
      seg.entrega += entrega
      seg.transacao += transacao
      seg.servico += servico
      seg.mensalidade += mensalidade
      seg.promocao += promocao
      seg.cancelamento += cancelamento

      const unitId = String(r.unit_id ?? "")
      if (unitId) {
        const atual = porLoja.get(unitId) ?? { bruto: 0, tira: 0 }
        atual.bruto += bruto
        atual.tira +=
          comissao +
          entrega +
          transacao +
          servico +
          mensalidade +
          promocao +
          cancelamento
        porLoja.set(unitId, atual)
      }
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
    porCem: montarPorCem(brutoIfood, seg, porLoja),
  }

  const { porCem, ...colunas } = numeros
  await admin.from("landing_numeros").upsert(
    {
      id: true,
      ...colunas,
      por_cem: porCem,
      calculado_em: new Date().toISOString(),
    },
    { onConflict: "id" },
  )
  return numeros
}

/**
 * Monta o "de cada R$ 100".
 *
 * Só o iFood: é a única plataforma que abre a dedução linha a linha
 * (comissão × entrega × transação × serviço × promoção). Somar a 99 e a Keeta
 * com o que elas informam faria uma média de réguas diferentes — mistura que
 * este projeto já pagou pra aprender a não fazer. O rótulo na página diz de
 * onde vem.
 *
 * Lojas com faturamento pequeno ficam de fora da MEDIANA e do p90: uma loja
 * que faturou R$ 300 no ano produz percentual instável, e é justamente ela que
 * puxaria o "pior caso" pra um número irreal.
 */
function montarPorCem(
  bruto: number,
  seg: Record<string, number>,
  porLoja: Map<string, { bruto: number; tira: number }>,
): PorCem {
  if (bruto <= 0) return ULTIMO_CONHECIDO.porCem
  const pct = (v: number) => Math.round((v / bruto) * 1000) / 10

  const segmentos = [
    { l: "Comissão", v: pct(seg.comissao ?? 0) },
    { l: "Promoção que você bancou", v: pct(seg.promocao ?? 0) },
    { l: "Taxa de entrega", v: pct(seg.entrega ?? 0) },
    { l: "Taxa de transação", v: pct(seg.transacao ?? 0) },
    { l: "Taxa de serviço", v: pct(seg.servico ?? 0) },
    { l: "Cancelamento", v: pct(seg.cancelamento ?? 0) },
    { l: "Mensalidade", v: pct(seg.mensalidade ?? 0) },
  ].filter((s) => s.v > 0)

  const total = Math.round(segmentos.reduce((s, x) => s + x.v, 0) * 10) / 10

  const MIN_BRUTO = 20_000
  const taxasPorLoja = [...porLoja.values()]
    .filter((l) => l.bruto >= MIN_BRUTO)
    .map((l) => (l.tira / l.bruto) * 100)
    .sort((a, b) => a - b)
  const quantil = (p: number) =>
    taxasPorLoja.length === 0
      ? 0
      : Math.round(
          taxasPorLoja[
            Math.min(
              taxasPorLoja.length - 1,
              Math.floor(p * (taxasPorLoja.length - 1)),
            )
          ]! * 10,
        ) / 10

  return {
    total,
    sobra: Math.round((100 - total) * 10) / 10,
    mediana: quantil(0.5),
    p90: quantil(0.9),
    segmentos,
  }
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
