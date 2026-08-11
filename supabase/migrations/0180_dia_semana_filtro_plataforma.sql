-- Filtro de plataforma no dia da semana.
--
-- O padrão semanal muda por canal: marketplace e canal próprio têm público e
-- hábito diferentes, e somados escondem um ao outro. Sem o filtro, "a terça é
-- fraca" pode ser fraca só no iFood e normal no resto.
--
-- `p_plataformas` NULL = todas (comportamento anterior, chamadas antigas não
-- quebram). Valores: 'ifood', 'cardapioweb', '99food', 'keeta'.
--
-- ⚠️ Medido em 10/08/26, últimos 90 dias: iFood 85.798 pedidos / R$ 4,73 mi ·
-- Keeta 19.963 / R$ 0 · 99 Food 13.625 / R$ 0 · Cardápio Web 193 / R$ 5.189.
-- Keeta e 99 devolvem valor ZERO porque as tabelas não guardam o preço do
-- pedido — quem filtrar por elas precisa medir por pedido, e a tela faz isso.

create or replace function public.vendas_dia_semana_por_loja(
  p_unit_ids uuid[],
  p_start date,
  p_end date,
  p_plataformas text[] default null
)
returns table(unit_id uuid, dia_semana integer, pedidos bigint, valor numeric)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ifood as (
    select l.unit_id,
           extract(dow from l.data_fato_gerador)::integer as dow,
           count(distinct l.pedido_associado_ifood) as pedidos,
           coalesce(sum(l.valor_cesta_final), 0) as valor
    from (
      -- Uma linha por pedido: o extrato tem N lançamentos por pedido, e somar
      -- direto multiplicaria a venda pelo número de taxas.
      select distinct on (v.unit_id, v.pedido_associado_ifood)
        v.unit_id, v.pedido_associado_ifood, v.data_fato_gerador, v.valor_cesta_final
      from public.ifood_financeiro_lancamentos v
      where v.unit_id = any(p_unit_ids)
        and v.fato_gerador = 'Venda'
        and v.pedido_associado_ifood is not null
        and v.valor_cesta_final is not null
        and v.data_fato_gerador::date between p_start and p_end
        and (p_plataformas is null or 'ifood' = any(p_plataformas))
    ) l
    group by 1, 2
  ),
  cw as (
    select c.unit_id, extract(dow from c.criado_em)::integer, count(*),
           coalesce(sum(c.total), 0)
    from public.cardapioweb_pedidos c
    where c.unit_id = any(p_unit_ids) and c.status <> 'canceled'
      and c.criado_em::date between p_start and p_end
      and (p_plataformas is null or 'cardapioweb' = any(p_plataformas))
    group by 1, 2
  ),
  nove as (
    select n.unit_id, extract(dow from n.data)::integer, count(*), 0::numeric
    from public.ninefood_pedidos n
    where n.unit_id = any(p_unit_ids) and n.data between p_start and p_end
      and (p_plataformas is null or '99food' = any(p_plataformas))
    group by 1, 2
  ),
  keeta as (
    select k.unit_id, extract(dow from k.data)::integer, count(*), 0::numeric
    from public.keeta_pedidos k
    where k.unit_id = any(p_unit_ids) and k.data between p_start and p_end
      and (p_plataformas is null or 'keeta' = any(p_plataformas))
    group by 1, 2
  ),
  juntos as (
    select * from ifood union all select * from cw
    union all select * from nove union all select * from keeta
  )
  select j.unit_id, j.dow, sum(j.pedidos)::bigint, round(sum(j.valor)::numeric, 2)
  from juntos j group by j.unit_id, j.dow order by j.unit_id, j.dow;
$function$;

create or replace function public.vendas_por_dia_semana(
  p_unit_ids uuid[],
  p_start date,
  p_end date,
  p_plataformas text[] default null
)
returns table(dia_semana integer, pedidos bigint, valor numeric)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select l.dia_semana, sum(l.pedidos)::bigint, round(sum(l.valor)::numeric, 2)
  from public.vendas_dia_semana_por_loja(p_unit_ids, p_start, p_end, p_plataformas) l
  group by l.dia_semana order by l.dia_semana;
$function$;

revoke execute on function public.vendas_dia_semana_por_loja(uuid[], date, date, text[]) from public, anon;
grant execute on function public.vendas_dia_semana_por_loja(uuid[], date, date, text[]) to authenticated, service_role;
revoke execute on function public.vendas_por_dia_semana(uuid[], date, date, text[]) from public, anon;
grant execute on function public.vendas_por_dia_semana(uuid[], date, date, text[]) to authenticated, service_role;
