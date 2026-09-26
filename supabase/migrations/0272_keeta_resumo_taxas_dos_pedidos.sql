/*
 * Keeta: a abertura das taxas do DRE passa a vir dos PEDIDOS (Marcus,
 * 25/09/26: "DRE não está batendo os valores com o dashboard").
 *
 * O DRE abria as taxas da Keeta pela Fatura, que é por CICLO de repasse e
 * fica incompleta no mês corrente — no CnP de set/26 ela explicava R$ 63.984
 * de R$ 198.973 de taxa e escondia R$ 134.988 numa linha de "diferença não
 * explicada". Os pedidos fecham ao centavo (com sinal, pedido a pedido):
 *   ganhos_liquidos = vendas_itens − despesa − comissao − outras_despesas
 *                     + outros_ganhos
 * (despesa = promoção da loja; comissao = comissão + distância;
 *  outras_despesas = pagamento online — ver reference-keeta-pedidos-campos.)
 *
 * Mesma função da 0268 com três somas a mais. Troca de colunas exige drop.
 */
drop function if exists public.keeta_resumo_por_loja(uuid[], int, int, date, date);

create function public.keeta_resumo_por_loja(
  p_unit_ids uuid[],
  p_year int,
  p_month int,
  p_de date default null,
  p_ate date default null
)
returns table (
  unit_id uuid,
  loja_bruto numeric,
  loja_pedidos bigint,
  loja_cancelados bigint,
  horas_soma numeric,
  dias_abertura bigint,
  ped_liquido numeric,
  ped_promo numeric,
  ped_bruto numeric,
  ped_qtd bigint,
  ped_promo_com_sinal numeric,
  ped_comissao numeric,
  ped_pagamento numeric,
  ped_outros_ganhos numeric
)
language sql
stable
set search_path = public
as $$
  with l as (
    select d.unit_id,
           sum(coalesce(d.vendas_itens, 0)) as bruto,
           sum(coalesce(d.total_pedidos, 0))::bigint as pedidos,
           sum(coalesce(d.pedidos_cancelados, 0))::bigint as cancelados,
           coalesce(sum(d.tempo_aberto_h) filter (where d.tempo_aberto_h > 0), 0) as horas,
           count(*) filter (where d.tempo_aberto_h > 0) as dias
    from public.keeta_daily_loja d
    where d.unit_id = any (p_unit_ids)
      and d.ref_year = p_year and d.ref_month = p_month
      and (p_de is null or d.data >= p_de)
      and (p_ate is null or d.data <= p_ate)
    group by d.unit_id
  ), p as (
    select k.unit_id,
           sum(coalesce(k.ganhos_liquidos, 0)) as liquido,
           sum(abs(coalesce(k.despesa, 0))) as promo,
           sum(coalesce(k.vendas_itens, 0)) as bruto,
           count(*) as qtd,
           sum(coalesce(k.despesa, 0)) as promo_sinal,
           sum(coalesce(k.comissao, 0)) as comissao,
           sum(coalesce(k.outras_despesas, 0)) as pagamento,
           sum(coalesce(k.outros_ganhos, 0)) as outros
    from public.keeta_pedidos k
    where k.unit_id = any (p_unit_ids)
      and k.ref_year = p_year and k.ref_month = p_month
      and (p_de is null or k.data >= p_de)
      and (p_ate is null or k.data <= p_ate)
    group by k.unit_id
  )
  select coalesce(l.unit_id, p.unit_id),
         coalesce(l.bruto, 0), coalesce(l.pedidos, 0), coalesce(l.cancelados, 0),
         coalesce(l.horas, 0), coalesce(l.dias, 0),
         coalesce(p.liquido, 0), coalesce(p.promo, 0), coalesce(p.bruto, 0), coalesce(p.qtd, 0),
         coalesce(p.promo_sinal, 0), coalesce(p.comissao, 0), coalesce(p.pagamento, 0),
         coalesce(p.outros, 0)
  from l full outer join p on p.unit_id = l.unit_id;
$$;

-- ⚠️ O REVOKE PRECISA INCLUIR `public` (ver 0083, 0151, 0226, 0227).
revoke execute on function public.keeta_resumo_por_loja(uuid[], int, int, date, date)
  from public, anon, authenticated;
grant execute on function public.keeta_resumo_por_loja(uuid[], int, int, date, date)
  to service_role;
