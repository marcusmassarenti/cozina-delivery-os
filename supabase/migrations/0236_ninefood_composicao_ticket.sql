-- A composição do ticket do 99: o que vem em cada pedido, e o que vem junto.
--
-- ── POR QUE SÓ AGORA ─────────────────────────────────────────────────────
-- A aba de Cardápio do 99 dizia, em comentário e na tela, que a plataforma
-- não traz complemento. Trazia: sempre veio na comanda do webhook, e a gente
-- descartava. Com a comanda guardada (e o backfill preenchendo o histórico),
-- dá pra responder o que nenhuma planilha responde — porque a planilha
-- "Dados do item" é agregada por DIA e não sabe o que estava no mesmo pedido.
--
-- ── A DIREÇÃO DO PAR IMPORTA ─────────────────────────────────────────────
-- "De cada pedido que leva X, quantos levam Y" e o contrário são números
-- diferentes: na Jardins, 80% dos pedidos com Batata levam o Sobrecoxa, mas
-- só 5,7% dos pedidos com Sobrecoxa levam Batata. O primeiro vira frase útil
-- ("quase nunca vai sozinha"), o segundo vira ruído. A função devolve a
-- leitura MAIOR de cada par.
--
-- Corte em 3 pedidos: abaixo disso é coincidência, e uma lista de
-- coincidências ensina o lojista a ignorar a tela.
create or replace function public.ninefood_ticket_resumo(
  p_unit_id uuid,
  p_year integer,
  p_month integer
)
returns table (
  pedidos bigint,
  itens_por_pedido numeric,
  pct_com_complemento numeric,
  pct_multi_item numeric,
  complementos_por_pedido numeric
)
language sql
stable
set search_path = public
as $$
  with por_pedido as (
    select i.order_id,
           count(*) filter (where i.kind = 'item') as itens,
           count(*) filter (where i.kind = 'opcao') as opcoes
      from public.ninefood_pedido_itens i
     where i.unit_id = p_unit_id
       and i.ref_year = p_year
       and i.ref_month = p_month
       and i.kind in ('item', 'opcao')
     group by i.order_id
    having count(*) filter (where i.kind = 'item') > 0
  )
  select
    count(*)::bigint,
    round(avg(itens), 2),
    round(100.0 * count(*) filter (where opcoes > 0) / nullif(count(*), 0), 1),
    round(100.0 * count(*) filter (where itens > 1) / nullif(count(*), 0), 1),
    round(avg(opcoes), 2)
  from por_pedido;
$$;

create or replace function public.ninefood_ticket_pares(
  p_unit_id uuid,
  p_year integer,
  p_month integer,
  p_limite integer default 8
)
returns table (
  item_base text,
  item_junto text,
  juntos bigint,
  pedidos_base bigint,
  pct numeric
)
language sql
stable
set search_path = public
as $$
  with itens as (
    select distinct i.order_id, i.nome_item
      from public.ninefood_pedido_itens i
     where i.unit_id = p_unit_id
       and i.ref_year = p_year
       and i.ref_month = p_month
       and i.kind = 'item'
  ),
  total_por_item as (
    select nome_item, count(*)::bigint as pedidos from itens group by 1
  ),
  pares as (
    select a.nome_item as x, b.nome_item as y, count(*)::bigint as juntos
      from itens a
      join itens b on b.order_id = a.order_id and b.nome_item > a.nome_item
     group by 1, 2
    having count(*) >= 3
  ),
  direcoes as (
    select p.x as base, p.y as junto, p.juntos, tx.pedidos as pedidos_base,
           100.0 * p.juntos / nullif(tx.pedidos, 0) as pct
      from pares p join total_por_item tx on tx.nome_item = p.x
    union all
    select p.y, p.x, p.juntos, ty.pedidos,
           100.0 * p.juntos / nullif(ty.pedidos, 0)
      from pares p join total_por_item ty on ty.nome_item = p.y
  ),
  melhor as (
    select distinct on (least(base, junto), greatest(base, junto))
           base, junto, juntos, pedidos_base, pct
      from direcoes
     order by least(base, junto), greatest(base, junto), pct desc
  )
  select base, junto, juntos, pedidos_base, round(pct, 1)
    from melhor
   order by juntos desc, pct desc
   limit greatest(1, p_limite);
$$;

-- ⚠️ O REVOKE PRECISA INCLUIR `public` — ver 0083, 0151, 0226.
revoke execute on function public.ninefood_ticket_resumo(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.ninefood_ticket_resumo(uuid, integer, integer) to service_role;
revoke execute on function public.ninefood_ticket_pares(uuid, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.ninefood_ticket_pares(uuid, integer, integer, integer) to service_role;
