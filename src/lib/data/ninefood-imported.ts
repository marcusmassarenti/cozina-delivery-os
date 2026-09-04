/**
 * Queries em cima dos dados importados do 99 Food (tabelas 0014).
 *
 * Convenção:
 * - "Month" = (ref_year, ref_month) — usado pelo Financeiro (loja)
 * - "data" = date dia-a-dia
 *
 * O XLSX do 99 Food já vem agregado por dia, então a planilha é SELECT direto
 * + agg em JS. O financeiro da API é o oposto (uma linha por pedido) e sai
 * agregado do Postgres, pela RPC `ninefood_api_diario` — ver a migration 0227.
 */

import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { fetchAllRows } from "@/lib/data/paginate"
import { monthOperationWindow } from "@/lib/data/operation-window"
import { getAccessibleUnitIds } from "@/lib/auth/permissions"
import { cancelamentoRankingLabel } from "@/lib/ninefood/cancelamento"

/**
 * Pagina uma query do Supabase via .range() em loop. O hard-cap de 1000
 * linhas do Supabase IGNORA .limit() acima de 1000 — então sem paginar a
 * agregação trunca silenciosamente (subconta). A query passada precisa ter
 * um .order() ESTÁVEL (ex.: .order("id")), senão linhas repetem/somem entre
 * páginas.
 */
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
      console.error("ninefood-imported pageAll error:", error.message)
      break
    }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}

// ─── Tipos ───────────────────────────────────────────────────────────

export type NinefoodResumo = {
  /** Soma dos pedidos do mês (do "Total de vendas realizadas") */
  pedidos: number
  /** "Receita total de vendas" */
  bruto: number
  /** "Receita total" (líquido pós-taxas) */
  liquido: number
  /** Soma "Despesas de comissão da loja" */
  comissaoRs: number
  /** Soma "Taxa de canal de pagamento da loja" */
  taxaCanalPagamentoRs: number
  /** Soma "Despesas de ofertas da loja" */
  promocoesRs: number
  /** Soma de cancelamentos comerciantes */
  cancelamentosQtd: number
  /** Média da Avaliação da loja nos dias com dado */
  avaliacaoMedia: number | null
  /** Média da Taxa de Aceitação nos dias com dado */
  taxaAceitacaoMedia: number | null
  /** Média do tempo de preparo nos dias com dado */
  tempoPreparoMedio: number | null
  /** Quantos dias do mês tinham dados importados */
  diasComDados: number
  /** Ticket médio derivado (bruto / pedidos) */
  ticketMedio: number
  /** Percentual líquido / bruto */
  pctLoja: number
  /**
   * Venda direta: pedido pago em DINHEIRO na porta, cujo valor fica no caixa
   * da loja e não passa pelo repasse do 99.
   *
   * Confirmado pelo cliente (Diego, ago/26): o dinheiro fica com a loja e o 99
   * cobra a comissão depois. Mesma natureza do `recebidoDireto` do iFood.
   *
   * Vem de `ninefood_pedidos` (não do diário agregado, que não separa forma de
   * pagamento). Dois vocabulários convivem na coluna: a planilha grava o texto
   * "Pagamento em dinheiro" e o webhook grava o código do `pay_method` da 99
   * ("2" = dinheiro, documentado em src/lib/ninefood/pagamento.ts).
   */
  recebidoDireto: number
  /** True se há dados importados pra essa unidade/mês */
  hasData: boolean
}

// ─── getNinefoodResumoByUnits ────────────────────────────────────────

/** Um dia de uma loja no relatório "Dados do pedido". */
type DiaPedidos = {
  /** Σ `receita_real_loja` — o LÍQUIDO de verdade, o que fica com a loja. */
  liquido: number
  /** Σ do que o cliente pagou em DINHEIRO na porta. */
  direto: number
}

/**
 * O relatório de pedido do 99 por loja/dia (RPC `ninefood_pedidos_diario`).
 *
 * Traz duas coisas que a planilha diária não tem confiáveis:
 *
 *  • a VENDA DIRETA — dinheiro pago na porta, que fica no caixa da loja e não
 *    passa pelo repasse (confirmado pelo cliente em ago/26). Sem contá-la, o
 *    "% que fica na loja" aparece menor do que é;
 *  • o LÍQUIDO real (`receita_real_loja`), usado quando o líquido da planilha
 *    vem furado. Ver a migration 0228 pra medição.
 */
async function getNinefoodPedidosPorDia(
  unitIds: string[],
  de: string,
  ate: string,
): Promise<Map<string, Map<string, DiaPedidos>>> {
  const out = new Map<string, Map<string, DiaPedidos>>()
  if (unitIds.length === 0) return out
  const admin = createAdminClient()
  const { data, error } = await admin.rpc("ninefood_pedidos_diario", {
    p_unit_ids: unitIds,
    p_de: de,
    p_ate: ate,
  })
  if (error) {
    console.error("getNinefoodPedidosPorDia:", error.message)
    return out
  }
  for (const r of (data ?? []) as {
    unit_id: string
    dia: string
    receita_real_loja: number | string
    recebido_direto: number | string
  }[]) {
    let porDia = out.get(r.unit_id)
    if (!porDia) {
      porDia = new Map<string, DiaPedidos>()
      out.set(r.unit_id, porDia)
    }
    porDia.set(r.dia, {
      liquido: Number(r.receita_real_loja) || 0,
      direto: Number(r.recebido_direto) || 0,
    })
  }
  return out
}

