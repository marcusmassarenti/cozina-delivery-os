import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/data/paginate";

export type ValorSemana = {
  /** O ciclo cujo PERÍODO é esta semana. null = a plataforma não fechou ainda. */
  ciclo: number | null;
  /** O repasse que CAIU na conta dentro desta semana (de um ciclo anterior). */
  caiu: number | null;
  /**
   * true = veio da tabela de repasse da plataforma, é o número exato.
   * false = reconstruído de dado de pedido, é aproximação — a tela precisa
   * dizer isso em vez de mostrar centavos que não existem.
   */
  exato: boolean;
};

export type RecebidoSemana = {
  ifood: ValorSemana;
  ninefood: ValorSemana;
  keeta: ValorSemana;
  /** VR (vale-refeição) recebido via iFood na semana — relatório de Pedidos. */
  vr: number;
};

const vazio = (): ValorSemana => ({ ciclo: null, caiu: null, exato: false });

/**
 * O que a semana rendeu e o que caiu na conta, por plataforma.
 *
 * ── POR QUE ISTO FOI REESCRITO (Marcus, 26/08/26) ────────────────────────
 * "os valores precisam bater exatamente". A tela mostrava R$ 20.915,66 onde o
 * banco recebeu R$ 21.002,81, e o mesmo acontecia nas outras duas.
 *
 * A causa era estrutural e igual nas três: a gente RECONSTRUÍA o repasse
 * somando dado de PEDIDO, quando repasse é um fato próprio — tem ciclo, tem
 * data e tem taxa. Reconstruir nunca ia fechar. E as três plataformas já
 * entregam esse fato pronto; ninguém lia:
 *
 *   iFood → `ifood_repasses`      (API de antecipações; ver o módulo)
 *   Keeta → `keeta_repasses`      (já importado, nunca usado aqui)
 *   99    → `ninefood_api_bill`   (settlementAmount, pra loja com API)
 *
 * ⚠️ AS DUAS PERGUNTAS SÃO DIFERENTES, E ERA A MISTURA QUE QUEBRAVA A TELA.
 * "O que a semana 17–23/08 rendeu" e "o que caiu na conta nessa semana" são
 * ciclos distintos: na JK o primeiro é R$ 21.002,81 (pago em 26/08) e o
 * segundo é R$ 17.570,65 (o ciclo 10–16/08, pago em 19/08). O Marcus preencheu
 * duas plataformas por um critério e a terceira pelo outro — sem perceber,
 * porque cada portal mostra o que quer.
 *
 * Devolver os dois, rotulados, é o que impede de repetir. Um número só,
 * qualquer que fosse, ia estar errado metade das vezes.
 *
 * ⚠️ `exato: false` NÃO É DETALHE. Loja sem API no 99 só tem planilha, e
 * planilha não tem data de liquidação. Mostrar o número como se fosse o
 * repasse seria a mesma mentira de antes, com cara nova.
 */
