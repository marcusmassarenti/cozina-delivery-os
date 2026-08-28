/*
 * Itens vendidos por semana — para os "mais e menos vendidos" da aba Semana.
 *
 * ⚠️ TRÊS FONTES, TRÊS FORMATOS:
 *   iFood  → `ifood_daily_items`, com data e valor
 *   99     → `ninefood_pedido_itens`, a comanda do pedido (data e valor)
 *   Keeta  → `keeta_daily_item`, com data e SEM valor
 *
 * ⚠️ O IFOOD SÓ TEM ITEM DIÁRIO ATÉ 11/08/26. Depois disso o relatório de
 * cardápio dele passou a vir agregado por período (ver a nota sobre a janela
 * do cardápio), e período não se fatia em semana. As semanas recentes saem
 * sem ele — por isso a coluna `plataformas` existe: a tela precisa dizer
 * quais entraram, senão o ranking parece cobrir a loja inteira.
 *
 * ⚠️ NÃO FUNDE NOME entre plataformas, de propósito. "Churrasco de Sobrecoxa
 * Defumado (Top Pote)" no 99 é "Sobrecoxa Desossada Defumada (Mais Pedido!)"
 * na Keeta — o mesmo prato. Fundir exigiria um de-para item a item, que este
 * projeto mediu e descartou em 16/08/26. Melhor duas linhas honestas com o
 * selo da plataforma do que uma linha inventada.
 */
create or replace function public.semana_itens(
  p_unit_id uuid, p_de date, p_ate date
)
returns table (
  semana date, nome_item text, qtd numeric, valor numeric, plataformas text[]
)
language sql stable set search_path = public
as $$
  with base as (
    select date_trunc('week', i.date)::date s, i.nome_item,
           coalesce(i.qtd_vendida,0)::numeric q, coalesce(i.valor_total,0)::numeric v,
           'ifood'::text plat
      from ifood_daily_items i
     where i.unit_id = p_unit_id and i.date between p_de and p_ate
       and i.nome_item is not null
    union all
    select date_trunc('week', p.data)::date, p.nome_item,
           coalesce(p.quantidade,0)::numeric, coalesce(p.valor_total,0)::numeric, '99food'
      from ninefood_pedido_itens p
     where p.unit_id = p_unit_id and p.data between p_de and p_ate
       and p.kind = 'item' and p.nome_item is not null
    union all
    select date_trunc('week', k.data)::date, k.nome_item,
           coalesce(k.qtd_vendida,0)::numeric, 0::numeric, 'keeta'
      from keeta_daily_item k
     where k.unit_id = p_unit_id and k.data between p_de and p_ate
       and k.nome_item is not null
  )
  select s, nome_item, sum(q)::numeric, sum(v)::numeric,
         array_agg(distinct plat order by plat)
    from base
   group by s, nome_item
  having sum(q) > 0
   order by s desc, sum(q) desc;
$$;

revoke execute on function public.semana_itens(uuid, date, date)
  from public, anon, authenticated;