export async function getNinefoodResumoByUnits(
  unitIds: string[],
  year: number,
  month: number,
  dateRange?: { start: string; end: string },
): Promise<Map<string, NinefoodResumo>> {
  const out = new Map<string, NinefoodResumo>()
  if (unitIds.length === 0) return out

  const admin = createAdminClient()
  const mm = String(month).padStart(2, "0")
  const de = dateRange?.start ?? `${year}-${mm}-01`
  const ate = dateRange?.end ?? isoDate(new Date(year, month, 0))
  const pedidosPorDia = await getNinefoodPedidosPorDia(unitIds, de, ate)
  // Pagina: ninefood_daily_loja é 1 linha por loja por dia; com a rede
  // crescendo (~35 lojas × 30 dias = 1050) passa do cap de 1000 do Supabase e
  // descartaria dias silenciosamente. fetchAllRows + .order('id') resolve.
  // `dateRange` (opcional) restringe pra range custom — assume mono-mês.
  const data = await fetchAllRows<{
    unit_id: string
    data: string
    pedidos: number | null
    bruto: number | null
    liquido: number | null
    comissao_rs: number | null
    taxa_canal_pagamento_rs: number | null
    promocoes_rs: number | null
    avaliacao_loja: number | null
    taxa_aceitacao_pct: number | null
    cancelamentos_qtd: number | null
    tempo_medio_preparo_min: number | null
  }>(
    (from, to) => {
      let q = admin
        .from("ninefood_daily_loja")
        .select(
          "unit_id, data, pedidos, bruto, liquido, comissao_rs, taxa_canal_pagamento_rs, promocoes_rs, avaliacao_loja, taxa_aceitacao_pct, cancelamentos_qtd, tempo_medio_preparo_min",
        )
        .in("unit_id", unitIds)
        .eq("ref_year", year)
        .eq("ref_month", month)
      if (dateRange) {
        q = q.gte("data", dateRange.start).lte("data", dateRange.end)
      }
      return q.order("id").range(from, to)
    },
    "getNinefoodResumoByUnits",
  )

  // Agrega em JS por unit_id
  type Acc = {
    pedidos: number
    bruto: number
    liquido: number
    comissao: number
    taxaPgto: number
    promo: number
    cancel: number
    avaliacoes: number[]
    aceitacoes: number[]
    tempos: number[]
    dias: Set<string>
    /** Dias de planilha com venda — a régua de cobertura do relatório de pedido. */
    diasComVenda: Set<string>
  }
  const accs = new Map<string, Acc>()

  // API PRIMEIRO — régua do 99 vira a MESMA do iFood (extrato > planilha).
  //
  // Até 03/09/26 a planilha diária ganhava o dia e a API só tapava buraco. O
  // problema: a `ninefood_daily_loja` fica INCOMPLETA (a Pinheiros tinha só
  // 17 dos 31 dias de agosto) e o `bruto` dela é base diferente da API. O
  // resumo montava um Frankenstein — dias 1-17 da planilha, 18-31 da API —
  // que não batia com fonte nenhuma: R$ 9.024 de bruto onde o portal do 99
  // mostra R$ 5.972 de "ganhos esperados" (== nosso orderAmount da API, ao
  // centavo). Diego pegou na Pinheiros/Churrasco no Pote.
  //
  // Agora, no dia que a API tem, o FINANCEIRO vem dela. A planilha ainda
  // entra pelas MÉTRICAS OPERACIONAIS (avaliação, aceitação, tempo — que a
  // API não expõe) e segue sendo a fonte do financeiro nos dias/lojas SEM
  // API. Loja só-planilha não muda em nada.
  const apiPorDia = await ninefoodApiPorDia(unitIds, year, month, dateRange)
  const diasApiPorUnit = new Map<string, Set<string>>()
  for (const [u, dias] of apiPorDia) diasApiPorUnit.set(u, new Set(dias.keys()))

  for (const row of data ?? []) {
    let acc = accs.get(row.unit_id)
    if (!acc) {
      acc = {
        pedidos: 0,
        bruto: 0,
        liquido: 0,
        comissao: 0,
        taxaPgto: 0,
        promo: 0,
        cancel: 0,
        avaliacoes: [],
        aceitacoes: [],
        tempos: [],
        dias: new Set(),
        diasComVenda: new Set(),
      }
      accs.set(row.unit_id, acc)
    }
    // Métricas operacionais: SEMPRE da planilha (a API não tem nota, aceitação
    // nem tempo de preparo).
    if (row.avaliacao_loja != null) acc.avaliacoes.push(Number(row.avaliacao_loja))
    if (row.taxa_aceitacao_pct != null)
      acc.aceitacoes.push(Number(row.taxa_aceitacao_pct))
    if (row.tempo_medio_preparo_min != null)
      acc.tempos.push(row.tempo_medio_preparo_min)
    // Financeiro: só quando a API NÃO cobre esse dia (senão a API abaixo soma
    // de novo, e com base mais completa). É a inversão da régua.
    const apiCobreEsteDia =
      row.data != null && (diasApiPorUnit.get(row.unit_id)?.has(row.data) ?? false)
    if (!apiCobreEsteDia) {
      acc.pedidos += row.pedidos ?? 0
      acc.bruto += Number(row.bruto ?? 0)
      acc.liquido += Number(row.liquido ?? 0)
      acc.comissao += Number(row.comissao_rs ?? 0)
      acc.taxaPgto += Number(row.taxa_canal_pagamento_rs ?? 0)
      acc.promo += Number(row.promocoes_rs ?? 0)
      acc.cancel += row.cancelamentos_qtd ?? 0
      if (row.data && (Number(row.bruto ?? 0) > 0 || (row.pedidos ?? 0) > 0)) {
        acc.diasComVenda.add(row.data)
      }
    }
    // O dia entra em `dias` de qualquer forma (a operacional dele existe).
    if (row.data) acc.dias.add(row.data)
  }

  /**
   * DIAS QUE SÓ A API TEM — completa o mês em vez de deixar buraco.
   *
   * ── POR QUE VIROU DIA A DIA (24/08/26) ────────────────────────────────
   * O fallback anterior era tudo-ou-nada por loja: só entrava quando NÃO
   * havia nenhum dia de planilha no mês. Bastava um dia importado pra que
   * todo o resto do mês, já disponível na API, fosse ignorado — foi o caso
   * da Marmitex Faisão, com planilha até 13/ago e a API até 22/ago.
   *
   * Misturar as duas fontes no mesmo mês só é honesto porque a régua é a
   * MESMA: em 24/08/26 casei 263 pedidos da Faisão pedido a pedido e
   * `receita_vendas` (planilha) == `commissionBaseAmount` (API), centavo a
   * centavo. Ver a migration 0227.
   *
   * A planilha ganha o dia quando existe nos dois lados: ela é mais rica
   * (avaliação, aceitação, tempo de preparo — que a API não tem).
   */
  /** unit → dias cujo número veio da API (e não da planilha). */
  const diasViaApi = new Map<string, Set<string>>()
  for (const [unitId, dias] of apiPorDia) {
    const viaApi = new Set<string>()
    diasViaApi.set(unitId, viaApi)
    let acc = accs.get(unitId)
    if (!acc) {
      acc = {
        pedidos: 0,
        bruto: 0,
        liquido: 0,
        comissao: 0,
        taxaPgto: 0,
        promo: 0,
        cancel: 0,
        avaliacoes: [],
        aceitacoes: [],
        tempos: [],
        dias: new Set(),
        diasComVenda: new Set(),
      }
      accs.set(unitId, acc)
    }
    for (const [dia, v] of dias) {
      // A planilha já NÃO somou financeiro pros dias da API (gate acima), então
      // aqui a API entra pra TODO dia dela — sem `continue`, senão o dia que a
      // planilha também tinha ficaria sem financeiro nenhum.
      acc.pedidos += v.pedidos
      acc.bruto += v.bruto
      acc.liquido += v.liquido
      acc.comissao += v.comissao
      acc.taxaPgto += v.taxaCanal
      acc.promo += v.promo
      acc.cancel += v.cancelados
      acc.dias.add(dia)
      if (v.bruto > 0 || v.pedidos > 0) acc.diasComVenda.add(dia)
      viaApi.add(dia)
    }
  }

  for (const [unitId, acc] of accs) {
    /**
     * DE ONDE SAI O LÍQUIDO — três fontes, nesta ordem.
     *
     * 1. O GRAVADO na planilha diária, quando é plausível (0 < líquido ≤
     *    bruto). É o repasse que o próprio 99 declarou.
     *
     * 2. O RELATÓRIO DE PEDIDO (`receita_real_loja`), quando o gravado vem
     *    furado. Não é estimativa: é o mesmo campo que a API do 99 chama de
     *    `orderAmount` — em 456 dias cobertos pelas duas fontes, 74% batem
     *    dentro de R$ 1 e o total difere 1,2%.
     *
     * 3. A DERIVAÇÃO `bruto − comissão − taxa − promoção`, último recurso.
     *
     * ⚠️ POR QUE O PASSO 2 PRECISOU EXISTIR (24/08/26) ────────────────────
     * A derivação era o único fallback, e ela ERRA SEMPRE PARA BAIXO: a
     * "despesa de ofertas" da planilha inclui promoção que o 99 bancou e
     * frete, que não saem do bolso do lojista. Descontar tudo como se fosse
     * dele fazia a Marmitex Faisão aparecer ficando com 45% do que vende,
     * quando fica com 86%. Em 69 meses-loja de 4 clientes faltavam R$ 132 mil
     * de líquido — e o erro tem SINAL: nunca para cima.
     *
     * Um lojista que lê 45% conclui que o 99 é um canal ruim. A conclusão era
     * do sistema, não da realidade.
     *
     * ⚠️ A TRAVA DE COBERTURA. O passo 2 só vale se o relatório de pedido
     * cobrir TODOS os dias com venda do mês. Faltando um dia, a soma seria
     * parcial apresentada como total — que é pior que o número errado de
     * antes, porque ninguém tem como desconfiar. Sem cobertura, cai no 3.
     */
    const pedidosDaLoja = pedidosPorDia.get(unitId)
    const diasDaApi = diasViaApi.get(unitId)
    /* ⚠️ COBERTURA É TER VALOR, NÃO TER LINHA.
     *
     * Era `pedidosDaLoja?.has(d)` — o dia existir no relatório de pedido. Só
     * que `receita_real_loja` é coluna de PLANILHA: o pedido que entrou pela
     * API/webhook está na tabela com o campo NULL, e `Number(null) || 0` faz
     * a soma do dia valer zero. A trava então aprovava o mês (todos os dias
     * "existem") e devolvia um líquido montado com zeros.
     *
     * A Jardins em ago/26 é o caso: 892 pedidos, 866 sem o campo (97%), e o
     * líquido do mês saía R$ 1.021,48 sobre R$ 53.445,18 de venda — a soma de
     * 26 pedidos apresentada como o mês inteiro.
     *
     * É a mesma doença de sempre, na terceira variação: ler "não tenho esse
     * campo" como "esse valor é zero". A pergunta certa não é "o dia está na
     * tabela?", é "eu tenho o número desse dia?" — e dia sem venda nem chega
     * aqui, então exigir > 0 não descarta dia legítimo. */
    const temValorNoDia = (d: string) =>
      diasDaApi?.has(d) || (pedidosDaLoja?.get(d)?.liquido ?? 0) > 0
    const cobreOsDias =
      acc.diasComVenda.size > 0 && [...acc.diasComVenda].every(temValorNoDia)
    const liquidoDoRelatorio = cobreOsDias
      ? [...acc.dias].reduce(
          (soma, dia) =>
            soma +
            (diasDaApi?.has(dia)
              ? apiPorDia.get(unitId)?.get(dia)?.liquido ?? 0
              : pedidosDaLoja?.get(dia)?.liquido ?? 0),
          0,
        )
      : null

    const liquidoGravado = acc.liquido

    /**
     * ⚠️ "≤ BRUTO" NÃO BASTA COMO PLAUSIBILIDADE (medido em 26/08/26).
     *
     * A trava original só barrava líquido MAIOR que o bruto. Mas existe um
     * caso pior porque é silencioso: líquido IGUAL ao bruto, num mês que tem
     * comissão, taxa e promoção lançadas. Passa na trava e o painel afirma
     * que a loja ficou com ~100% do que vendeu.
     *
     * A causa é que a coluna "Receita total" do relatório "Dados da loja"
     * MUDOU DE SIGNIFICADO por volta de junho/26. Até maio, quem valia o preço
     * de tabela era "Receita total de vendas"; de junho em diante é a "Receita
     * total" — conferido dia a dia contra o `mealOriginalAmount` da API na
     * Santana (6 de 6 dias batendo ao centavo). Ou seja: em parte da base, o
     * campo que chamamos de líquido é o bruto ANTES do desconto.
     *
     * A régua nova compara o gravado com a derivação, que é a identidade
     * contábil (bruto − comissão − taxa − promoção). Os números que
     * justificam os 5%, sobre os 211 meses-loja que hoje usam o gravado:
     *
     *   mediana = p90 = p95 = 100,0%   ← o gravado É a derivação
     *   acima de 105%:  6 meses
     *   acima de 120%:  5 meses
     *   máximo:       135,3%
     *
     * Existe um vazio entre 100,0% e 105,8%. A faixa de 5% absorve
     * arredondamento sem deixar passar coluna com outro significado. Sem ela,
     * 6 meses-loja de DG FOODS e Churrasco no Pote mostravam R$ 4.075,77 de
     * líquido a mais do que existe — a Noquinha Paulo Marcondes dizia 99,1%
     * de repasse em ago/26 onde o real é 76,8%.
     *
     * O sinal do erro importa: ao contrário da derivação, que erra PARA BAIXO
     * e faz o lojista achar o canal ruim, este erra PARA CIMA — e ninguém
     * reclama de um número bom. Por isso passou despercebido.
     */
    const derivado = Math.max(0, acc.bruto - acc.comissao - acc.taxaPgto - acc.promo)
    const gravadoPlausivel =
      liquidoGravado > 0 &&
      liquidoGravado <= acc.bruto &&
      // Sem custo lançado não há com o que comparar: mantém a régua antiga.
      (derivado <= 0 || liquidoGravado <= derivado * 1.05)

    const liquidoUsar =
      gravadoPlausivel
        ? liquidoGravado
        : liquidoDoRelatorio != null &&
            liquidoDoRelatorio > 0 &&
            liquidoDoRelatorio <= acc.bruto
          ? liquidoDoRelatorio
          : derivado
    /* ⚠️ DINHEIRO NA PORTA NÃO PODE ENTRAR DUAS VEZES.
     *
     * `ficaNaLoja` da tela = liquido + recebidoDireto. Isso está certo quando
     * o líquido é o REPASSE (fontes 1 e 3), que por definição não inclui o
     * que o cliente pagou na mão.
     *
     * Mas a fonte 2 é `receita_real_loja` do relatório de PEDIDO — e ali
     * cada pedido tem a sua linha, inclusive os pagos em dinheiro. Somar o
     * recebido direto por cima conta o mesmo dinheiro de novo.
     *
     * Medido em 01/09/26 (Kawaii Poke, reclamação da DG via Diego): a tela
     * mostrava 78,4% de "fica na loja" onde o real é 75,2% — e o lojista, que
     * recebeu 63% no banco, leu a diferença inteira como erro nosso. Parte
     * era: R$ 991,19 de dinheiro contados 2× só em agosto. Na rede, 38 lojas
     * caem na fonte 2 e a inflação passava de R$ 27 mil/mês (DG FOODS, 30 de
     * 34 lojas, R$ 23,9 mil).
     *
     * É a mesma doença do VR no iFood (ver `project-vr-ja-no-repasse`): valor
     * que JÁ ESTÁ dentro do líquido, somado à parte. Terceira vez que aparece
     * neste projeto — por isso o flag viaja junto do número, e não numa
     * regra que quem lê precisa lembrar. */
    const liquidoIncluiDinheiro = liquidoUsar === liquidoDoRelatorio
    const recebidoDireto = liquidoIncluiDinheiro
      ? 0
      : vendaDiretaDoMes(unitId, acc.dias, diasDaApi, pedidosPorDia, apiPorDia)
    const ticketMedio = acc.pedidos > 0 ? acc.bruto / acc.pedidos : 0
    const pctLoja = acc.bruto > 0 ? (liquidoUsar / acc.bruto) * 100 : 0
    out.set(unitId, {
      pedidos: acc.pedidos,
      bruto: acc.bruto,
      liquido: liquidoUsar,
      comissaoRs: acc.comissao,
      taxaCanalPagamentoRs: acc.taxaPgto,
      promocoesRs: acc.promo,
      cancelamentosQtd: acc.cancel,
      avaliacaoMedia: mean(acc.avaliacoes),
      taxaAceitacaoMedia: mean(acc.aceitacoes),
      tempoPreparoMedio: mean(acc.tempos),
      diasComDados: acc.dias.size,
      ticketMedio,
      pctLoja,
      recebidoDireto,
      hasData: acc.bruto > 0 || acc.pedidos > 0,
    })
  }

  return out
}

