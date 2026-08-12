-- Até que dia cada plataforma trouxe dado, POR LOJA.
--
-- Nasce de um erro real (12/ago/26): o Nino projetou o fechamento da Pinheiros
-- dividindo o faturamento pelos dias decorridos do mês. Era dia 12, mas a
-- Keeta — 78% do faturamento daquela loja — tinha parado no dia 10. Espalhar
-- 10 dias de venda por 12 devolveu R$ 44 mil e o rótulo "desaceleração"; pelo
-- dado real eram ~R$ 52 mil, ACIMA dos dois meses anteriores. O diagnóstico
-- saiu invertido, e esse é o pior formato de erro: não parece defeito de
-- sistema, parece queda de faturamento.
--
-- A correção daquele dia usou a cobertura da REDE (`getImportCoverageForMonth`,
-- que devolve UM número pra todas as lojas juntas). Resolveu o caso porque a
-- Keeta da rede também parava no dia 10 — por coincidência. Uma loja atrasada
-- em relação às outras continuava projetando alto.
--
-- Por que RPC e não consulta no app: o caminho honesto em JS seria baixar
-- (unit_id, data) de cada tabela e reduzir no cliente. Em
-- ifood_financeiro_lancamentos isso é dezenas de milhares de linhas por mês
-- para a rede — e, pior, cairia no limite padrão de 1.000 linhas do PostgREST,
-- que TRUNCA em silêncio. Ou seja: pra consertar um número que mentia baixo,
-- eu criaria outro número que mente baixo. O `max() group by` fica no banco.
--
-- Fontes espelham exatamente as de getImportCoverageForMonth, pra as duas
-- respostas não divergirem:
--   iFood → Conciliação (Entrada Financeira) OU relatório de Pedidos
--   99    → planilha diária OU a fatura da API (ligada por app_shop_id)
--   Keeta → planilha diária
--   CW    → pedidos do canal próprio (não existe no da rede; aqui existe)

create or replace function public.cobertura_por_unidade(
  p_unit_ids uuid[],
  p_year int,
  p_month int
)
returns table (
  unit_id uuid,
  ifood_dia int,
  ninefood_dia int,
  keeta_dia int,
  cardapioweb_dia int
)
language sql
stable
set search_path = public
as $$
  with alvo as (
    select unnest(p_unit_ids) as id
  ),
  ifood as (
    select l.unit_id, max(extract(day from l.data_fato_gerador)::int) dia
    from ifood_financeiro_lancamentos l
    where l.unit_id = any(p_unit_ids)
      and l.ref_year = p_year and l.ref_month = p_month
      and l.fato_gerador = 'Venda'
      and l.descricao_lancamento = 'Entrada Financeira'
      and l.data_fato_gerador is not null
    group by l.unit_id
  ),
  ifood_ped as (
    select p.unit_id, max(extract(day from p.data)::int) dia
    from ifood_pedidos p
    where p.unit_id = any(p_unit_ids)
      and p.ref_year = p_year and p.ref_month = p_month
      and p.data is not null
    group by p.unit_id
  ),
  nine as (
    select n.unit_id, max(extract(day from n.data)::int) dia
    from ninefood_daily_loja n
    where n.unit_id = any(p_unit_ids)
      and n.ref_year = p_year and n.ref_month = p_month
    group by n.unit_id
  ),
  -- A 99 guarda app_shop_id, não unit_id: o vínculo passa pela store_links.
  nine_api as (
    select sl.unit_id, max(extract(day from b.business_date)::int) dia
    from ninefood_api_bill b
    join ninefood_store_links sl on sl.app_shop_id = b.app_shop_id
    where sl.unit_id = any(p_unit_ids)
      and extract(year from b.business_date)::int = p_year
      and extract(month from b.business_date)::int = p_month
    group by sl.unit_id
  ),
  keeta as (
    select k.unit_id, max(extract(day from k.data)::int) dia
    from keeta_daily_loja k
    where k.unit_id = any(p_unit_ids)
      and k.ref_year = p_year and k.ref_month = p_month
    group by k.unit_id
  ),
  cw as (
    select c.unit_id, max(extract(day from c.criado_em)::int) dia
    from cardapioweb_pedidos c
    where c.unit_id = any(p_unit_ids)
      and c.ref_year = p_year and c.ref_month = p_month
      and c.status <> 'canceled'
    group by c.unit_id
  )
  select
    a.id,
    -- iFood: o mais recente entre Conciliação e Pedidos. Quem sobe só o
    -- relatório de Pedidos (sem o extrato) tem cobertura de verdade, e olhar
    -- só a Conciliação diria "sem dado".
    greatest(coalesce(i.dia, 0), coalesce(ip.dia, 0)) nullif_ifood,
    greatest(coalesce(n.dia, 0), coalesce(na.dia, 0)) nullif_nine,
    coalesce(k.dia, 0),
    coalesce(c.dia, 0)
  from alvo a
  left join ifood i on i.unit_id = a.id
  left join ifood_ped ip on ip.unit_id = a.id
  left join nine n on n.unit_id = a.id
  left join nine_api na on na.unit_id = a.id
  left join keeta k on k.unit_id = a.id
  left join cw c on c.unit_id = a.id;
$$;

comment on function public.cobertura_por_unidade(uuid[], int, int) is
  'Último dia do mês com dado, por loja e por plataforma (0 = sem dado). '
  'Denominador honesto de projeção: dia do calendário NÃO é dia com dado.';

-- Nenhum papel do PostgREST executa isto: quem chama é o service_role no
-- servidor. `revoke from public` não basta no Supabase — `authenticated` tem
-- privilégio próprio por default e precisa ser revogado explicitamente.
revoke execute on function public.cobertura_por_unidade(uuid[], int, int)
  from public, anon, authenticated;
