/*
 * Depósitos do 99 da REDE por data — a seção "Do DRE ao caixa" do DRE Grupo
 * (Marcus, 25/09/26: "os recebíveis, que poderiam ser somados").
 *
 * Mesma régua da `ninefood_repasses_por_deposito` (0260), que é por loja:
 * as vendas do período (business_date) agrupadas pela data em que o 99
 * deposita (expect_settle_date), `settlement_amount` em reais. Aqui somado
 * por data pra várias lojas de uma vez — uma chamada em vez de uma por loja.
 * Só service_role executa.
 */
create or replace function public.ninefood_depositos_rede(
  p_unit_ids uuid[],
  p_de date,
  p_ate date
)
returns table (deposito date, total numeric)
language sql
stable
set search_path = public
as $$
  select b.expect_settle_date::date as deposito,
         coalesce(sum(b.settlement_amount), 0) as total
  from public.ninefood_api_bill b
  join public.ninefood_store_links sl on sl.app_shop_id = b.app_shop_id
  where sl.unit_id = any (p_unit_ids)
    and b.expect_settle_date is not null
    and b.business_date between p_de and p_ate
  group by 1
  order by 1;
$$;

-- ⚠️ O REVOKE PRECISA INCLUIR `public` (ver 0083, 0151, 0226, 0227).
revoke execute on function public.ninefood_depositos_rede(uuid[], date, date)
  from public, anon, authenticated;
grant execute on function public.ninefood_depositos_rede(uuid[], date, date)
  to service_role;