export async function getRecebidoSemana(
  unitId: string,
  inicio: string, // YYYY-MM-DD
  fim: string,
): Promise<RecebidoSemana> {
  const admin = createAdminClient();
  const fimTs = `${fim}T23:59:59`;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const soma = (rows: unknown[] | null, campo: string) =>
    round2(
      (rows ?? []).reduce<number>(
        (a, r) => a + (Number((r as Record<string, unknown>)[campo]) || 0),
        0,
      ),
    );

  const [
    ifoodCiclo,
    ifoodCaiu,
    keetaCiclo,
    keetaCaiu,
    nineLink,
    nineDiario,
    vrRows,
  ] = await Promise.all([
    admin
      .from("ifood_repasses")
      .select("valor_liquido")
      .eq("unit_id", unitId)
      .gte("ciclo_inicio", inicio)
      .lte("ciclo_fim", fim),
    admin
      .from("ifood_repasses")
      .select("valor_liquido")
      .eq("unit_id", unitId)
      .gte("data_pagamento", inicio)
      .lte("data_pagamento", fim),
    admin
      .from("keeta_repasses")
      .select("valor_repasse")
      .eq("unit_id", unitId)
      .eq(
        "ciclo_faturamento",
        `${inicio.replace(/-/g, ".")}~${fim.replace(/-/g, ".")}`,
      ),
    admin
      .from("keeta_repasses")
      .select("valor_repasse")
      .eq("unit_id", unitId)
      .gte("data_liquidacao", inicio)
      .lte("data_liquidacao", fim),
    admin
      .from("ninefood_store_links")
      .select("app_shop_id")
      .eq("unit_id", unitId)
      .maybeSingle(),
    fetchAllRows<{ liquido: number | string }>(
      (from, to) =>
        admin
          .from("ninefood_daily_loja")
          .select("liquido")
          .eq("unit_id", unitId)
          .gte("data", inicio)
          .lte("data", fim)
          .order("id")
          .range(from, to),
      "recebido semana 99 (planilha)",
    ),
    fetchAllRows<{ total_pago_cliente: number | string | null }>(
      (from, to) =>
        admin
          .from("ifood_pedidos")
          .select("total_pago_cliente")
          .eq("unit_id", unitId)
          .not("bandeira_vr", "is", null)
          .gte("data", inicio)
          .lte("data", fimTs)
          .order("id")
          .range(from, to),
      "recebido semana vr",
    ),
  ]);

  const ifood: ValorSemana = {
    ciclo: ifoodCiclo.data?.length
      ? soma(ifoodCiclo.data, "valor_liquido")
      : null,
    caiu: ifoodCaiu.data?.length ? soma(ifoodCaiu.data, "valor_liquido") : null,
    exato: Boolean(ifoodCiclo.data?.length || ifoodCaiu.data?.length),
  };

  const keeta: ValorSemana = {
    ciclo: keetaCiclo.data?.length
      ? soma(keetaCiclo.data, "valor_repasse")
      : null,
    caiu: keetaCaiu.data?.length ? soma(keetaCaiu.data, "valor_repasse") : null,
    exato: Boolean(keetaCiclo.data?.length || keetaCaiu.data?.length),
  };

  /**
   * 99: a API traz o `settlementAmount` por pedido, com a data de liquidação
   * prevista — dá pros dois recortes. Sem vínculo de API sobra a planilha, que
   * é diária e não sabe de liquidação: vira `ciclo` aproximado e `caiu: null`.
   *
   * A planilha ainda tem um segundo problema, visto na JK em 26/08/26: ela
   * tinha 1 dia dos 7 da semana. Por isso ela é o último recurso, não o
   * primeiro como era antes.
   */
  const appShopId = (nineLink.data as { app_shop_id?: string } | null)
    ?.app_shop_id;
  let ninefood: ValorSemana = vazio();
  if (appShopId) {
    /**
     * ⚠️ SEM O FILTRO `order_type = 1` AQUI, E DE PROPÓSITO.
     *
     * O resto do sistema filtra por `order_type = 1` porque a régua do
     * FATURAMENTO conta venda (migration 0227). Repasse é outra coisa: o
     * reembolso também entra na conta que o 99 deposita.
     *
     * Medido na JK, semana 17–23/08: `order_type = 1` soma R$ 3.876,41 e o
     * portal mostra R$ 3.870,10. A diferença é uma linha de `order_type = 4`
     * valendo −R$ 6,31 — exatamente o "Cancelamento e reembolso de pedidos" do
     * detalhamento do portal. Com ela, bate ao centavo.
     */
    const [porVenda, porLiquidacao] = await Promise.all([
      admin
        .from("ninefood_api_bill")
        .select("raw")
        .eq("app_shop_id", appShopId)
        .gte("business_date", inicio)
        .lte("business_date", fim),
      admin
        .from("ninefood_api_bill")
        .select("raw")
        .eq("app_shop_id", appShopId)
        .gte("expect_settle_date", inicio)
        .lte("expect_settle_date", fim),
    ]);
    const settle = (rows: { raw: Record<string, unknown> }[] | null) =>
      rows?.length
        ? round2(
            rows.reduce(
              (a, r) => a + Number(r.raw?.settlementAmount ?? 0) / 100,
              0,
            ),
          )
        : null;
    const c = settle(porVenda.data as never);
    const p = settle(porLiquidacao.data as never);
    ninefood = { ciclo: c, caiu: p, exato: c != null || p != null };
  }
  if (!ninefood.exato && nineDiario.length > 0) {
    ninefood = { ciclo: soma(nineDiario, "liquido"), caiu: null, exato: false };
  }

  return {
    ifood,
    ninefood,
    keeta,
    vr: soma(vrRows, "total_pago_cliente"),
  };
}

export type Fechamento = {
  id: string;
  unitId: string;
  periodoInicio: string; // YYYY-MM-DD
  periodoFim: string;
  recebidoIfood: number;
  recebidoKeeta: number;
  recebido99: number;
  /** VR da semana (coluna `credito_debito` reaproveitada). Soma no recebido. */
  vr: number;
  custoProdutos: number;
  custoVinagrete: number;
  acerto: Record<string, unknown>;
  observacoes: string | null;
  createdAt: string;
};

const num = (v: unknown) => (v == null ? 0 : Number(v));

function mapRow(r: Record<string, unknown>): Fechamento {
  return {
    id: r.id as string,
    unitId: r.unit_id as string,
    periodoInicio: r.periodo_inicio as string,
    periodoFim: r.periodo_fim as string,
    recebidoIfood: num(r.recebido_ifood),
    recebidoKeeta: num(r.recebido_keeta),
    recebido99: num(r.recebido_99),
    vr: num(r.credito_debito),
    custoProdutos: num(r.custo_produtos),
    custoVinagrete: num(r.custo_vinagrete),
    acerto: (r.acerto as Record<string, unknown>) ?? {},
    observacoes: (r.observacoes as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

/** Um fechamento pelo id (pra tela de impressão). */
export async function getFechamentoById(
  id: string,
): Promise<Fechamento | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("unit_fechamentos")
    .select(
      "id, unit_id, periodo_inicio, periodo_fim, recebido_ifood, recebido_keeta, recebido_99, credito_debito, custo_produtos, custo_vinagrete, acerto, observacoes, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

/** Todos os fechamentos da unidade, mais recentes primeiro. */
export async function getFechamentos(unitId: string): Promise<Fechamento[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("unit_fechamentos")
    .select(
      "id, unit_id, periodo_inicio, periodo_fim, recebido_ifood, recebido_keeta, recebido_99, credito_debito, custo_produtos, custo_vinagrete, acerto, observacoes, created_at",
    )
    .eq("unit_id", unitId)
    .order("periodo_inicio", { ascending: false });
  if (error) {
    console.error("getFechamentos:", error.message);
    return [];
  }
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}
