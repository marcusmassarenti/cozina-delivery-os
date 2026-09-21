-- 99: quanto das vendas de um período já caiu na conta, e quando cai o resto.
--
-- O DRE conta por DATA DA VENDA; o banco, por DATA DO DEPÓSITO. O 99 paga toda
-- quarta a semana (seg–dom) anterior, e o cliente que compara o extrato com a
-- tela no meio do mês acha que "recebe menos" (Kawaii 01/09/26, Duéle
-- 21/09/26). Esta função devolve, pra vendas de [p_de, p_ate], um depósito
-- por linha — conferido na Duéle contra o painel financeiro do 99:
--
--   09/09  vendas 01–06/09   1.084,28   (= nosso líquido desses dias, exato)
--   16/09  vendas 07–13/09   5.102,81   (= "Ganhos totais" do painel)
--   23/09  vendas 14–19/09   5.431,04
--
-- Colunas de conciliação, pra tela explicar por que o total pago difere do
-- líquido do DRE sem ninguém precisar abrir o relatório:
--   • `liquido`          orderAmount dos pedidos válidos (o líquido do DRE)
--   • `repasse_vendas`   settlementAmount deles (sem VR, que vem por outro canal)
--   • `cancelados_pagos` pedido cancelado depois de pronto que o 99 PAGOU
--   • `ajustes`          estorno (tipo 2), reembolso cobrado da loja (tipo 4)…
--   • `total`            tudo que o 99 deposita naquela data por essas vendas
--
-- `settlement_amount` já está em reais. Só service_role executa.
create or replace function public.ninefood_repasses_por_deposito(
  p_unit_id uuid,
  p_de date,
  p_ate date
)
returns table (
  deposito date,
  venda_de date,
  venda_ate date,
  pedidos integer,
  liquido numeric,
  repasse_vendas numeric,
  cancelados_pagos numeric,
  ajustes numeric,
  total numeric
)
language sql
stable
set search_path = public
as $$
  select
    b.expect_settle_date::date as deposito,
    min(b.business_date)::date as venda_de,
    max(b.business_date)::date as venda_ate,
    count(*) filter (
      where b.order_type = 1 and coalesce((b.raw->>'cancelTs')::numeric, 0) = 0
        and b.raw ? 'orderAmount'
    )::int as pedidos,
    coalesce(sum((b.raw->>'orderAmount')::numeric) filter (
      where b.order_type = 1 and coalesce((b.raw->>'cancelTs')::numeric, 0) = 0
    ), 0) / 100 as liquido,
    coalesce(sum(b.settlement_amount) filter (
      where b.order_type = 1 and coalesce((b.raw->>'cancelTs')::numeric, 0) = 0
    ), 0) as repasse_vendas,
    coalesce(sum(b.settlement_amount) filter (
      where b.order_type = 1 and coalesce((b.raw->>'cancelTs')::numeric, 0) > 0
    ), 0) as cancelados_pagos,
    coalesce(sum(b.settlement_amount) filter (where b.order_type <> 1), 0) as ajustes,
    coalesce(sum(b.settlement_amount), 0) as total
  from public.ninefood_api_bill b
  join public.ninefood_store_links sl on sl.app_shop_id = b.app_shop_id
  where sl.unit_id = p_unit_id
    and b.expect_settle_date is not null
    and b.business_date between p_de and p_ate
  group by b.expect_settle_date::date
  order by 1;
$$;

-- ⚠️ O REVOKE PRECISA INCLUIR `public` (ver 0083, 0151, 0226, 0227).
revoke execute on function public.ninefood_repasses_por_deposito(uuid, date, date)
  from public, anon, authenticated;
grant execute on function public.ninefood_repasses_por_deposito(uuid, date, date)
  to service_role;