/**
 * Dinheiro pago na porta, somado DIA A DIA e sem contar duas vezes.
 *
 * Cada dia pertence a UMA fonte. Dia que veio da planilha soma o
 * `ninefood_pedidos` (relatório de pedidos ou webhook); dia que veio da API
 * soma o `recebido_direto` do extrato. Sem essa separação a loja que tem as
 * duas fontes no mesmo dia contaria o mesmo pedido duas vezes.
 *
 * A equivalência foi medida: em 24/08/26, dos 263 pedidos da Faisão, os 21 que
 * a planilha marca "Pagamento em dinheiro" são exatamente os 21 que a API
 * marca `paymentMethod = 2`. As duas fontes falam a mesma coisa.
 */
function vendaDiretaDoMes(
  unitId: string,
  dias: Set<string>,
  diasDaApi: Set<string> | undefined,
  pedidosPorDia: Map<string, Map<string, DiaPedidos>>,
  apiPorDia: Map<string, Map<string, DiaApi>>,
): number {
  const planilha = pedidosPorDia.get(unitId)
  const api = apiPorDia.get(unitId)
  let total = 0
  for (const dia of dias) {
    total += diasDaApi?.has(dia)
      ? api?.get(dia)?.recebidoDireto ?? 0
      : planilha?.get(dia)?.direto ?? 0
  }
  return total
}

