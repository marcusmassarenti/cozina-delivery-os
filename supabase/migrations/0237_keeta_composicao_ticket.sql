-- A composição do ticket da Keeta.
--
-- ── DE ONDE SAI ──────────────────────────────────────────────────────────
-- Da coluna `itens` do relatório "Pedidos recentes": uma lista de nomes
-- separada por `;`. Não é comanda de API (a Keeta não tem integração ainda),
-- mas responde a MESMA pergunta que a comanda do 99 — o que estava no mesmo
-- pedido. E com cobertura muito maior: 38.742 pedidos de 19 lojas desde
-- jan/26, contra os ~1.600 pedidos/mês do 99.
--
-- ⚠️ SEM COMPLEMENTO. O relatório lista só o item; o que o cliente escolheu
-- dentro dele não vem. Por isso o resumo não devolve `pct_com_complemento` —
-- e a tela mostra outro número no lugar, em vez de exibir zero, que afirmaria
-- que ninguém pede complemento.
--
-- ⚠️ O MESMO ITEM PODE APARECER DUAS VEZES ("Sobrecoxa;Sobrecoxa" = duas
-- unidades). Na contagem de itens por pedido isso conta duas vezes, que é o
-- certo; nos PARES entra distinto, senão o item formaria par consigo mesmo.
--
-- A direção do par segue a régua do 99 (migration 0236): devolve a leitura
-- MAIOR das duas, que é a que vira frase útil.
create or replace function public.keeta_ticket_resumo(
  p_unit_id uuid,
  p_year integer,
  p_month integer
)
returns table (
  pedidos bigint,
  itens_por_pedido numeric,
  pct_multi_item numeric
)
language sql
stable
set search_path = public
as $$
  with por_pedido as (
    select p.id,
           (select count(*) from unnest(string_to_array(p.itens, ';')) t(nome)
             where btrim(t.nome) <> '') as itens
      from public.keeta_pedidos_recentes p
     where p.unit_id = p_unit_id
       and p.ref_year = p_year
       and p.ref_month = p_month
       and p.itens is not null and btrim(p.itens) <> ''
  )
  select count(*) filter (where itens > 0)::bigint,
         round(avg(itens) filter (where itens > 0), 2),
         round(100.0 * count(*) filter (where itens > 1)
               / nullif(count(*) filter (where itens > 0), 0), 1)
  from por_pedido;
$$;

create or replace function public.keeta_ticket_pares(
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
    select distinct p.id as pedido, btrim(t.nome) as nome_item
      from public.keeta_pedidos_recentes p,
           unnest(string_to_array(p.itens, ';')) t(nome)
     where p.unit_id = p_unit_id
       and p.ref_year = p_year
       and p.ref_month = p_month
       and p.itens is not null
       and btrim(t.nome) <> ''
  ),
  total_por_item as (
    select nome_item, count(*)::bigint as pedidos from itens group by 1
  ),
  pares as (
    select a.nome_item as x, b.nome_item as y, count(*)::bigint as juntos
      from itens a
      join itens b on b.pedido = a.pedido and b.nome_item > a.nome_item
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
revoke execute on function public.keeta_ticket_resumo(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.keeta_ticket_resumo(uuid, integer, integer) to service_role;
revoke execute on function public.keeta_ticket_pares(uuid, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.keeta_ticket_pares(uuid, integer, integer, integer) to service_role;
