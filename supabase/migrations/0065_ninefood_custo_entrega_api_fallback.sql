-- Custo de entrega 99: usa o relatório manual (ninefood_pedidos) quando existe;
-- senão cai no extrato da API (ninefood_api_bill.raw). A API traz o custo em
-- b2pDeliveryAmount (logística) + freeDeliveryOutcome - freeDeliverySubsidy
-- (frete grátis líquido), em CENTAVOS. Valores conferidos vs manual (diff <7%,
-- por diferença de conjunto de pedidos). Resolve lojas só-API (ex.: Santana,
-- JK/junho) que ficavam com custo zerado.
CREATE OR REPLACE FUNCTION public.ninefood_custo_entrega_by_units(p_unit_ids uuid[], p_year integer, p_month integer)
 RETURNS TABLE(unit_id uuid, taxa numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with man as (
    select p.unit_id,
      round(sum(
        abs(coalesce(p.custos_logisticos, 0)) +
        abs(coalesce(p.custo_loja_oferta_entrega_gratis, 0))
      )::numeric, 2) as taxa
    from public.ninefood_pedidos p
    where p.unit_id = any(p_unit_ids)
      and p.ref_year = p_year
      and p.ref_month = p_month
    group by p.unit_id
  ),
  api as (
    select l.unit_id,
      round((sum(
        abs(coalesce((b.raw->>'b2pDeliveryAmount')::numeric, 0)) +
        abs(coalesce((b.raw->>'freeDeliveryOutcome')::numeric, 0)) -
        coalesce((b.raw->>'freeDeliverySubsidy')::numeric, 0)
      ) / 100)::numeric, 2) as taxa
    from public.ninefood_api_bill b
    join public.ninefood_store_links l on l.app_shop_id = b.app_shop_id
    where l.unit_id = any(p_unit_ids)
      and extract(year from b.business_date) = p_year
      and extract(month from b.business_date) = p_month
    group by l.unit_id
  )
  select
    coalesce(man.unit_id, api.unit_id) as unit_id,
    case when coalesce(man.taxa, 0) > 0 then man.taxa else coalesce(api.taxa, 0) end as taxa
  from man
  full join api on man.unit_id = api.unit_id;
$function$;
