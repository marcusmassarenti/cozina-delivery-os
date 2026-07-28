-- Inclui no diagnóstico as lojas DECLARADAS numa plataforma mas sem conexão.
--
-- A 0130 partia de "tem api_store_id" e de "está em ninefood_store_links" —
-- só enxergava quem já estava conectado. Uma loja cadastrada com a plataforma
-- marcada, mas que ninguém conectou, era invisível: não aparecia como
-- conectada (não é) nem como problema. O relatório dizia "41/41 ok" com elas
-- fora da conta — a pior forma de erro, a que parece acerto.
--
-- ⚠️ Sem API NÃO é sem dado: metade das lojas da 99 entra por planilha. Quem
-- consome esta função tem que julgar pela FRESCURA do dado, não pela conexão.

drop function if exists public.saude_lojas();

create or replace function public.saude_lojas()
returns table (
  unit_id uuid,
  plataforma text,
  conectada boolean,
  conectada_em timestamptz,
  ultimo_pedido date,
  ultimo_financeiro timestamptz,
  ultima_avaliacao date,
  pedidos_7d bigint
)
language sql
security definer
set search_path to 'public'
as $$
  select up.unit_id,
         'ifood'::text,
         up.api_store_id is not null,
         up.fin_enabled_at,
         (select max(p.data) from ifood_pedidos p where p.unit_id = up.unit_id),
         (select max(f.data_fato_gerador) from ifood_financeiro_lancamentos f where f.unit_id = up.unit_id),
         (select max(a.data_avaliacao) from ifood_avaliacoes a where a.unit_id = up.unit_id),
         (select count(*) from ifood_pedidos p
           where p.unit_id = up.unit_id and p.data >= current_date - 7)
    from unit_platforms up
    join units u on u.id = up.unit_id
   where up.platform = 'ifood' and u.active and coalesce(up.active, true)

  union all

  select up.unit_id,
         '99food'::text,
         exists (select 1 from ninefood_store_links l
                  where l.unit_id = up.unit_id and l.active),
         (select min(l.created_at) from ninefood_store_links l
           where l.unit_id = up.unit_id and l.active),
         (select max(p.data) from ninefood_pedidos p where p.unit_id = up.unit_id),
         (select max(b.business_date)::timestamptz from ninefood_api_bill b
           join ninefood_store_links l on l.app_shop_id = b.app_shop_id
          where l.unit_id = up.unit_id),
         null::date,
         (select count(*) from ninefood_pedidos p
           where p.unit_id = up.unit_id and p.data >= current_date - 7)
    from unit_platforms up
    join units u on u.id = up.unit_id
   where up.platform = '99food' and u.active and coalesce(up.active, true);
$$;

comment on function public.saude_lojas() is
  'Sinais de vida por loja e plataforma. Inclui lojas DECLARADAS sem conexão (conectada = false) — antes ficavam fora da conta e o relatório anunciava saúde total ignorando-as.';

revoke all on function public.saude_lojas() from public, anon, authenticated;
