-- 0223 — tirar o cast de data que fazia a tela Início varrer 851 MB.
--
-- SINTOMA: três "canceling statement due to statement timeout" na Início ao
-- mesmo tempo. O pior era `vendas_por_dia_semana`: 17 SEGUNDOS contra um teto
-- de 8s do PostgREST — ou seja, ele NUNCA terminava, e como a camada de dados
-- devolve `vazio` quando o RPC falha, o card de dia da semana ficava em branco
-- sem dizer por quê. Estourando sempre, ele ainda roubava CPU dos vizinhos e
-- derrubava junto o resumo financeiro e o VR.
--
-- CAUSA: `v.data_fato_gerador::date between p_start and p_end`. A coluna é
-- timestamptz, e o cast pra date depende do TimeZone da sessão — então o
-- planejador não consegue empurrar a faixa pro índice (unit_id,
-- data_fato_gerador) e cai em varredura sequencial da tabela inteira, que hoje
-- tem 1,85 milhão de linhas e 851 MB.
--
-- CORREÇÃO: faixa meio-aberta em timestamptz, que é sargável e dá EXATAMENTE
-- o mesmo recorte (o literal date→timestamptz é interpretado no mesmo fuso da
-- sessão que o `::date` usava).
--
-- MEDIDO: índice em vez de seq scan, 68.626 blocos lidos → 3.844, e a CTE do
-- iFood cai de ~17s para ~1,4s.
--
-- A LIÇÃO, que já apareceu duas vezes neste projeto: cast na COLUNA cega o
-- índice. O lado a converter é sempre o do parâmetro.

create or replace function public.vendas_dia_semana_por_loja(
  p_unit_ids uuid[], p_start date, p_end date, p_plataformas text[] default null
) returns table(unit_id uuid, dia_semana integer, pedidos bigint, valor numeric)
language sql stable set search_path to 'public' as $$
  with ifood as (
    select l.unit_id,
           extract(dow from l.data_fato_gerador)::integer as dow,
           count(distinct l.pedido_associado_ifood) as pedidos,
           coalesce(sum(l.valor_cesta_final), 0) as valor
    from (
      select distinct on (v.unit_id, v.pedido_associado_ifood)
        v.unit_id, v.pedido_associado_ifood, v.data_fato_gerador, v.valor_cesta_final
      from public.ifood_financeiro_lancamentos v
      where v.unit_id = any(p_unit_ids)
        and v.fato_gerador = 'Venda'
        and v.pedido_associado_ifood is not null
        and v.valor_cesta_final is not null
        -- Faixa meio-aberta: sargável contra ifood_fin_lanc_data_idx.
        and v.data_fato_gerador >= p_start::timestamptz
        and v.data_fato_gerador < (p_end + 1)::timestamptz
        and (p_plataformas is null or 'ifood' = any(p_plataformas))
    ) l
    group by 1, 2
  ),
  cw as (
    -- View, nao a tabela crua: pedido de marketplace que passou pelo hub ja e
    -- contado pela CTE daquele marketplace (dobro), e sandbox nao pode entrar.
    -- E `not ilike 'cancel%'` em vez de `<> 'canceled'`: a API do Cardapio Web
    -- nao publica a lista de status, e um 'cancelled' entraria como venda.
    select c.unit_id, extract(dow from c.criado_em)::integer, count(*),
           coalesce(sum(c.total), 0)
    from public.cardapioweb_pedidos_proprios c
    where c.unit_id = any(p_unit_ids) and c.status not ilike 'cancel%'
      and c.criado_em >= p_start::timestamptz
      and c.criado_em < (p_end + 1)::timestamptz
      and (p_plataformas is null or 'cardapioweb' = any(p_plataformas))
    group by 1, 2
  ),
  nove as (
    -- `data` aqui é date de verdade: comparar direto já usa índice.
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
$$;

-- A versão de 3 argumentos passa a DELEGAR em vez de repetir o corpo. Regra
-- duplicada neste projeto já divergiu na prática mais de uma vez, e esta era
-- uma cópia literal da outra — o cast lento viveria em duas casas.
create or replace function public.vendas_dia_semana_por_loja(
  p_unit_ids uuid[], p_start date, p_end date
) returns table(unit_id uuid, dia_semana integer, pedidos bigint, valor numeric)
language sql stable set search_path to 'public' as $$
  select l.unit_id, l.dia_semana, l.pedidos, l.valor
  from public.vendas_dia_semana_por_loja(p_unit_ids, p_start, p_end, null) l;
$$;

-- ── ifood_pedidos: índice de competência + resumo agregado ──────────────────
--
-- O segundo timeout da Início. `getVrByUnits` baixava 15 colunas de TODOS os
-- pedidos do mês (24.895 em agosto) em páginas de 1.000 pra somar em JS. Sem
-- índice por competência, CADA página fazia seq scan das 294 mil linhas mais
-- um sort em disco: ~350 ms por página × 25 páginas, contra 8 s de teto.
--
-- E `pageAll` faz `break` no erro devolvendo o que já tinha: o VR da rede saía
-- pela metade com cara de total. É a mesma doença do dado parcial silencioso.
create index if not exists ifood_pedidos_competencia_idx
  on public.ifood_pedidos (ref_year, ref_month, unit_id);

create index if not exists ifood_pedidos_data_idx
  on public.ifood_pedidos (unit_id, data);

create or replace function public.ifood_pedidos_resumo_by_units(
  p_unit_ids uuid[],
  p_year integer,
  p_month integer,
  p_start date default null,
  p_end date default null
) returns table(
  unit_id uuid,
  total_pedidos integer,
  total_valor numeric,
  valor_itens numeric,
  valor_liquido numeric,
  vr_pedidos integer,
  vr_valor numeric
)
language sql stable security definer set search_path to 'public' as $$
  select
    p.unit_id,
    count(*)::integer,
    coalesce(round(sum(p.total_pago_cliente)::numeric, 2), 0),
    coalesce(round(sum(p.valor_itens)::numeric, 2), 0),
    coalesce(round(sum(p.valor_liquido)::numeric, 2), 0),
    count(*) filter (where p.bandeira_vr is not null)::integer,
    coalesce(round(sum(p.total_pago_cliente) filter (where p.bandeira_vr is not null)::numeric, 2), 0)
  from public.ifood_pedidos p
  where p.unit_id = any(p_unit_ids)
    and (
      case when p_start is null then (p.ref_year = p_year and p.ref_month = p_month)
           else (p.data >= p_start and p.data <= coalesce(p_end, p_start))
      end
    )
  group by p.unit_id;
$$;

-- Anônimo não chama: a função é SECURITY DEFINER e passa por cima da RLS.
revoke all on function public.ifood_pedidos_resumo_by_units(uuid[], integer, integer, date, date) from public, anon;
grant execute on function public.ifood_pedidos_resumo_by_units(uuid[], integer, integer, date, date) to authenticated, service_role;
