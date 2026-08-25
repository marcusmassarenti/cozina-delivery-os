-- O retrato da comanda do 99, pro aviso de "backfill concluído".
--
-- Vive no Postgres porque é agregação sobre uma tabela que cresce por pedido —
-- e porque o aviso sai de dentro de um cron que já está no limite de tempo.
create or replace function public.ninefood_comandas_resumo()
returns table (
  itens bigint,
  pedidos bigint,
  lojas integer,
  promo_loja numeric,
  de text,
  ate text
)
language sql
stable
set search_path = public
as $$
  select
    count(*) filter (where kind <> 'vazio')::bigint,
    count(distinct order_id_99)::bigint,
    count(distinct unit_id)::int,
    coalesce(sum(promo_loja), 0),
    to_char(min(data), 'DD/MM/YYYY'),
    to_char(max(data), 'DD/MM/YYYY')
  from public.ninefood_pedido_itens;
$$;

revoke execute on function public.ninefood_comandas_resumo()
  from public, anon, authenticated;
grant execute on function public.ninefood_comandas_resumo() to service_role;
