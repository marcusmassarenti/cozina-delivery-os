--------------------------------------------------------------------
-- 0013_cobertura_financeiro_rpc.sql
-- Pra cada (unidade, ano, mês) do Financeiro importado, conta:
--   - dias distintos com fato_gerador='Venda'
--   - primeira e última data com Venda
--
-- Usado pela tela de cobertura pra detectar quando o relatório está
-- PARCIAL (menos dias que o esperado) — sinal que falta puxar a
-- competência seguinte (iFood costuma fechar os últimos dias do mês
-- só no relatório do mês seguinte).
--------------------------------------------------------------------

create or replace function public.ifood_financeiro_cobertura(
  p_start_year integer,
  p_start_month integer,
  p_end_year integer,
  p_end_month integer
)
returns table (
  unit_id          uuid,
  ref_year         integer,
  ref_month        integer,
  dias_com_venda   integer,
  first_data       date,
  last_data        date,
  total_lancamentos bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.unit_id,
    l.ref_year,
    l.ref_month,
    count(distinct (l.data_fato_gerador::date))::integer as dias_com_venda,
    min(l.data_fato_gerador::date) as first_data,
    max(l.data_fato_gerador::date) as last_data,
    count(*) as total_lancamentos
  from public.ifood_financeiro_lancamentos l
  where l.fato_gerador = 'Venda'
    and l.data_fato_gerador is not null
    -- Range [start, end] inclusivo em year-month
    and (
      l.ref_year > p_start_year
      or (l.ref_year = p_start_year and l.ref_month >= p_start_month)
    )
    and (
      l.ref_year < p_end_year
      or (l.ref_year = p_end_year and l.ref_month <= p_end_month)
    )
  group by l.unit_id, l.ref_year, l.ref_month;
$$;

comment on function public.ifood_financeiro_cobertura is
  'Agrega Financeiro por (unit, year, month) com dias-com-Venda. Usado pela tela de cobertura.';

grant execute on function public.ifood_financeiro_cobertura(integer, integer, integer, integer)
  to anon, authenticated, service_role;