// ─── Financeiro da API do 99, por loja e por dia ─────────────────────

/** Um dia de uma loja no extrato da API do 99, na régua do relatório diário. */
type DiaApi = {
  pedidos: number
  bruto: number
  liquido: number
  comissao: number
  taxaCanal: number
  promo: number
  cancelados: number
  recebidoDireto: number
}

/**
 * Lê o extrato da API agregado por loja/dia (RPC `ninefood_api_diario`).
 *
 * ── POR QUE UMA RPC ───────────────────────────────────────────────────────
 * A versão anterior baixava CADA LINHA do `ninefood_api_bill` pelo PostgREST
 * pra somar em JS — milhares de linhas por mês pra virar meia dúzia de
 * totais. Agora o Postgres soma e devolve no máximo uma linha por loja/dia.
 *
 * ── E POR QUE OS CAMPOS MUDARAM ───────────────────────────────────────────
 * O bruto vinha de `mealOriginalAmount` (o preço de TABELA) e o líquido de
 * `settlementAmount` (o repasse, já descontado canal de pagamento e
 * vale-refeição). Nenhum dos dois é o que o relatório diário chama de bruto e
 * líquido — a loja no fallback aparecia com ~17% de bruto a mais e ~20% de
 * líquido a menos que a loja ao lado, medida pela planilha.
 *
 * A régua certa foi medida pedido a pedido (ver a migration 0227): o bruto é
 * `commissionBaseAmount` e o líquido é `orderAmount`.
 */
