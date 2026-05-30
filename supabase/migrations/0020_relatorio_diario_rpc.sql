--------------------------------------------------------------------
-- 0020_relatorio_diario_rpc.sql
-- Agregações SQL pra matar os fetch-all-and-aggregate-in-JS que
-- deixavam as telas lentas.
--
-- Diagnóstico (medido contra produção):
--   ifood_financeiro_lancamentos = 140.977 linhas.
--   loadIfood do Relatório Diário paginava 6.012 linhas em 7 chamadas
--   e somava em JS → ~7s POR abertura de tela.
--   getDeliveryFeeByUnits paginava iFood + keeta_pedidos (5k) + ninefood
--   sequencialmente → ~4-5s.
--
-- Aqui: 1 SELECT com SUM/COUNT FILTER + GROUP BY no Postgres por função.
-- Mesma ideia da 0012 (resumo financeiro), agora pro detalhe diário e
-- pro custo de entrega. ~50-100x mais rápido.
--------------------------------------------------------------------

-- ───────────────────────────────────────────────────────────────────
-- iFood: faturamento / pedidos / cancelados POR DIA, por unidade.
-- Usado pelo Relatório Diário (loadIfood).
-- O "dia" sai de data_fato_gerador interpretado em UTC — o iFood manda
-- meia-noite UTC representando o dia-calendário (igual ao dateStrDay do TS;
-- converter pra America/Sao_Paulo jogaria pro dia anterior).
-- ───────────────────────────────────────────────────────────────────
create or replace function public.ifood_financeiro_diario_by_units(
  p_unit_ids uuid[],
  p_year integer,
  p_month integer
)
returns table (
  unit_id     uuid,
  dia         integer,
  bruto       numeric,
  pedidos     integer,
  cancelados  integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.unit_id,
    extract(day from (l.data_fato_gerador at time zone 'UTC'))::integer as dia,

    -- Bruto: Entrada Financeira em Vendas
    coalesce(round(sum(l.valor) filter (
      where l.fato_gerador = 'Venda'
        and l.descricao_lancamento = 'Entrada Financeira'
    )::numeric, 2), 0) as bruto,

    -- Pedidos únicos do dia (entre as Vendas/Entrada Financeira)
    count(distinct l.pedido_associado_ifood) filter (
      where l.fato_gerador = 'Venda'
        and l.descricao_lancamento = 'Entrada Financeira'
        and l.pedido_associado_ifood is not null
    )::integer as pedidos,

    -- Cancelados únicos do dia (Cancelamento Total/Parcial)
    count(distinct l.pedido_associado_ifood) filter (
      where l.fato_gerador in ('Cancelamento Total', 'Cancelamento Parcial')
        and l.pedido_associado_ifood is not null
    )::integer as cancelados

  from public.ifood_financeiro_lancamentos l
  where l.unit_id = any(p_unit_ids)
    and l.ref_year = p_year
    and l.ref_month = p_month
    and l.data_fato_gerador is not null
  group by l.unit_id, extract(day from (l.data_fato_gerador at time zone 'UTC'));
$$;

comment on function public.ifood_financeiro_diario_by_units is
  'Faturamento/pedidos/cancelados por dia e unidade (iFood). Substitui o pull paginado do Relatório Diário.';

grant execute on function public.ifood_financeiro_diario_by_units(uuid[], integer, integer)
  to anon, authenticated, service_role;


-- ───────────────────────────────────────────────────────────────────
-- Custo de entrega por unidade no mês — 1 função por plataforma.
-- Cada uma retorna (unit_id, taxa) já somada. Usadas em getDeliveryFeeByUnits.
-- ───────────────────────────────────────────────────────────────────

-- iFood: lançamento "Taxa entrega iFood" (vem negativo = custo)
create or replace function public.ifood_taxa_entrega_by_units(
  p_unit_ids uuid[],
  p_year integer,
  p_month integer
)
returns table (unit_id uuid, taxa numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.unit_id,
    coalesce(round(sum(abs(l.valor))::numeric, 2), 0) as taxa
  from public.ifood_financeiro_lancamentos l
  where l.unit_id = any(p_unit_ids)
    and l.ref_year = p_year
    and l.ref_month = p_month
    and l.descricao_lancamento = 'Taxa entrega iFood'
  group by l.unit_id;
$$;

grant execute on function public.ifood_taxa_entrega_by_units(uuid[], integer, integer)
  to anon, authenticated, service_role;

-- Keeta: coluna taxa_entrega em keeta_pedidos (faixa de frete por pedido)
create or replace function public.keeta_taxa_entrega_by_units(
  p_unit_ids uuid[],
  p_year integer,
  p_month integer
)
returns table (unit_id uuid, taxa numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.unit_id,
    coalesce(round(sum(abs(coalesce(p.taxa_entrega, 0)))::numeric, 2), 0) as taxa
  from public.keeta_pedidos p
  where p.unit_id = any(p_unit_ids)
    and p.ref_year = p_year
    and p.ref_month = p_month
  group by p.unit_id;
$$;

grant execute on function public.keeta_taxa_entrega_by_units(uuid[], integer, integer)
  to anon, authenticated, service_role;

-- 99 Food: custo logístico + frete grátis bancado pela loja (ninefood_pedidos)
create or replace function public.ninefood_custo_entrega_by_units(
  p_unit_ids uuid[],
  p_year integer,
  p_month integer
)
returns table (unit_id uuid, taxa numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.unit_id,
    coalesce(round(sum(
      abs(coalesce(p.custos_logisticos, 0)) +
      abs(coalesce(p.custo_loja_oferta_entrega_gratis, 0))
    )::numeric, 2), 0) as taxa
  from public.ninefood_pedidos p
  where p.unit_id = any(p_unit_ids)
    and p.ref_year = p_year
    and p.ref_month = p_month
  group by p.unit_id;
$$;

grant execute on function public.ninefood_custo_entrega_by_units(uuid[], integer, integer)
  to anon, authenticated, service_role;
