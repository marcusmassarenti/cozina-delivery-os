-- Os itens da comanda do 99 no mês, prontos pra Ficha Técnica.
--
-- ── DUAS PERGUNTAS DIFERENTES, NA MESMA CONSULTA ─────────────────────────
-- 1) QUANTIDADE VENDIDA. A planilha "Dados do item" e a comanda cobrem os
--    mesmos pedidos quando o dia existe nas duas — somar dobraria a venda, e
--    aqui isso vira DEMANDA DE INSUMO inflada, que é erro que chega na cozinha.
--    Então a comanda só entra no dia que a planilha não cobre.
--
-- 2) PROMOÇÃO BANCADA PELA LOJA. Essa não existe na planilha, em dia nenhum —
--    então soma tudo que a comanda tiver, sem risco de duplicar.
--
-- É a mesma régua dia-a-dia que o faturamento do 99 já usa desde 24/08/26.
-- Mistura de fontes só é honesta quando alguém decidiu, campo a campo, quem
-- ganha o dia.
create or replace function public.ninefood_comanda_itens_mes(
  p_unit_ids uuid[],
  p_year integer,
  p_month integer
)
returns table (
  unit_id uuid,
  nome_item text,
  qtd_extra numeric,
  promo_loja numeric,
  dias_comanda integer
)
language sql
stable
set search_path = public
as $$
  with dias_planilha as (
    select d.unit_id, d.data
      from public.ninefood_daily_item d
     where d.unit_id = any(p_unit_ids)
       and date_part('year', d.data) = p_year
       and date_part('month', d.data) = p_month
     group by 1, 2
  ),
  comanda as (
    select i.unit_id, i.data, i.nome_item, i.quantidade, i.promo_loja,
           exists (
             select 1 from dias_planilha p
              where p.unit_id = i.unit_id and p.data = i.data
           ) as dia_da_planilha
      from public.ninefood_pedido_itens i
     where i.unit_id = any(p_unit_ids)
       and i.ref_year = p_year
       and i.ref_month = p_month
       and i.kind = 'item'
  )
  select
    c.unit_id,
    c.nome_item,
    coalesce(sum(c.quantidade) filter (where not c.dia_da_planilha), 0),
    coalesce(sum(c.promo_loja), 0),
    count(distinct c.data)::int
  from comanda c
  group by c.unit_id, c.nome_item;
$$;

revoke execute on function public.ninefood_comanda_itens_mes(uuid[], integer, integer)
  from public, anon, authenticated;
grant execute on function public.ninefood_comanda_itens_mes(uuid[], integer, integer)
  to service_role;

comment on function public.ninefood_comanda_itens_mes is
  'Itens da comanda do 99 no mes: quantidade SO dos dias que a planilha nao cobre (pra nao duplicar) e a promocao bancada pela loja de todos os dias.';