async function ninefoodApiPorDia(
  unitIds: string[],
  year: number,
  month: number,
  dateRange?: { start: string; end: string },
): Promise<Map<string, Map<string, DiaApi>>> {
  const out = new Map<string, Map<string, DiaApi>>()
  if (unitIds.length === 0) return out

  const mm = String(month).padStart(2, "0")
  const de = dateRange?.start ?? `${year}-${mm}-01`
  // Último dia do mês: dia 0 do mês seguinte.
  const ate = dateRange?.end ?? isoDate(new Date(year, month, 0))

  const admin = createAdminClient()
  const { data, error } = await admin.rpc("ninefood_api_diario", {
    p_unit_ids: unitIds,
    p_de: de,
    p_ate: ate,
  })
  if (error) {
    console.error("ninefoodApiPorDia:", error.message)
    return out
  }

  for (const r of (data ?? []) as {
    unit_id: string
    dia: string
    pedidos: number
    bruto: number | string
    liquido: number | string
    comissao: number | string
    taxa_canal: number | string
    promo: number | string
    cancelados: number
    recebido_direto: number | string
  }[]) {
    let porDia = out.get(r.unit_id)
    if (!porDia) {
      porDia = new Map<string, DiaApi>()
      out.set(r.unit_id, porDia)
    }
    porDia.set(r.dia, {
      pedidos: Number(r.pedidos) || 0,
      bruto: Number(r.bruto) || 0,
      liquido: Number(r.liquido) || 0,
      comissao: Number(r.comissao) || 0,
      taxaCanal: Number(r.taxa_canal) || 0,
      promo: Number(r.promo) || 0,
      cancelados: Number(r.cancelados) || 0,
      recebidoDireto: Number(r.recebido_direto) || 0,
    })
  }
  return out
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`
}

// ─── getNinefoodResumoForMonth (1 unidade, mesmo formato) ───────────

export async function getNinefoodResumoForMonth(
  unitId: string,
  year: number,
  month: number,
  dateRange?: { start: string; end: string },
): Promise<NinefoodResumo> {
  const batch = await getNinefoodResumoByUnits([unitId], year, month, dateRange)
  return (
    batch.get(unitId) ?? {
      recebidoDireto: 0,
      pedidos: 0,
      bruto: 0,
      liquido: 0,
      comissaoRs: 0,
      taxaCanalPagamentoRs: 0,
      promocoesRs: 0,
      cancelamentosQtd: 0,
      avaliacaoMedia: null,
      taxaAceitacaoMedia: null,
      tempoPreparoMedio: null,
      diasComDados: 0,
      ticketMedio: 0,
      pctLoja: 0,
      hasData: false,
    }
  )
}

// ─── getNinefoodDiasForMonth: 1 linha por dia importado ─────────────

export type NinefoodDiaResumo = {
  data: string // YYYY-MM-DD
  pedidos: number
  bruto: number
  liquido: number
  ticketMedio: number
  comissaoRs: number
  taxaCanalPagamentoRs: number
  promocoesRs: number
  avaliacaoLoja: number | null
  taxaAceitacaoPct: number | null
  cancelamentosQtd: number | null
  tempoMedioPreparoMin: number | null
}

export async function getNinefoodDiasForMonth(
  unitId: string,
  year: number,
  month: number,
): Promise<NinefoodDiaResumo[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("ninefood_daily_loja")
    .select(
      "data, pedidos, bruto, liquido, ticket_medio, comissao_rs, taxa_canal_pagamento_rs, promocoes_rs, avaliacao_loja, taxa_aceitacao_pct, cancelamentos_qtd, tempo_medio_preparo_min",
    )
    .eq("unit_id", unitId)
    .eq("ref_year", year)
    .eq("ref_month", month)
    .order("data", { ascending: true })

  if (error) {
    console.error("getNinefoodDiasForMonth error:", error.message)
    return []
  }
  return (data ?? []).map((r) => {
    const bruto = Number(r.bruto ?? 0)
    const comissao = Number(r.comissao_rs ?? 0)
    const taxaPgto = Number(r.taxa_canal_pagamento_rs ?? 0)
    const promo = Number(r.promocoes_rs ?? 0)
    // Líquido derivado (mesma regra do resumo): bruto − despesas da loja.
    const liquido = Math.max(0, bruto - comissao - taxaPgto - promo)
    return {
    data: r.data as string,
    pedidos: r.pedidos ?? 0,
    bruto,
    liquido,
    ticketMedio: Number(r.ticket_medio ?? 0),
    comissaoRs: comissao,
    taxaCanalPagamentoRs: taxaPgto,
    promocoesRs: promo,
    avaliacaoLoja: r.avaliacao_loja != null ? Number(r.avaliacao_loja) : null,
    taxaAceitacaoPct:
      r.taxa_aceitacao_pct != null ? Number(r.taxa_aceitacao_pct) : null,
    cancelamentosQtd: r.cancelamentos_qtd ?? null,
    tempoMedioPreparoMin: r.tempo_medio_preparo_min ?? null,
    }
  })
}

// ─── getNinefoodItensRankingForMonth: top itens vendidos ────────────

export type NinefoodItemRanking = {
  nomeItem: string
  receita: number
  qtdVendida: number
  precoMedio: number
  alcanceMedio: number
  conversaoMedia: number | null
  diasComVenda: number
}

export async function getNinefoodItensRankingForMonth(
  unitId: string,
  year: number,
  month: number,
  limit = 30,
): Promise<NinefoodItemRanking[]> {
  const admin = createAdminClient()
  // ref_year/ref_month não existem nessa tabela — filtra por data range
  const monthStr = String(month).padStart(2, "0")
  const startIso = `${year}-${monthStr}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const endExcl = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`

  const data = await pageAll<{
    nome_item: string | null
    receita: number | string | null
    qtd_vendida: number | null
    preco_medio: number | string | null
    alcance: number | null
    conversao_pct: number | string | null
  }>((from, to) =>
    admin
      .from("ninefood_daily_item")
      .select(
        "nome_item, receita, qtd_vendida, preco_medio, alcance, conversao_pct",
      )
      .eq("unit_id", unitId)
      .gte("data", startIso)
      .lt("data", endExcl)
      .order("id")
      .range(from, to),
  )

  // Agrega em JS por nome_item
  type Acc = {
    nomeItem: string
    receita: number
    qtdVendida: number
    precos: number[]
    alcances: number[]
    conversoes: number[]
    dias: number
  }
  const accs = new Map<string, Acc>()

  for (const row of data ?? []) {
    if (!row.nome_item) continue
    let acc = accs.get(row.nome_item)
    if (!acc) {
      acc = {
        nomeItem: row.nome_item,
        receita: 0,
        qtdVendida: 0,
        precos: [],
        alcances: [],
        conversoes: [],
        dias: 0,
      }
      accs.set(row.nome_item, acc)
    }
    acc.receita += Number(row.receita ?? 0)
    acc.qtdVendida += row.qtd_vendida ?? 0
    if (row.preco_medio && Number(row.preco_medio) > 0) {
      acc.precos.push(Number(row.preco_medio))
    }
    if (row.alcance && row.alcance > 0) {
      acc.alcances.push(row.alcance)
    }
    if (row.conversao_pct != null) {
      acc.conversoes.push(Number(row.conversao_pct))
    }
    if ((row.qtd_vendida ?? 0) > 0) acc.dias += 1
  }

  return Array.from(accs.values())
    .map((a) => ({
      nomeItem: a.nomeItem,
      receita: a.receita,
      qtdVendida: a.qtdVendida,
      precoMedio: a.precos.length > 0 ? mean(a.precos) ?? 0 : 0,
      alcanceMedio: a.alcances.length > 0 ? mean(a.alcances) ?? 0 : 0,
      conversaoMedia: a.conversoes.length > 0 ? mean(a.conversoes) : null,
      diasComVenda: a.dias,
    }))
    .sort((a, b) => b.receita - a.receita)
    .slice(0, limit)
}

// ─── ninefoodHasAnyDataForMonth: qualquer dado importado no mês? ────

/**
 * Retorna true se há qualquer dado importado do 99 Food (Loja OU Item)
 * pra essa unidade no mês. Usado pelo gate "Unidade sem dados no mês"
 * da página de detalhe — sem isso, Marcus importa só Cardápio e a página
 * bloqueia tudo achando que não tem nada.
 */
export async function ninefoodHasAnyDataForMonth(
  unitId: string,
  year: number,
  month: number,
): Promise<boolean> {
  const admin = createAdminClient()
  const monthStr = String(month).padStart(2, "0")
  const startIso = `${year}-${monthStr}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const endExcl = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`

  const [lojaRes, itemRes] = await Promise.all([
    admin
      .from("ninefood_daily_loja")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", unitId)
      .eq("ref_year", year)
      .eq("ref_month", month),
    admin
      .from("ninefood_daily_item")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", unitId)
      .gte("data", startIso)
      .lt("data", endExcl),
  ])
  return (lojaRes.count ?? 0) > 0 || (itemRes.count ?? 0) > 0
}

// ─── Avaliações 99 Food (das tabelas ninefood_pedidos) ──────────────

export type NinefoodAvaliacoesResumo = {
  total: number
  notaMedia: number
  distribucao: Record<1 | 2 | 3 | 4 | 5, number>
  comComentario: number
  topTagsPositivas: Array<{ tag: string; count: number }>
  topTagsNegativas: Array<{ tag: string; count: number }>
  hasData: boolean
}

export type NinefoodAvaliacaoListItem = {
  id: string
  pedidoIdCurto: string | null
  dataAvaliacao: string
  dataPedido: string | null
  nota: number
  comentario: string | null
  tags: string[]
  /** Cliente: 0 pedidos antes = novo */
  qtdPedidosAnteriores: number | null
}

/**
 * Resumo de avaliações do 99 Food no mês. Espelha AvaliacoesResumo do iFood.
 *
 * O 99 Food não separa tags entre positivas/negativas — vêm em string única.
 * Classificamos por nota: nota >= 4 → positivas; nota <= 2 → negativas.
 */
export async function getNinefoodAvaliacoesResumoForMonth(
  unitId: string,
  year: number,
  month: number,
): Promise<NinefoodAvaliacoesResumo> {
  const admin = createAdminClient()
  const monthStr = String(month).padStart(2, "0")
  const startIso = `${year}-${monthStr}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const endExcl = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`

  const rows = await pageAll<{
    nivel_avaliacao: number | string | null
    conteudo_avaliacao: string | null
    tag_avaliacao: string | null
  }>((from, to) =>
    admin
      .from("ninefood_pedidos")
      .select("nivel_avaliacao, conteudo_avaliacao, tag_avaliacao")
      .eq("unit_id", unitId)
      .not("nivel_avaliacao", "is", null)
      .gte("data_avaliacao", startIso)
      .lt("data_avaliacao", endExcl)
      .order("id")
      .range(from, to),
  )
  if (rows.length === 0) {
    return {
      total: 0,
      notaMedia: 0,
      distribucao: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      comComentario: 0,
      topTagsPositivas: [],
      topTagsNegativas: [],
      hasData: false,
    }
  }

  const dist: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0,
  }
  let soma = 0
  let comComentario = 0
  const tagPos = new Map<string, number>()
  const tagNeg = new Map<string, number>()
  for (const r of rows) {
    const nota = Number(r.nivel_avaliacao) as 1 | 2 | 3 | 4 | 5
    if (nota >= 1 && nota <= 5) {
      dist[nota] += 1
      soma += nota
    }
    if (r.conteudo_avaliacao && String(r.conteudo_avaliacao).trim().length > 0) {
      comComentario++
    }
    if (r.tag_avaliacao) {
      const tags = String(r.tag_avaliacao)
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean)
      const target = nota >= 4 ? tagPos : nota <= 2 ? tagNeg : null
      if (target) {
        for (const t of tags) target.set(t, (target.get(t) ?? 0) + 1)
      }
    }
  }
  return {
    total: rows.length,
    notaMedia: Math.round((soma / rows.length) * 100) / 100,
    distribucao: dist,
    comComentario,
    topTagsPositivas: Array.from(tagPos.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag, count]) => ({ tag, count })),
    topTagsNegativas: Array.from(tagNeg.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag, count]) => ({ tag, count })),
    hasData: true,
  }
}

/**
 * Lista de avaliações do mês (pra tab Avaliações da unidade).
 * Inclui comentário + tags + qtd pedidos anteriores do cliente.
 */
export async function listNinefoodAvaliacoesForMonth(
  unitId: string,
  year: number,
  month: number,
  limit = 100,
): Promise<NinefoodAvaliacaoListItem[]> {
  const admin = createAdminClient()
  const monthStr = String(month).padStart(2, "0")
  const startIso = `${year}-${monthStr}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const endExcl = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`

  const { data } = await admin
    .from("ninefood_pedidos")
    .select(
      "id, pedido_id, data_avaliacao, horario_pedido, nivel_avaliacao, conteudo_avaliacao, tag_avaliacao, qtd_pedidos_anteriores_cliente",
    )
    .eq("unit_id", unitId)
    .not("nivel_avaliacao", "is", null)
    .gte("data_avaliacao", startIso)
    .lt("data_avaliacao", endExcl)
    .order("data_avaliacao", { ascending: false })
    .limit(limit)

  return (data ?? []).map((r) => {
    const pedidoIdStr = String(r.pedido_id ?? "")
    return {
      id: String(r.id),
      pedidoIdCurto:
        pedidoIdStr.length > 6 ? "…" + pedidoIdStr.slice(-6) : pedidoIdStr,
      dataAvaliacao: String(r.data_avaliacao ?? ""),
      dataPedido: r.horario_pedido
        ? String(r.horario_pedido).slice(0, 10)
        : null,
      nota: Number(r.nivel_avaliacao ?? 0),
      comentario: r.conteudo_avaliacao
        ? String(r.conteudo_avaliacao)
        : null,
      tags: r.tag_avaliacao
        ? String(r.tag_avaliacao)
            .split(/[,;]/)
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
      qtdPedidosAnteriores:
        r.qtd_pedidos_anteriores_cliente != null
          ? Number(r.qtd_pedidos_anteriores_cliente)
          : null,
    }
  })
}

// ─── Cobertura: matriz loja × mês das 3 fontes 99 Food ──────────────

export type NinefoodCoverageStatus = "complete" | "partial" | "empty"

export type NinefoodCoverageCell = {
  loja: {
    // Dados da loja (financeiro agregado por dia)
    status: NinefoodCoverageStatus
    diasImportados: number
    diasNoMes: number
  }
  item: {
    // Dados do item (cardápio)
    status: NinefoodCoverageStatus
    diasImportados: number
  }
  pedido: {
    // Dados do pedido (avaliações + clientes + logística)
    status: NinefoodCoverageStatus
    totalPedidos: number
    diasComPedido: number
    diasNoMes: number
  }
  // Opcional — só a Keeta usa (relatório "Pedidos recentes", tabela própria).
  // O 99 Food deixa undefined e a coluna não é renderizada.
  recentes?: {
    status: NinefoodCoverageStatus
    totalPedidos: number
  }
  /** A loja operou nesse mês? false = N/A (antes de inaugurar / após fechar). */
  applicable: boolean
}

export type NinefoodCoverageMatrix = {
  months: Array<{ year: number; month: number; key: string; label: string }>
  units: Array<{
    id: string
    code: string
    name: string
    active: boolean
    cells: Record<string, NinefoodCoverageCell>
  }>
}

/** Mesmo threshold do iFood: 60% dos dias do mês = completo. */
const NINEFOOD_COMPLETE_RATIO = 0.6

/**
 * Versão 99 Food do getCoverageMatrix do iFood.
 * Pra cada loja × mês, diz o que tem importado das 3 fontes:
 *  - Loja (ninefood_daily_loja)
 *  - Item (ninefood_daily_item)
 *  - Pedido (ninefood_pedidos)
 */
export async function getNinefoodCoverageMatrix(
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number,
): Promise<NinefoodCoverageMatrix> {
  const admin = createAdminClient()

  // Gera lista de meses no range
  const months: NinefoodCoverageMatrix["months"] = []
  let y = startYear
  let m = startMonth
  while (y < endYear || (y === endYear && m <= endMonth)) {
    months.push({
      year: y,
      month: m,
      key: `${y}-${String(m).padStart(2, "0")}`,
      label: `${String(m).padStart(2, "0")}/${String(y).slice(2)}`,
    })
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }

  const rangeStart = `${startYear}-${String(startMonth).padStart(2, "0")}-01`
  const endLastDay = new Date(endYear, endMonth, 0).getDate()
  const rangeEnd = `${endYear}-${String(endMonth).padStart(2, "0")}-${String(endLastDay).padStart(2, "0")}`

  // Isolamento multi-tenant: só as lojas da empresa do usuário (null =
  // super-admin de plataforma sem vínculo → vê tudo). Empresa sem lojas → set
  // vazio → matriz vazia.
  const allowed = await getAccessibleUnitIds()
  const allowSet = allowed ? new Set(allowed) : null

  // Todas unidades
  const { data: unitsRows } = await admin
    .from("units")
    .select("id, code, name, active, data_inauguracao, data_encerramento")
    .order("code")
  const units = (unitsRows ?? []).filter((u) => !allowSet || allowSet.has(u.id))

  // Lojas vinculadas ao 99 Food + datas por plataforma (fallback: unidade).
  const { data: platRows } = await admin
    .from("unit_platforms")
    .select("unit_id, data_inauguracao, data_encerramento")
    .eq("platform", "99food")
    .eq("active", true)
  const platOpByUnit = new Map<
    string,
    { inaug: string | null; encer: string | null }
  >()
  for (const r of platRows ?? [])
    platOpByUnit.set(r.unit_id, {
      inaug: r.data_inauguracao,
      encer: r.data_encerramento,
    })
  const linkedToPlatform = new Set(platOpByUnit.keys())
  const unitIds = units.map((u) => u.id)

  const dateToKey = (d: string) => d.slice(0, 7)

  // 1) Loja: agrupa por (unit, year-month) e conta DIAS DISTINTOS
  // Como ninefood_daily_loja tem UNIQUE (unit_id, data), basta contar rows.
  const lojaByUnitMonth = new Map<string, Map<string, number>>()
  if (unitIds.length > 0) {
    const data = await pageAll<{
      unit_id: string
      data: string
      ref_year: number | null
      ref_month: number | null
    }>((from, to) =>
      admin
        .from("ninefood_daily_loja")
        .select("unit_id, data, ref_year, ref_month")
        .in("unit_id", unitIds)
        .gte("data", rangeStart)
        .lte("data", rangeEnd)
        .order("id")
        .range(from, to),
    )
    for (const r of data ?? []) {
      const k =
        r.ref_year != null && r.ref_month != null
          ? `${r.ref_year}-${String(r.ref_month).padStart(2, "0")}`
          : dateToKey(r.data as string)
      const inner = lojaByUnitMonth.get(r.unit_id) ?? new Map<string, number>()
      inner.set(k, (inner.get(k) ?? 0) + 1)
      lojaByUnitMonth.set(r.unit_id, inner)
    }
  }

  // 2) Item: conta DIAS DISTINTOS por (unit, year-month)
  // ninefood_daily_item NÃO tem unique por dia (tem por item-dia), então
  // usamos Set pra contar dias únicos.
  const itemByUnitMonth = new Map<string, Map<string, Set<string>>>()
  if (unitIds.length > 0) {
    const data = await pageAll<{ unit_id: string; data: string }>(
      (from, to) =>
        admin
          .from("ninefood_daily_item")
          .select("unit_id, data")
          .in("unit_id", unitIds)
          .gte("data", rangeStart)
          .lte("data", rangeEnd)
          .order("id")
          .range(from, to),
    )
    for (const r of data ?? []) {
      const dateStr = r.data as string
      const k = dateToKey(dateStr)
      const inner =
        itemByUnitMonth.get(r.unit_id) ?? new Map<string, Set<string>>()
      const set = inner.get(k) ?? new Set<string>()
      set.add(dateStr)
      inner.set(k, set)
      itemByUnitMonth.set(r.unit_id, inner)
    }
  }

  // 3) Pedido: conta total + dias distintos por (unit, year-month)
  const pedidoByUnitMonth = new Map<
    string,
    Map<string, { total: number; dias: Set<string> }>
  >()
  if (unitIds.length > 0) {
    const data = await pageAll<{
      unit_id: string
      data: string
      ref_year: number | null
      ref_month: number | null
    }>((from, to) =>
      admin
        .from("ninefood_pedidos")
        .select("unit_id, data, ref_year, ref_month")
        .in("unit_id", unitIds)
        .gte("data", rangeStart)
        .lte("data", rangeEnd)
        .order("id")
        .range(from, to),
    )
    for (const r of data ?? []) {
      const k =
        r.ref_year != null && r.ref_month != null
          ? `${r.ref_year}-${String(r.ref_month).padStart(2, "0")}`
          : dateToKey(r.data as string)
      const inner =
        pedidoByUnitMonth.get(r.unit_id) ??
        new Map<string, { total: number; dias: Set<string> }>()
      const cur = inner.get(k) ?? { total: 0, dias: new Set<string>() }
      cur.total += 1
      cur.dias.add(r.data as string)
      inner.set(k, cur)
      pedidoByUnitMonth.set(r.unit_id, inner)
    }
  }

  // Mês corrente — qualquer dado conta como completo
  const todayLocal = new Date()
  const currentYear = todayLocal.getFullYear()
  const currentMonth = todayLocal.getMonth() + 1

  return {
    months,
    units: units.map((u) => {
      const platOp = platOpByUnit.get(u.id)
      const op = {
        dataInauguracao:
          platOp?.inaug ??
          (u as { data_inauguracao: string | null }).data_inauguracao,
        dataEncerramento:
          platOp?.encer ??
          (u as { data_encerramento: string | null }).data_encerramento,
      }
      const isLinked = linkedToPlatform.has(u.id)
      const cells: Record<string, NinefoodCoverageCell> = {}
      for (const month of months) {
        const win = monthOperationWindow(month.year, month.month, op)
        const diasNoMes = win.operatingDays
        const isCurrentMonth =
          month.year === currentYear && month.month === currentMonth
        const minComplete = isCurrentMonth
          ? 1
          : Math.max(1, Math.ceil(diasNoMes * NINEFOOD_COMPLETE_RATIO))

        // Loja
        const lojaDias = lojaByUnitMonth.get(u.id)?.get(month.key) ?? 0
        const lojaStatus: NinefoodCoverageStatus =
          lojaDias >= minComplete
            ? "complete"
            : lojaDias > 0
              ? "partial"
              : "empty"

        // Item
        const itemSet = itemByUnitMonth.get(u.id)?.get(month.key)
        const itemDias = itemSet ? itemSet.size : 0
        const itemStatus: NinefoodCoverageStatus =
          itemDias >= minComplete
            ? "complete"
            : itemDias > 0
              ? "partial"
              : "empty"

        // Pedido
        const pedAcc = pedidoByUnitMonth.get(u.id)?.get(month.key)
        const pedTotal = pedAcc?.total ?? 0
        const pedDias = pedAcc?.dias.size ?? 0
        const pedidoStatus: NinefoodCoverageStatus =
          pedDias >= minComplete
            ? "complete"
            : pedDias > 0
              ? "partial"
              : "empty"

        cells[month.key] = {
          loja: { status: lojaStatus, diasImportados: lojaDias, diasNoMes },
          item: { status: itemStatus, diasImportados: itemDias },
          pedido: {
            status: pedidoStatus,
            totalPedidos: pedTotal,
            diasComPedido: pedDias,
            diasNoMes,
          },
          applicable: isLinked && win.applicable,
        }
      }
      return {
        id: u.id,
        code: u.code,
        name: u.name,
        active: u.active,
        cells,
      }
    }),
  }
}

// ─── Network: Top itens 99 Food ──────────────────────────────────────

/**
 * Mesmo formato/shape do iFood `ItemRanking` pra simplificar o card no
 * dashboard que troca via switcher.
 */
export type NinefoodTopItem = {
  nomeItem: string
  qtdVendida: number
  valorTotal: number
}

export async function getNetworkNinefoodTopItemsForMonth(
  year: number,
  month: number,
  limit = 5,
  filterUnitIds?: string[],
): Promise<NinefoodTopItem[]> {
  const admin = createAdminClient()
  const monthStr = String(month).padStart(2, "0")
  const startIso = `${year}-${monthStr}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const endExcl = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`

  const data = await pageAll<{
    nome_item: string | null
    receita: number | string | null
    qtd_vendida: number | null
  }>((from, to) => {
    let q = admin
      .from("ninefood_daily_item")
      .select("nome_item, receita, qtd_vendida")
      .gte("data", startIso)
      .lt("data", endExcl)
      .order("id")
      .range(from, to)
    if (filterUnitIds)
      q = q.in("unit_id", filterUnitIds)
    return q
  })

  const acc = new Map<string, NinefoodTopItem>()
  for (const r of data ?? []) {
    if (!r.nome_item) continue
    const cur = acc.get(r.nome_item) ?? {
      nomeItem: r.nome_item,
      qtdVendida: 0,
      valorTotal: 0,
    }
    cur.qtdVendida += r.qtd_vendida ?? 0
    cur.valorTotal += Number(r.receita ?? 0)
    acc.set(r.nome_item, cur)
  }
  return Array.from(acc.values())
    .sort((a, b) => b.valorTotal - a.valorTotal)
    .slice(0, limit)
}

// ─── Network: Cancelamentos por motivo 99 Food ──────────────────────

/**
 * O 99 Food não tem códigos numéricos como o iFood (411, 412). O motivo
 * vem como texto livre em inglês em `motivos_cancelamento_comerciante` e só
 * é preenchido quando o cancelamento é do comerciante — na maioria dos casos
 * a única pista é a parte responsável ("B/P/C/D duty"). Traduzimos os dois
 * pro pt-BR e agrupamos pelo rótulo final (lowercase + trim).
 */
export type NinefoodCancelamentoMotivo = {
  motivo: string
  pedidos: number
  /**
   * Valor do pedido que se perdeu. No 99 o `receita_vendas` do pedido
   * cancelado vem zerado (a venda não aconteceu), então o que representa a
   * perda é o `preco_original_item` — o valor do pedido antes de cair.
   * Usamos `receita_vendas` só quando ela vier preenchida.
   */
  perdaFinanceira: number
}

export async function getNetworkNinefoodCancelamentosForMonth(
  year: number,
  month: number,
  limit = 5,
  filterUnitIds?: string[],
): Promise<NinefoodCancelamentoMotivo[]> {
  const admin = createAdminClient()
  const monthStr = String(month).padStart(2, "0")
  const startIso = `${year}-${monthStr}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const endExcl = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`

  const data = await pageAll<{
    motivos_cancelamento_comerciante: string | null
    parte_responsavel_cancelamento: string | null
    receita_vendas: number | string | null
    preco_original_item: number | string | null
  }>((from, to) => {
    let q = admin
      .from("ninefood_pedidos")
      .select(
        "motivos_cancelamento_comerciante, parte_responsavel_cancelamento, receita_vendas, preco_original_item",
      )
      .not("horario_cancelamento", "is", null)
      .gte("horario_pedido", startIso)
      .lt("horario_pedido", endExcl)
      .order("id")
      .range(from, to)
    if (filterUnitIds)
      q = q.in("unit_id", filterUnitIds)
    return q
  })

  const acc = new Map<string, NinefoodCancelamentoMotivo>()
  for (const r of data ?? []) {
    // Traduz pro pt-BR e, quando a 99 não manda motivo (maioria dos casos),
    // cai na parte responsável ("B duty" → "Loja"). Só fica de fora quem não
    // tem nem motivo nem responsável.
    const label = cancelamentoRankingLabel(
      r.motivos_cancelamento_comerciante,
      r.parte_responsavel_cancelamento,
    )
    if (!label) continue
    // Normaliza pra agrupar variações
    const key = label.toLowerCase()
    const cur = acc.get(key) ?? {
      motivo: label,
      pedidos: 0,
      perdaFinanceira: 0,
    }
    cur.pedidos += 1
    // Pedido cancelado costuma vir com receita zerada — nesse caso a perda é
    // o valor original do pedido.
    const receita = Number(r.receita_vendas ?? 0)
    cur.perdaFinanceira += receita || Number(r.preco_original_item ?? 0)
    acc.set(key, cur)
  }
  return Array.from(acc.values())
    .sort((a, b) => b.pedidos - a.pedidos)
    .slice(0, limit)
}

// ─── Network: Avaliações 99 Food ─────────────────────────────────────

export type NetworkNinefoodAvaliacoes = {
  total: number
  notaMedia: number
  distribucao: Record<1 | 2 | 3 | 4 | 5, number>
  comComentario: number
  topTagsPositivas: Array<{ tag: string; count: number }>
  topTagsNegativas: Array<{ tag: string; count: number }>
  ultimosComentarios: Array<{
    id: string
    unitId: string
    unitCode: string
    unitName: string
    nota: number
    comentario: string
    data: string
    pedidoIdCurto: string | null
  }>
  hasData: boolean
}

export async function getNetworkNinefoodAvaliacoesForMonth(
  year: number,
  month: number,
  filterUnitIds?: string[],
): Promise<NetworkNinefoodAvaliacoes> {
  const admin = createAdminClient()
  const monthStr = String(month).padStart(2, "0")
  const startIso = `${year}-${monthStr}-01`
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year
  const endExcl = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`

  const rows = await pageAll<{
    id: string
    unit_id: string
    pedido_id: string | number | null
    nivel_avaliacao: number | string | null
    conteudo_avaliacao: string | null
    tag_avaliacao: string | null
    data_avaliacao: string | null
  }>((from, to) => {
    let q = admin
      .from("ninefood_pedidos")
      .select(
        "id, unit_id, pedido_id, nivel_avaliacao, conteudo_avaliacao, tag_avaliacao, data_avaliacao",
      )
      .not("nivel_avaliacao", "is", null)
      .gte("data_avaliacao", startIso)
      .lt("data_avaliacao", endExcl)
      .order("data_avaliacao", { ascending: false })
      .order("id")
      .range(from, to)
    if (filterUnitIds)
      q = q.in("unit_id", filterUnitIds)
    return q
  })
  if (rows.length === 0) {
    return {
      total: 0,
      notaMedia: 0,
      distribucao: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      comComentario: 0,
      topTagsPositivas: [],
      topTagsNegativas: [],
      ultimosComentarios: [],
      hasData: false,
    }
  }

  const dist: Record<1 | 2 | 3 | 4 | 5, number> = {
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0,
  }
  let soma = 0
  let comComentario = 0
  const tagPos = new Map<string, number>()
  const tagNeg = new Map<string, number>()
  for (const r of rows) {
    const nota = Number(r.nivel_avaliacao) as 1 | 2 | 3 | 4 | 5
    if (nota >= 1 && nota <= 5) {
      dist[nota] += 1
      soma += nota
    }
    if (r.conteudo_avaliacao && String(r.conteudo_avaliacao).trim().length > 0) {
      comComentario++
    }
    if (r.tag_avaliacao) {
      const tags = String(r.tag_avaliacao)
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean)
      const target = nota >= 4 ? tagPos : nota <= 2 ? tagNeg : null
      if (target) {
        for (const t of tags) target.set(t, (target.get(t) ?? 0) + 1)
      }
    }
  }

  // Últimos 5 comentários
  const comentariosNaoVazios = rows.filter(
    (r) =>
      r.conteudo_avaliacao &&
      String(r.conteudo_avaliacao).trim().length > 0,
  )
  const unitIds = Array.from(
    new Set(comentariosNaoVazios.slice(0, 50).map((r) => r.unit_id)),
  )
  const unitMap = new Map<string, { code: string; name: string }>()
  if (unitIds.length > 0) {
    const { data: units } = await admin
      .from("units")
      .select("id, code, name")
      .in("id", unitIds)
    for (const u of units ?? []) {
      unitMap.set(u.id, { code: u.code, name: u.name })
    }
  }
  const ultimosComentarios = comentariosNaoVazios.slice(0, 50).map((r) => {
    const pedidoIdStr = String(r.pedido_id ?? "")
    return {
      id: String(r.id),
      unitId: r.unit_id,
      unitCode: unitMap.get(r.unit_id)?.code ?? "?",
      unitName: unitMap.get(r.unit_id)?.name ?? "(unidade)",
      nota: Number(r.nivel_avaliacao),
      comentario: String(r.conteudo_avaliacao),
      data: String(r.data_avaliacao),
      pedidoIdCurto:
        pedidoIdStr.length > 6 ? "…" + pedidoIdStr.slice(-6) : pedidoIdStr || null,
    }
  })

  return {
    total: rows.length,
    notaMedia: Math.round((soma / rows.length) * 100) / 100,
    distribucao: dist,
    comComentario,
    topTagsPositivas: Array.from(tagPos.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([tag, count]) => ({ tag, count })),
    topTagsNegativas: Array.from(tagNeg.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([tag, count]) => ({ tag, count })),
    ultimosComentarios,
    hasData: true,
  }
}

