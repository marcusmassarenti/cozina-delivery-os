-- Frete da ENTREGA PRÓPRIA por loja/mês — o pedaço do "Valor das vendas" do
-- portal que o extrato não tem.
--
-- POR QUE (Varginha, 31/08/26). O portal do iFood usa DUAS réguas de
-- faturamento, provadas por print nas duas telas:
--   • Entrega parceira (JK): "Valor das vendas" = só os itens. A taxa de
--     entrega é do iFood e fica em "Valores complementares — apenas
--     informativos, não considerados no cálculo".
--   • Entrega própria (Varginha): a linha se chama "Valor dos itens E
--     ENTREGA PRÓPRIA DA LOJA" — o frete é receita da loja e ENTRA no total
--     (R$ 19.266,98 na tela vs R$ 17.021,57 da nossa cesta).
--
-- O extrato financeiro não traz o frete próprio como linha (ele está diluído
-- na Entrada Financeira; a derivação por resíduo foi medida e é suja — 34
-- pedidos negativos em 267). A fonte limpa é a API de pedidos:
-- `ifood_pedidos.taxa_entrega_cliente` + `produto_logistico` por pedido.
-- Cobertura medida em ago/26: 40 das 41 lojas de entrega própria, 38 com
-- ≥90% dos pedidos do extrato, R$ 17.276,40/mês na rede.
--
-- Só entra o frete de produto logístico de ENTREGA PRÓPRIA. "Entrega
-- iFood"/"PARCEIRA" ficam fora (o portal também deixa). "ENTREGA FLEX"
-- (R$ 660/mês) fica FORA por ora — não está provado de quem é a receita.
-- Pedido cancelado explícito fica fora, coerente com a cesta.
create or replace function public.ifood_frete_proprio_by_units(
  p_unit_ids uuid[],
  p_year integer,
  p_month integer,
  p_start_date date default null,
  p_end_date date default null
)
returns table(unit_id uuid, frete numeric)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    p.unit_id,
    coalesce(round(sum(p.taxa_entrega_cliente)::numeric, 2), 0) as frete
  from public.ifood_pedidos p
  where p.unit_id = any(p_unit_ids)
    and p.ref_year = p_year
    and p.ref_month = p_month
    and p.produto_logistico in
      ('ENTREGA PROPRIA', 'Entrega própria', 'SELF_DELIVERY_PARTIAL_AREA')
    and coalesce(p.taxa_entrega_cliente, 0) > 0
    and (p.status_final is null or p.status_final not ilike '%cancel%')
    and (p_start_date is null or p.data >= p_start_date)
    and (p_end_date is null or p.data <= p_end_date)
  group by p.unit_id;
$function$;

-- Só o servidor chama (admin client). Sem grant pro anon nem authenticated —
-- security definer aberto é o P0 que já voltou 2x (0083/0151).
revoke all on function public.ifood_frete_proprio_by_units(uuid[], integer, integer, date, date) from public, anon, authenticated;
grant execute on function public.ifood_frete_proprio_by_units(uuid[], integer, integer, date, date) to service_role;
