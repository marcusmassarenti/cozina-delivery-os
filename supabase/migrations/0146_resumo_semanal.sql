-- Resumo da semana por holding, SÓ com as três plataformas fechadas.
-- Diário não dá: iFood entra pela API todo dia, 99 e Keeta dependem de planilha.
-- `completo` = toda plataforma que a holding usa tem dado até o último dia da
-- semana. Faltando uma, quem consome não manda nada — silêncio é melhor que um
-- número que parece total e não é.
--
-- NOTA (03/08/26): este arquivo era só este comentário, apontando pro banco
-- ("corpo completo em pg_get_functiondef"). Auditoria pegou: migration que não
-- recria a função invalida a promessa de restaurar o banco pelas migrations,
-- que é justamente o que docs/recuperacao-banco.md promete. O corpo abaixo foi
-- extraído da produção e conferido.

create or replace function public.resumo_semanal(
  p_holding uuid,
  p_ini date,
  p_fim date
)
returns table (
  bruto numeric,
  pedidos bigint,
  completo boolean,
  faltando text,
  loja_destaque text,
  variacao_pct numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ids as (
    select u.id from units u join brands b on b.id = u.brand_id
    where b.holding_id = p_holding and u.active
  ),
  usadas as (
    select distinct up.platform from unit_platforms up
    join ids on ids.id = up.unit_id where up.active
      and up.platform in ('ifood','99food','keeta')
  ),
  cobertura as (
    select 'ifood' plat, max(p.data) ate from ifood_pedidos p join ids on ids.id = p.unit_id
    union all
    select '99food', max(n.data) from ninefood_daily_loja n join ids on ids.id = n.unit_id
    union all
    select 'keeta', max(k.data) from keeta_daily_loja k join ids on ids.id = k.unit_id
  ),
  faltantes as (
    select string_agg(
      case u.platform when 'ifood' then 'iFood' when '99food' then '99 Food' else 'Keeta' end,
      ', ' order by u.platform)  as nomes
    from usadas u join cobertura c on c.plat = u.platform
    where c.ate is null or c.ate < p_fim
  ),
  ped_ifood as (
    select count(*)::bigint n, coalesce(sum(p.total_pago_cliente),0) v
    from ifood_pedidos p join ids on ids.id = p.unit_id
    where p.data between p_ini and p_fim
  ),
  ped_99 as (
    select coalesce(sum(n.pedidos),0)::bigint n, coalesce(sum(n.bruto),0) v
    from ninefood_daily_loja n join ids on ids.id = n.unit_id
    where n.data between p_ini and p_fim
  ),
  ped_keeta as (
    select coalesce(sum(k.total_pedidos),0)::bigint n, coalesce(sum(k.vendas_itens),0) v
    from keeta_daily_loja k join ids on ids.id = k.unit_id
    where k.data between p_ini and p_fim
  ),
  -- Loja com a maior variação contra a semana anterior. Piso de faturamento
  -- pra loja pequena com um dia fraco não virar manchete toda semana.
  por_loja as (
    select p.unit_id,
      count(*) filter (where p.data between p_ini and p_fim) atual,
      count(*) filter (where p.data between p_ini - 7 and p_fim - 7) anterior
    from ifood_pedidos p join ids on ids.id = p.unit_id
    where p.data between p_ini - 7 and p_fim
    group by 1
  ),
  destaque as (
    select u.name, round(100.0 * (pl.atual - pl.anterior) / pl.anterior, 0) var
    from por_loja pl join units u on u.id = pl.unit_id
    where pl.anterior >= 20
    order by (pl.atual - pl.anterior)::numeric / pl.anterior asc limit 1
  )
  select
    round((ped_ifood.v + ped_99.v + ped_keeta.v)::numeric, 2),
    ped_ifood.n + ped_99.n + ped_keeta.n,
    (select nomes from faltantes) is null,
    (select nomes from faltantes),
    (select name from destaque),
    (select var from destaque)
  from ped_ifood, ped_99, ped_keeta;
$function$;

-- `security definer` ignora RLS, e esta devolve FATURAMENTO por holding: só o
-- servidor executa. Ver 0151, que fechou esta e outras quatro depois de a
-- auditoria achar que o anônimo executava.
revoke execute on function public.resumo_semanal(uuid, date, date) from public, anon, authenticated;
grant  execute on function public.resumo_semanal(uuid, date, date) to service_role;