/**
 * O financeiro da API por DIA DO MÊS — pro Relatório Diário, que precisa do
 * valor de cada dia e não do total.
 *
 * Existe porque a tela lia só `ninefood_daily_loja` (o XLSX). Loja que ainda
 * não subiu o relatório diário mas já tem o financeiro da API aparecia com
 * ZERO de 99Food ali, enquanto o resto do sistema (dashboard, DRE, Nino)
 * mostrava a receita certa. Na Santana isso escondia R$ 16 mil em julho/26.
 *
 * ⚠️ ERA UMA SEGUNDA CÓPIA da mesma leitura, com a mesma régua errada
 * (`mealOriginalAmount` como bruto, sem filtrar `order_type`). Duas cópias do
 * mesmo conceito significam que consertar uma deixa a outra mentindo — e foi
 * o que quase aconteceu em 24/08/26. Agora as duas saem da mesma RPC.
 */
export async function getNinefoodApiBillDiarioByUnits(
  unitIds: string[],
  year: number,
  month: number,
  dateRange?: { start: string; end: string },
): Promise<Map<string, Map<number, { bruto: number; pedidos: number }>>> {
  const out = new Map<string, Map<number, { bruto: number; pedidos: number }>>()
  const porDia = await ninefoodApiPorDia(unitIds, year, month, dateRange)
  for (const [unitId, dias] of porDia) {
    const m = new Map<number, { bruto: number; pedidos: number }>()
    for (const [iso, v] of dias) {
      const dia = Number(iso.slice(8, 10))
      if (!dia) continue
      const atual = m.get(dia) ?? { bruto: 0, pedidos: 0 }
      atual.bruto += v.bruto
      atual.pedidos += v.pedidos
      m.set(dia, atual)
    }
    if (m.size > 0) out.set(unitId, m)
  }
  return out
}

