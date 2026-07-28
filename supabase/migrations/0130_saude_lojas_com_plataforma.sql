-- Sinais de vida por loja E POR PLATAFORMA.
--
-- A 0129 só enxergava o iFood, porque partia de unit_platforms. As lojas da
-- 99 vivem em ninefood_store_links e ficavam invisíveis — o relatório dizia
-- "41/41 ok" enquanto sete lojas na 99 não eram sequer checadas. Silêncio que
-- parece saúde é pior que alerta.
--
-- Cada plataforma tem sua própria noção de "financeiro":
--   iFood → data_fato_gerador dos lançamentos da conciliação
--   99    → business_date do extrato (Bill Data)
-- E a 99 não tem API de avaliação, então ali o campo é sempre nulo — a tela
-- mostra "n/d", nunca como atraso.

drop function if exists public.saude_lojas();

create or replace function public.saude_lojas()
returns table (
  unit_id uuid,
  plataforma text,
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
         up.fin_enabled_at,
         (select max(p.data) from ifood_pedidos p where p.unit_id = up.unit_id),
         (select max(f.data_fato_gerador) from ifood_financeiro_lancamentos f where f.unit_id = up.unit_id),
         (select max(a.data_avaliacao) from ifood_avaliacoes a where a.unit_id = up.unit_id),
         (select count(*) from ifood_pedidos p
           where p.unit_id = up.unit_id and p.data >= current_date - 7)
    from unit_platforms up
   where up.platform = 'ifood' and up.api_store_id is not null

  union all

  select l.unit_id,
         '99food'::text,
         l.created_at,
         (select max(p.data) from ninefood_pedidos p where p.unit_id = l.unit_id),
         (select max(b.business_date)::timestamptz from ninefood_api_bill b
           where b.app_shop_id = l.app_shop_id),
         null::date,
         (select count(*) from ninefood_pedidos p
           where p.unit_id = l.unit_id and p.data >= current_date - 7)
    from ninefood_store_links l
   where l.active and l.unit_id is not null;
$$;

comment on function public.saude_lojas() is
  'Sinais de vida por loja e plataforma (iFood e 99 Food). A comparação útil é ultimo_pedido x ultimo_financeiro: loja sem venda não gera lançamento, então atraso só é falha quando há pedido recente.';

revoke all on function public.saude_lojas() from public, anon, authenticated;
