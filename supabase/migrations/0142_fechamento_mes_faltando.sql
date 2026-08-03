-- O que faltou importar num mês fechado, por loja e plataforma.
-- Mede o RABO que falta (último dia do mês menos o último dia com dado), não
-- buracos no meio: loja fecha às segundas e furo no meio quase sempre é
-- operação, não esquecimento.
-- Só plataforma alimentada por planilha — se o dado vem por API e parou, o
-- problema é nosso e não se cobra do cliente.
--
-- NOTA (03/08/26): este arquivo era só este comentário, apontando pro banco
-- ("corpo completo em pg_get_functiondef"). Auditoria pegou: migration que não
-- recria a função invalida a promessa de restaurar o banco pelas migrations,
-- que é justamente o que docs/recuperacao-banco.md promete. O corpo abaixo foi
-- extraído da produção e conferido.

create or replace function public.fechamento_mes_faltando(
  p_unit_ids uuid[],
  p_year integer,
  p_month integer
)
returns table (
  unit_id uuid,
  plataforma text,
  ultimo_dia date,
  dias_faltando integer,
  media_diaria numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with periodo as (
    select make_date(p_year, p_month, 1) as ini,
           (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date as fim
  ),
  base as (
    -- Keeta: nunca tem API. Sempre planilha.
    select up.unit_id, 'keeta'::text as plataforma,
           (select max(k.data) from keeta_daily_loja k, periodo pe
             where k.unit_id = up.unit_id and k.data between pe.ini and pe.fim) as ultimo,
           (select avg(k.vendas_itens) from keeta_daily_loja k, periodo pe
             where k.unit_id = up.unit_id and k.data between pe.ini and pe.fim) as media
      from unit_platforms up join units u on u.id = up.unit_id
     where up.platform = 'keeta' and up.active and u.active
       and up.unit_id = any(p_unit_ids)

    union all

    -- 99 Food: só as lojas SEM vínculo de API.
    select up.unit_id, '99food'::text,
           (select max(n.data) from ninefood_daily_loja n, periodo pe
             where n.unit_id = up.unit_id and n.data between pe.ini and pe.fim),
           (select avg(n.bruto) from ninefood_daily_loja n, periodo pe
             where n.unit_id = up.unit_id and n.data between pe.ini and pe.fim)
      from unit_platforms up join units u on u.id = up.unit_id
     where up.platform = '99food' and up.active and u.active
       and up.unit_id = any(p_unit_ids)
       and not exists (select 1 from ninefood_store_links l
                        where l.unit_id = up.unit_id and l.active)

    union all

    -- iFood: idem, só quem não está vinculado à API.
    select up.unit_id, 'ifood'::text,
           (select max((f.data_fato_gerador at time zone 'America/Sao_Paulo')::date)
              from ifood_financeiro_lancamentos f, periodo pe
             where f.unit_id = up.unit_id
               and (f.data_fato_gerador at time zone 'America/Sao_Paulo')::date
                   between pe.ini and pe.fim),
           (select sum(f.valor_cesta_final) / nullif(count(distinct
                     (f.data_fato_gerador at time zone 'America/Sao_Paulo')::date), 0)
              from ifood_financeiro_lancamentos f, periodo pe
             where f.unit_id = up.unit_id and f.fato_gerador = 'Venda'
               and (f.data_fato_gerador at time zone 'America/Sao_Paulo')::date
                   between pe.ini and pe.fim)
      from unit_platforms up join units u on u.id = up.unit_id
     where up.platform = 'ifood' and up.active and u.active
       and up.unit_id = any(p_unit_ids)
       and up.api_store_id is null
  )
  select b.unit_id, b.plataforma, b.ultimo,
         (pe.fim - b.ultimo)::integer,
         round(coalesce(b.media, 0)::numeric, 2)
    from base b, periodo pe
   -- Loja sem NENHUM dado no mês fica de fora: ou não vendeu, ou nunca foi
   -- ligada — e "nunca ligou" já tem aviso próprio. Cobrar aqui seria pedir
   -- que ela conserte uma coisa que não começou.
   where b.ultimo is not null and (pe.fim - b.ultimo) > 0;
$function$;

-- `security definer` ignora RLS: só o servidor executa. Ver 0151, que fechou
-- esta e outras quatro depois de a auditoria achar que o anônimo executava.
revoke execute on function public.fechamento_mes_faltando(uuid[], integer, integer) from public, anon, authenticated;
grant  execute on function public.fechamento_mes_faltando(uuid[], integer, integer) to service_role;
