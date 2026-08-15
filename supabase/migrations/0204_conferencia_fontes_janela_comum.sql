-- Conferência API × planilha: comparar só a JANELA QUE AS DUAS FONTES COBREM.
--
-- ── O FALSO ALARME ────────────────────────────────────────────────────────
-- O e-mail de saúde de 15/08/2026 acusou 11 lojas com "dia faltando", e as
-- piores eram todas lojas que tinham acabado de conectar:
--
--   Marmitão do Churrasco — API 39 · planilha 415
--     "356 pedidos da planilha não vieram pela API — vale checar se o sync
--      está rodando nesta loja."
--
-- O sync estava rodando perfeitamente. A loja conectou em 14/08: a API só tem
-- dado a partir daí, e a planilha cobre o mês inteiro desde o dia 1º. A função
-- comparava um pedaço de mês contra o mês todo e chamava a diferença de falha.
--
-- O "miolo" que já existia resolve OUTRA coisa — descarta o primeiro e o
-- último dia do mês, por causa do pedido da virada, cujo evento financeiro cai
-- na competência vizinha. Não tinha como saber que a API começou no dia 13.
--
-- ── O CONSERTO ────────────────────────────────────────────────────────────
-- A janela passa a ser a INTERSEÇÃO entre o período que a API cobre e o que a
-- planilha cobre, POR LOJA — ainda dentro do miolo do mês. Fora dela não há
-- comparação possível: uma das fontes simplesmente não existe ali, e ausência
-- de dado não é divergência de dado.
--
-- Alarme que grita em loja saudável é pior que alarme nenhum: ensina a ignorar
-- o relatório, e aí o dia em que o sync PARAR de verdade passa batido.
create or replace function public.conferencia_fontes_ifood(p_year integer, p_month integer)
returns table(unit_id uuid, pedidos_api integer, pedidos_planilha integer,
              so_api_miolo integer, so_planilha_miolo integer,
              so_api_borda integer, so_planilha_borda integer,
              primeiro_dia_faltante date)
language sql stable security definer set search_path to 'public'
as $function$
  with lim as (
    select make_date(p_year, p_month, 2) ini,
           ((make_date(p_year, p_month, 1) + interval '1 month')::date - 2) fim
  ),
  api as (
    select p.unit_id, p.pedido_id, min(p.data) dia
    from ifood_pedidos p
    where p.ref_year = p_year and p.ref_month = p_month and p.source = 'api'
    group by 1, 2
  ),
  pl as (
    select l.unit_id, l.pedido_associado_ifood pedido_id,
           min(l.data_fato_gerador::date) dia
    from ifood_financeiro_lancamentos l
    where l.ref_year = p_year and l.ref_month = p_month
      and l.fato_gerador = 'Venda'
      and l.pedido_associado_ifood is not null
    group by 1, 2
  ),
  -- A JANELA COMUM, por loja: onde as duas fontes de fato existem.
  janela as (
    select a.unit_id,
           greatest(min(a.dia), min(p.dia), (select ini from lim)) as de,
           least(max(a.dia), max(p.dia), (select fim from lim))   as ate
    from api a
    join (select unit_id, min(dia) dia, max(dia) dia_max from pl group by 1) x
      on x.unit_id = a.unit_id
    join pl p on p.unit_id = a.unit_id
    group by a.unit_id
  ),
  falta_na_planilha as (
    select a.unit_id,
      count(*) filter (where a.dia between j.de and j.ate) miolo,
      count(*) filter (where a.dia not between j.de and j.ate) borda,
      min(a.dia) filter (where a.dia between j.de and j.ate) primeiro
    from api a
    join janela j on j.unit_id = a.unit_id
    left join pl p on p.unit_id = a.unit_id and p.pedido_id = a.pedido_id
    where p.pedido_id is null
    group by 1
  ),
  falta_na_api as (
    select p.unit_id,
      count(*) filter (where p.dia between j.de and j.ate) miolo,
      count(*) filter (where p.dia not between j.de and j.ate) borda
    from pl p
    join janela j on j.unit_id = p.unit_id
    left join api a on a.unit_id = p.unit_id and a.pedido_id = p.pedido_id
    where a.pedido_id is null
    group by 1
  ),
  base as (select unit_id from api intersect select unit_id from pl)
  select
    b.unit_id,
    (select count(*)::int from api a where a.unit_id = b.unit_id),
    (select count(*)::int from pl p where p.unit_id = b.unit_id),
    coalesce(fp.miolo, 0)::int,
    coalesce(fa.miolo, 0)::int,
    coalesce(fp.borda, 0)::int,
    coalesce(fa.borda, 0)::int,
    fp.primeiro
  from base b
  left join falta_na_planilha fp on fp.unit_id = b.unit_id
  left join falta_na_api fa on fa.unit_id = b.unit_id
$function$;

-- ⚠️ `create or replace` MANTÉM os grants, mas a reincidência de RPC aberta ao
-- anônimo neste projeto (jul e ago/26) custou dois P0. Reafirmar é barato.
revoke execute on function public.conferencia_fontes_ifood(integer, integer)
  from public, anon, authenticated;
grant execute on function public.conferencia_fontes_ifood(integer, integer)
  to service_role;
