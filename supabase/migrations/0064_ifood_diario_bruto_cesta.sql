-- Bruto do iFood na matriz diária = valor_cesta_final (GMV/cesta), não o `valor`
-- da linha "Entrada Financeira" (que já vem líquido das promoções custeadas pela
-- loja e subestimava o faturamento — rede maio −9,6%, lojas promocionais até −24%).
-- Alinha Relatório Diário / ticket médio / acompanhamento / plataformas ao DRE
-- (que já usa a cesta e bate com o Portal). A cesta está na própria linha
-- Entrada Financeira (1 por pedido); fallback pro `valor` só se não importada.
CREATE OR REPLACE FUNCTION public.ifood_financeiro_diario_by_units(p_unit_ids uuid[], p_year integer, p_month integer)
 RETURNS TABLE(unit_id uuid, dia integer, bruto numeric, pedidos integer, cancelados integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    l.unit_id,
    extract(day from (l.data_fato_gerador at time zone 'UTC'))::integer as dia,

    -- Bruto: valor_cesta_final (GMV/cesta) das linhas Venda/Entrada Financeira.
    coalesce(round(sum(coalesce(l.valor_cesta_final, l.valor)) filter (
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
$function$;
