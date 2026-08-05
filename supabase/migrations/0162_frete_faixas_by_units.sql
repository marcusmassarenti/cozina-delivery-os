--------------------------------------------------------------------
-- 0162_frete_faixas_by_units.sql
--
-- Distribuição dos pedidos por VALOR da taxa de entrega cobrada do cliente,
-- pro relatório /relatorios/frete.
--
-- Agrega no BANCO de propósito: são 64 mil pedidos só de iFood, e trazer linha
-- crua pra somar em JS é a doença que já produziu número errado neste projeto
-- (o teto de 1.000 linhas do PostgREST corta em silêncio — aconteceu comigo em
-- 05/ago numa medição que precisei jogar fora).
--
-- Cada plataforma guarda a taxa num lugar:
--   iFood        → taxa_entrega_cliente (só vem da PLANILHA de Pedidos; a API
--                  não entrega esse campo em pedido nenhum)
--   Keeta        → taxa_entrega
--   99 Food      → taxa_entrega_cheia (valor cheio, antes do desconto)
--   Cardápio Web → delivery_fee
--
-- NULL não entra: é "loja não subiu o relatório", não "frete zero". Zero de
-- verdade (frete grátis) entra como faixa própria — é informação, não ausência.
--
-- NEGATIVO também não entra: é linha de ESTORNO. A Keeta lança o cancelamento
-- como linha própria (status "Cancelado*") com venda -R$ 77,30 e frete -R$ 7,99.
-- Isso virava uma faixa "-R$ 7,99" com ticket negativo — leitura sem sentido,
-- ninguém paga frete negativo. O estorno segue no banco e já abate a receita
-- nos outros relatórios; ele só não é uma FAIXA DE PREÇO. Filtro por valor e
-- não por status, porque o rótulo de status da Keeta vem com pelo menos três
-- grafias diferentes.
--------------------------------------------------------------------
create or replace function public.frete_faixas_by_units(
  p_unit_ids uuid[],
  p_inicio date,
  p_fim date
)
returns table (
  plataforma text,
  taxa numeric,
  pedidos bigint,
  lojas bigint,
  receita_itens numeric,
  total_frete numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select 'ifood'::text plat, p.unit_id, p.taxa_entrega_cliente::numeric t,
           coalesce(p.valor_itens,0)::numeric v
    from ifood_pedidos p
    where p.unit_id = any(p_unit_ids) and p.data between p_inicio and p_fim
      and p.taxa_entrega_cliente >= 0
    union all
    select 'keeta', k.unit_id, k.taxa_entrega::numeric, coalesce(k.vendas_itens,0)::numeric
    from keeta_pedidos k
    where k.unit_id = any(p_unit_ids) and k.data between p_inicio and p_fim
      and k.taxa_entrega >= 0 and coalesce(k.vendas_itens,0) >= 0
    union all
    select '99food', n.unit_id, n.taxa_entrega_cheia::numeric, coalesce(n.receita_vendas,0)::numeric
    from ninefood_pedidos n
    where n.unit_id = any(p_unit_ids) and n.data between p_inicio and p_fim
      and n.taxa_entrega_cheia >= 0
    union all
    select 'cardapioweb', c.unit_id, c.delivery_fee::numeric, coalesce(c.total,0)::numeric
    from cardapioweb_pedidos c
    where c.unit_id = any(p_unit_ids)
      and (c.criado_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
      and c.delivery_fee >= 0
  )
  select plat, round(t,2), count(*), count(distinct unit_id),
         round(sum(v),2), round(sum(t),2)
  from base
  group by plat, round(t,2);
$$;

-- ⚠️ `create or replace` NÃO preserva grants — repetir sempre.
revoke all on function public.frete_faixas_by_units(uuid[], date, date) from public, anon;
grant execute on function public.frete_faixas_by_units(uuid[], date, date)
  to authenticated, service_role;