// ─── Helpers ─────────────────────────────────────────────────────────

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  const sum = values.reduce((s, v) => s + v, 0)
  return Math.round((sum / values.length) * 100) / 100
}

// ─── Composição do ticket (comanda) ──────────────────────────────────

export type ComposicaoTicket = {
  pedidos: number
  itensPorPedido: number
  pctComComplemento: number
  pctMultiItem: number
  complementosPorPedido: number
  pares: {
    base: string
    junto: string
    juntos: number
    pedidosBase: number
    pct: number
  }[]
}

/**
 * O que vem em cada pedido do 99, e o que vem junto.
 *
 * Sai da COMANDA (`ninefood_pedido_itens`), que é a única fonte que sabe o
 * que estava no MESMO pedido — a planilha "Dados do item" é agregada por dia
 * e nunca vai responder isso.
 *
 * Devolve `null` quando a loja não tem comanda no mês: a tela precisa
 * distinguir "não vendeu" de "esta loja ainda não tem a comanda", e um objeto
 * zerado diria a primeira coisa quando a verdade é a segunda.
 */
export async function getNinefoodComposicaoTicket(
  unitId: string,
  year: number,
  month: number,
): Promise<ComposicaoTicket | null> {
  const admin = createAdminClient()
  const [resumo, pares] = await Promise.all([
    admin.rpc("ninefood_ticket_resumo", {
      p_unit_id: unitId,
      p_year: year,
      p_month: month,
    }),
    admin.rpc("ninefood_ticket_pares", {
      p_unit_id: unitId,
      p_year: year,
      p_month: month,
      p_limite: 8,
    }),
  ])
  if (resumo.error) {
    console.error("getNinefoodComposicaoTicket:", resumo.error.message)
    return null
  }
  const r = ((resumo.data ?? []) as Record<string, unknown>[])[0]
  const pedidos = Number(r?.pedidos) || 0
  if (pedidos === 0) return null

  return {
    pedidos,
    itensPorPedido: Number(r?.itens_por_pedido) || 0,
    pctComComplemento: Number(r?.pct_com_complemento) || 0,
    pctMultiItem: Number(r?.pct_multi_item) || 0,
    complementosPorPedido: Number(r?.complementos_por_pedido) || 0,
    pares: ((pares.data ?? []) as Record<string, unknown>[]).map((p) => ({
      base: String(p.item_base ?? ""),
      junto: String(p.item_junto ?? ""),
      juntos: Number(p.juntos) || 0,
      pedidosBase: Number(p.pedidos_base) || 0,
      pct: Number(p.pct) || 0,
    })),
  }
}
