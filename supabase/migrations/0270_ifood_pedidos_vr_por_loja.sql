/*
 * VR por loja (tela Pedidos, aba iFood) somado NO BANCO (Marcus, 25/09/26:
 * "focar na fluidez"). `getVrByUnits` baixava todo pedido do mês com 15
 * colunas pra somar por loja. Aqui vem por (loja, bandeira de VR): pedidos,
 * total pago, valor dos itens e líquido. Bandeira vazia = não é VR.
 * Só service_role executa.
 */
create or replace function public.ifood_pedidos_vr_por_loja(
  p_unit_ids uuid[] default null,
  p_year int default null,
  p_month int default null,
  p_de date default null,
  p_ate date default null
)
returns table (
  unit_id uuid,
  bandeira_vr text,
  pedidos bigint,
  total_pago numeric,
  valor_itens numeric,
  valor_liquido numeric
)
language sql
stable
set search_path = public
as $$
  select p.unit_id,
         nullif(p.bandeira_vr, ''),
         count(*),
         sum(coalesce(p.total_pago_cliente, 0)),
         sum(coalesce(p.valor_itens, 0)),
         sum(coalesce(p.valor_liquido, 0))
  from public.ifood_pedidos p
  where (p_unit_ids is null or p.unit_id = any (p_unit_ids))
    and (
      (p_de is not null and p.data between p_de and p_ate)
      or (p_de is null and p.ref_year = p_year and p.ref_month = p_month)
    )
  group by 1, 2;
$$;

-- ⚠️ O REVOKE PRECISA INCLUIR `public` (ver 0083, 0151, 0226, 0227).
revoke execute on function public.ifood_pedidos_vr_por_loja(uuid[], int, int, date, date)
  from public, anon, authenticated;
grant execute on function public.ifood_pedidos_vr_por_loja(uuid[], int, int, date, date)
  to service_role;
