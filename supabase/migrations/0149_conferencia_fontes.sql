-- Conferência entre as DUAS fontes do mesmo pedido do iFood: a Conciliação
-- que o cliente sobe e os Financial Events que puxamos pela API.
--
-- As duas nunca foram comparadas. A única vez que a comparação foi feita à
-- mão achou dois dias inteiros faltando no arquivo do cliente (0114: 2.832
-- pedidos na API contra 2.579 no arquivo).
--
-- ── Três decisões que vieram da verificação contra o dado real, não do
--    desenho no papel. As três primeiras versões desta função estavam erradas.
--
-- 1) COMPARA POR NÚMERO DO PEDIDO, NÃO POR DIA.
--    A v1 comparava dia a dia e acusava de 4 a 8 "dias faltando" em lojas cujo
--    total batia exato (Santo Peixe: 787 × 787). Os dias acusados eram 05, 12,
--    19 e 26 de julho — todos DOMINGOS. `ifood_pedidos.data` é a data do
--    pedido; `data_fato_gerador` é a do evento financeiro, que empurra o
--    pedido de domingo pra segunda. Comparar por dia media o calendário de
--    repasse do iFood, não a integridade do dado.
--
-- 2) SÓ LOJA COM AS DUAS FONTES POPULADAS.
--    Sem isso, loja que só sobe planilha aparece 100% divergente. Em julho
--    seriam 667 pedidos de 2 lojas sem sync poluindo a lista inteira.
--
-- 3) FALTANTE NA BORDA DO MÊS NÃO É DIVERGÊNCIA.
--    Pedido do dia 1º e do último dia tem o evento financeiro na competência
--    vizinha. Na JK, os 23 pedidos "faltando" em julho eram TODOS do dia 1º.
--    Com a borda separada, julho/26 fecha com ZERO divergência real na rede —
--    que é a prova de que este alarme não vai virar ruído.
--
-- ── 99 Food ficou de FORA de propósito.
--    Tentei incluir e a verificação reprovou: na Santana, os totais por dia
--    batem exato (11=11, 12=12, 14=14) e NENHUM id casa. Globalmente 1.986 de
--    2.711 linhas do extrato casam, então o identificador é o mesmo — o que
--    aponta pra vínculo `app_shop_id → loja` errado em algumas lojas. Incluir
--    o 99 hoje reportaria "264 pedidos faltando" na Santana, que é falso. O
--    vínculo precisa ser investigado antes.

create or replace function public.conferencia_fontes_ifood(
  p_year int,
  p_month int
)
returns table (
  unit_id uuid,
  pedidos_api int,
  pedidos_planilha int,
  /** Faltantes no MIOLO do mês — é isto que merece alarme. */
  so_api_miolo int,
  so_planilha_miolo int,
  /** Faltantes na borda (1º e último dia) — esperado, informativo. */
  so_api_borda int,
  so_planilha_borda int,
  primeiro_dia_faltante date
)
language sql
stable
security definer
set search_path to 'public'
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
  -- Anti-join de UMA passada. A versão com subconsulta correlacionada por
  -- linha estourava o statement_timeout de 8s na rede inteira.
  falta_na_planilha as (
    select a.unit_id,
      count(*) filter (where a.dia between (select ini from lim) and (select fim from lim)) miolo,
      count(*) filter (where a.dia not between (select ini from lim) and (select fim from lim)) borda,
      min(a.dia) filter (where a.dia between (select ini from lim) and (select fim from lim)) primeiro
    from api a
    left join pl p on p.unit_id = a.unit_id and p.pedido_id = a.pedido_id
    where p.pedido_id is null
    group by 1
  ),
  falta_na_api as (
    select p.unit_id,
      count(*) filter (where p.dia between (select ini from lim) and (select fim from lim)) miolo,
      count(*) filter (where p.dia not between (select ini from lim) and (select fim from lim)) borda
    from pl p
    left join api a on a.unit_id = p.unit_id and a.pedido_id = p.pedido_id
    where a.pedido_id is null
    group by 1
  ),
  base as (
    select unit_id from api
    intersect
    select unit_id from pl
  )
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

comment on function public.conferencia_fontes_ifood is
  'Compara Conciliacao x Financial Events POR NUMERO DO PEDIDO (nao por dia: as fontes datam o pedido de formas diferentes). So lojas com as duas fontes. Separa faltante do miolo do mes da borda, que e pedido da virada. 99 Food fora ate o vinculo app_shop_id->loja ser investigado.';
