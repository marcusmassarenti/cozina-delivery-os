/*
 * Keeta: somar NO BANCO em vez de baixar linha crua (Marcus, 25/09/26:
 * "focar na fluidez do sistema").
 *
 * Medido no Dashboard do CnP (setembro, 14 lojas): o top de itens baixava
 * 6.983 linhas de keeta_daily_item em páginas de 1.000 (3,2 s) e o resumo
 * por loja baixava 5.266 pedidos (2,0 s) — só pra somar em JS. Na DG (80
 * lojas) é várias vezes isso. As funções abaixo devolvem o agregado pronto
 * e as regras são as MESMAS do JS que substituem (lib/data/keeta-imported.ts).
 *
 * Só service_role executa (o app chama pelo admin client).
 */

-- Top itens do mês: Σ qtd e Σ (qtd × preço médio) por nome do item.
create or replace function public.keeta_top_itens_mes(
  p_year int,
  p_month int,
  p_unit_ids uuid[] default null,
  p_limit int default 500
)
returns table (nome_item text, qtd_vendida numeric, valor_total numeric)
language sql
stable
set search_path = public
as $$
  select k.nome_item,
         sum(coalesce(k.qtd_vendida, 0)) as qtd_vendida,
         sum(coalesce(k.qtd_vendida, 0) * coalesce(k.preco_medio, 0)) as valor_total
  from public.keeta_daily_item k
  where k.ref_year = p_year
    and k.ref_month = p_month
    and (p_unit_ids is null or k.unit_id = any (p_unit_ids))
    and coalesce(k.nome_item, '') <> ''
  group by k.nome_item
  order by 3 desc
  limit greatest(p_limit, 0);
$$;

-- Resumo por loja: o que vem da loja diária e o que vem dos pedidos, lado a
-- lado — os fallbacks (bruto dos pedidos quando falta a loja diária etc.)
-- continuam no JS, que é onde a regra está documentada.
create or replace function public.keeta_resumo_por_loja(
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
  ped_qtd bigint
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
           count(*) as qtd
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
         coalesce(p.liquido, 0), coalesce(p.promo, 0), coalesce(p.bruto, 0), coalesce(p.qtd, 0)
  from l full outer join p on p.unit_id = l.unit_id;
$$;

-- ⚠️ O REVOKE PRECISA INCLUIR `public` (ver 0083, 0151, 0226, 0227).
revoke execute on function public.keeta_top_itens_mes(int, int, uuid[], int)
  from public, anon, authenticated;
grant execute on function public.keeta_top_itens_mes(int, int, uuid[], int)
  to service_role;
revoke execute on function public.keeta_resumo_por_loja(uuid[], int, int, date, date)
  from public, anon, authenticated;
grant execute on function public.keeta_resumo_por_loja(uuid[], int, int, date, date)
  to service_role;
