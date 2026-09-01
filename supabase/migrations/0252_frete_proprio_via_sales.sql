-- O frete próprio agora tem DUAS fontes na mesma tabela, com marcadores
-- diferentes, e a RPC precisa reconhecer as duas:
--   planilha (Relatório de Pedidos): produto_logistico 'ENTREGA PROPRIA' /
--     'Entrega própria' / 'SELF_DELIVERY_PARTIAL_AREA'
--   API financeiro `sales` (0252, sync novo): tipo_entrega = logisticProvider
--     da API — 'MERCHANT' quando a LOJA entrega (é o sinal mais confiável,
--     por pedido, direto do iFood; 'IFOOD' = parceira, fica fora).
-- O upsert funde as fontes na mesma linha (unit_id+pedido_id UNIQUE, mesmo
-- uuid nos dois lados), então não há dupla contagem — cada pedido é 1 linha.
create or replace function public.ifood_frete_proprio_by_units(
  p_unit_ids uuid[],
  p_year integer,
  p_month integer,
  p_start_date date default null,
  p_end_date date default null
)
returns table(unit_id uuid, frete numeric)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    p.unit_id,
    coalesce(round(sum(p.taxa_entrega_cliente)::numeric, 2), 0) as frete
  from public.ifood_pedidos p
  where p.unit_id = any(p_unit_ids)
    and p.ref_year = p_year
    and p.ref_month = p_month
    and (
      p.tipo_entrega = 'MERCHANT'
      or p.produto_logistico in
        ('ENTREGA PROPRIA', 'Entrega própria', 'SELF_DELIVERY_PARTIAL_AREA')
    )
    and coalesce(p.taxa_entrega_cliente, 0) > 0
    and (p.status_final is null or p.status_final not ilike '%cancel%')
    and (p_start_date is null or p.data >= p_start_date)
    and (p_end_date is null or p.data <= p_end_date)
  group by p.unit_id;
$function$;

revoke all on function public.ifood_frete_proprio_by_units(uuid[], integer, integer, date, date) from public, anon, authenticated;
grant execute on function public.ifood_frete_proprio_by_units(uuid[], integer, integer, date, date) to service_role;
