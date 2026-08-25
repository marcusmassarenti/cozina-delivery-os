-- A fila do backfill de comandas do 99.
--
-- Pedido que está no extrato (`Get Bill Data`) e ainda não tem item guardado.
-- A comanda vem do `Get Order Details`, um pedido por chamada, 10 req/10s —
-- por isso é fila com teto, e não uma varredura de uma vez só. Em 25/08/26
-- eram 18.007 pedidos, ~5 horas de chamadas.
--
-- Ordem do MAIS RECENTE pro mais antigo: se a fila parar no meio (deploy,
-- estouro de tempo), o que já entrou é o período que as telas mais olham.
create or replace function public.ninefood_pedidos_sem_comanda(p_limite integer default 200)
returns table (
  app_shop_id text,
  order_id text,
  unit_id uuid,
  business_date date
)
language sql
stable
set search_path = public
as $$
  select b.app_shop_id, b.order_id, sl.unit_id, b.business_date
    from public.ninefood_api_bill b
    join public.ninefood_store_links sl on sl.app_shop_id = b.app_shop_id
   where b.order_type = 1
     and sl.unit_id is not null
     and b.app_shop_id not like 'demo-%'
     and not exists (
       select 1 from public.ninefood_pedido_itens i
        where i.order_id_99 = b.order_id
     )
   order by b.business_date desc, b.order_id
   limit greatest(1, p_limite);
$$;

create or replace function public.ninefood_pedidos_sem_comanda_total()
returns bigint
language sql
stable
set search_path = public
as $$
  select count(*)
    from public.ninefood_api_bill b
    join public.ninefood_store_links sl on sl.app_shop_id = b.app_shop_id
   where b.order_type = 1
     and sl.unit_id is not null
     and b.app_shop_id not like 'demo-%'
     and not exists (
       select 1 from public.ninefood_pedido_itens i
        where i.order_id_99 = b.order_id
     );
$$;

-- ⚠️ O REVOKE PRECISA INCLUIR `public` — ver 0083, 0151, 0226 e 0227.
revoke execute on function public.ninefood_pedidos_sem_comanda(integer)
  from public, anon, authenticated;
grant execute on function public.ninefood_pedidos_sem_comanda(integer) to service_role;
revoke execute on function public.ninefood_pedidos_sem_comanda_total()
  from public, anon, authenticated;
grant execute on function public.ninefood_pedidos_sem_comanda_total() to service_role;

comment on function public.ninefood_pedidos_sem_comanda is
  'Fila do backfill de comandas do 99: pedidos do extrato que ainda nao tem item. Mais recentes primeiro.';
