-- Sinais de vida de cada loja, agregados no banco.
--
-- Uma função só, em vez de varrer 640 mil lançamentos no Node. Devolve, por
-- unidade: quando ela vendeu pela última vez, até quando o financeiro chegou,
-- a última avaliação e o volume dos últimos 7 dias — que é o que distingue
-- "integração quebrada" de "loja parada".

create or replace function public.saude_lojas()
returns table (
  unit_id uuid,
  ultimo_pedido date,
  ultimo_financeiro timestamptz,
  ultima_avaliacao date,
  pedidos_7d bigint
)
language sql
security definer
set search_path to 'public'
as $$
  with u as (
    select distinct up.unit_id from unit_platforms up where up.api_store_id is not null
  )
  select u.unit_id,
         (select max(p.data) from ifood_pedidos p where p.unit_id = u.unit_id),
         (select max(f.data_fato_gerador) from ifood_financeiro_lancamentos f where f.unit_id = u.unit_id),
         (select max(a.data_avaliacao) from ifood_avaliacoes a where a.unit_id = u.unit_id),
         (select count(*) from ifood_pedidos p
            where p.unit_id = u.unit_id and p.data >= current_date - 7)
    from u;
$$;

comment on function public.saude_lojas() is
  'Alimenta o relatório diário de saúde. A comparação útil é ultimo_pedido x ultimo_financeiro: loja sem venda não gera lançamento, então atraso só é falha quando há pedido recente.';

revoke all on function public.saude_lojas() from public, anon, authenticated;
