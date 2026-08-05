--------------------------------------------------------------------
-- 0160_ninefood_custo_entrega_webhook.sql
--
-- O custo logístico do 99 passa a ter DUAS origens:
--   custos_logisticos  → planilha (relatório de pedidos)
--   custo_logistica    → webhook orderNew (campo `logistics_cost`, anunciado
--                        pela 99 em 05/ago/26 mas chegando desde 11/jun)
--
-- COALESCE, não soma: é o MESMO custo visto por fontes diferentes. Hoje só 1
-- pedido em 9.551 tem os dois preenchidos — mas basta um pra justificar, e em
-- agosto as duas fontes convivem. Somar dobraria o custo desses pedidos.
-- A planilha tem prioridade por ser a fonte que o financeiro já concilia.
--
-- Ganho medido em ago/26: o custo do 99 saltou de R$ 0,00 pra R$ 1.473,00 em
-- 245 pedidos. Zero não era "não gastou": era a planilha do mês ainda não ter
-- sido subida. O card "Custo de Entrega" do dashboard mostrava o iFood e a
-- Keeta e simplesmente omitia o 99 até alguém importar o arquivo.
--------------------------------------------------------------------
create or replace function public.ninefood_custo_entrega_by_units(
  p_unit_ids uuid[],
  p_year integer,
  p_month integer
)
returns table (unit_id uuid, taxa numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.unit_id,
    coalesce(round(sum(
      abs(coalesce(nullif(p.custos_logisticos, 0), p.custo_logistica, 0)) +
      abs(coalesce(p.custo_loja_oferta_entrega_gratis, 0))
    )::numeric, 2), 0) as taxa
  from public.ninefood_pedidos p
  where p.unit_id = any(p_unit_ids)
    and p.ref_year = p_year
    and p.ref_month = p_month
  group by p.unit_id;
$$;

-- ⚠️ `create or replace` NÃO preserva grants — repetir sempre. Já mordeu duas
-- vezes neste projeto (RPC virando anônima / ficando inacessível).
revoke all on function public.ninefood_custo_entrega_by_units(uuid[], integer, integer) from public, anon;
grant execute on function public.ninefood_custo_entrega_by_units(uuid[], integer, integer)
  to authenticated, service_role;
