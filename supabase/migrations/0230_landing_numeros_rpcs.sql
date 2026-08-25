-- As duas consultas que alimentam os números da landing.
--
-- Vivem no Postgres, e não em JS, pelo motivo de sempre: são agregações sobre
-- tabelas grandes (2 milhões de lançamentos do iFood, 35 mil pedidos da
-- Keeta). Baixar linha pra somar no Node é a doença que este projeto já
-- mapeou em meia dúzia de telas.

-- 1) As competências que têm lançamento do iFood. O cálculo do bruto é feito
--    UMA por competência, então precisa saber quais existem.
create or replace function public.ifood_competencias_com_dado(p_unit_ids uuid[])
returns table (ref_year integer, ref_month integer)
language sql
stable
set search_path = public
as $$
  select distinct l.ref_year, l.ref_month
    from public.ifood_financeiro_lancamentos l
   where l.unit_id = any(p_unit_ids)
   order by 1, 2;
$$;

revoke execute on function public.ifood_competencias_com_dado(uuid[])
  from public, anon, authenticated;
grant execute on function public.ifood_competencias_com_dado(uuid[]) to service_role;

-- 2) 99, Keeta, Cardápio Web e as avaliações, numa passada só.
--
-- ⚠️ O 99 TEM DUAS FONTES e elas se sobrepõem. A API só entra nos DIAS que a
-- planilha não cobre — somar as duas inteiras dobraria o pedido que veio pelos
-- dois caminhos. É a mesma régua que o resumo do painel usa.
create or replace function public.landing_numeros_outras_plataformas(
  p_unit_ids uuid[]
)
returns table (
  vendas numeric,
  pedidos bigint,
  taxas numeric,
  avaliacoes bigint
)
language sql
stable
set search_path = public
as $$
  with nine_pl as (
    select n.unit_id, n.data,
           sum(n.bruto) as bruto, sum(n.pedidos) as ped,
           sum(coalesce(n.comissao_rs, 0) + coalesce(n.taxa_canal_pagamento_rs, 0)) as taxa
      from public.ninefood_daily_loja n
     where n.unit_id = any(p_unit_ids)
     group by 1, 2
  ),
  nine_api as (
    select sl.unit_id, b.business_date::date as data,
           sum((b.raw->>'commissionBaseAmount')::numeric) / 100 as bruto,
           count(*)::bigint as ped,
           -sum((b.raw->>'commissionAmount')::numeric
                + (b.raw->>'payCommissionAmount')::numeric) / 100 as taxa
      from public.ninefood_api_bill b
      join public.ninefood_store_links sl on sl.app_shop_id = b.app_shop_id
     where b.order_type = 1 and b.raw is not null
       and sl.unit_id = any(p_unit_ids)
     group by 1, 2
  ),
  nine_extra as (
    select a.* from nine_api a
     where not exists (
       select 1 from nine_pl p where p.unit_id = a.unit_id and p.data = a.data
     )
  )
  select
    coalesce((select sum(bruto) from nine_pl), 0)
      + coalesce((select sum(bruto) from nine_extra), 0)
      + coalesce((select sum(vendas_itens) from public.keeta_daily_loja
                   where unit_id = any(p_unit_ids)), 0)
      + coalesce((select sum(total) from public.cardapioweb_pedidos
                   where unit_id = any(p_unit_ids)), 0) as vendas,
    (coalesce((select sum(ped) from nine_pl), 0)
      + coalesce((select sum(ped) from nine_extra), 0)
      + coalesce((select sum(pedidos_validos) from public.keeta_daily_loja
                   where unit_id = any(p_unit_ids)), 0)
      + coalesce((select count(*) from public.cardapioweb_pedidos
                   where unit_id = any(p_unit_ids)), 0))::bigint as pedidos,
    coalesce((select sum(taxa) from nine_pl), 0)
      + coalesce((select sum(taxa) from nine_extra), 0)
      + coalesce((select sum(despesa_unidade) from public.keeta_daily_loja
                   where unit_id = any(p_unit_ids)), 0) as taxas,
    (coalesce((select count(*) from public.ifood_avaliacoes
                where unit_id = any(p_unit_ids)), 0)
      + coalesce((select count(*) from public.cardapioweb_avaliacoes
                   where unit_id = any(p_unit_ids)), 0)
      + coalesce((select count(*) from public.ninefood_pedidos
                   where unit_id = any(p_unit_ids)
                     and nivel_avaliacao is not null), 0))::bigint as avaliacoes;
$$;

revoke execute on function public.landing_numeros_outras_plataformas(uuid[])
  from public, anon, authenticated;
grant execute on function public.landing_numeros_outras_plataformas(uuid[])
  to service_role;
