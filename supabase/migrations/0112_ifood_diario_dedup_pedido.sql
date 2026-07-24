-- Corrige a contagem em dobro no bruto DIÁRIO do iFood.
--
-- Sintoma: o Relatório Diário mostrava um bruto maior que o resto do sistema.
-- Na JK (jul/2026) eram R$ 686,82 a mais.
--
-- Causa: a função somava TODAS as linhas de "Venda / Entrada Financeira", e um
-- mesmo pedido às vezes tem mais de uma (ajuste, reprocessamento). A JK tinha
-- 2.128 linhas para 2.120 pedidos — as 8 linhas extras viravam receita
-- inexistente. A função MENSAL (ifood_financeiro_resumo_by_units) já fazia
-- certo: uma cesta por pedido, via max(valor_cesta_final).
--
-- Correção: dedupe por (unidade, dia, pedido) antes de somar, igual à mensal.
-- Linha sem pedido associado é somada à parte (não dá pra deduplicar, e
-- descartá-la perderia receita real).
--
-- Mantido de propósito: os pedidos CANCELADOS continuam dentro do bruto — essa
-- é a régua do portal, a mesma que dashboard, unidade, DRE e Nino usam.

create or replace function public.ifood_financeiro_diario_by_units(
  p_unit_ids uuid[],
  p_year integer,
  p_month integer
)
returns table(unit_id uuid, dia integer, bruto numeric, pedidos integer, cancelados integer)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with venda as (
    select
      l.unit_id,
      extract(day from (l.data_fato_gerador at time zone 'UTC'))::integer as dia,
      l.pedido_associado_ifood as pedido,
      coalesce(l.valor_cesta_final, l.valor) as cesta
    from public.ifood_financeiro_lancamentos l
    where l.unit_id = any(p_unit_ids)
      and l.ref_year = p_year
      and l.ref_month = p_month
      and l.data_fato_gerador is not null
      and l.fato_gerador = 'Venda'
      and l.descricao_lancamento = 'Entrada Financeira'
  ),
  -- UMA cesta por pedido no dia (o pedido pode ter várias linhas).
  por_pedido as (
    select unit_id, dia, max(cesta) as cesta
    from venda
    where pedido is not null
    group by unit_id, dia, pedido
  ),
  -- Linhas sem pedido associado: não há como deduplicar, entram somadas.
  sem_pedido as (
    select unit_id, dia, sum(cesta) as cesta
    from venda
    where pedido is null
    group by unit_id, dia
  ),
  bruto_dia as (
    select unit_id, dia, sum(cesta) as bruto
    from (
      select unit_id, dia, cesta from por_pedido
      union all
      select unit_id, dia, cesta from sem_pedido
    ) t
    group by unit_id, dia
  ),
  contagem as (
    select
      l.unit_id,
      extract(day from (l.data_fato_gerador at time zone 'UTC'))::integer as dia,
      count(distinct l.pedido_associado_ifood) filter (
        where l.fato_gerador = 'Venda'
          and l.descricao_lancamento = 'Entrada Financeira'
          and l.pedido_associado_ifood is not null
      )::integer as pedidos,
      count(distinct l.pedido_associado_ifood) filter (
        where l.fato_gerador in ('Cancelamento Total', 'Cancelamento Parcial')
          and l.pedido_associado_ifood is not null
      )::integer as cancelados
    from public.ifood_financeiro_lancamentos l
    where l.unit_id = any(p_unit_ids)
      and l.ref_year = p_year
      and l.ref_month = p_month
      and l.data_fato_gerador is not null
    group by l.unit_id, extract(day from (l.data_fato_gerador at time zone 'UTC'))
  )
  select
    c.unit_id,
    c.dia,
    coalesce(round(b.bruto::numeric, 2), 0) as bruto,
    c.pedidos,
    c.cancelados
  from contagem c
  left join bruto_dia b on b.unit_id = c.unit_id and b.dia = c.dia;
$function$;
