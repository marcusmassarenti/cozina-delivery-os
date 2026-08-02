-- Conferência entre as DUAS fontes do mesmo pedido.
--
-- iFood e 99 Food chegam por dois caminhos independentes: a planilha que o
-- cliente sobe e a API que puxamos sozinhos. Elas nunca foram comparadas — e
-- quando a comparação foi feita à mão, uma vez, achou dois dias inteiros
-- faltando no arquivo do cliente (registrado em 0114: 2.832 pedidos na API
-- contra 2.579 na planilha).
--
-- A conta é feita AQUI, não no Node: são ~100 mil linhas por mês na rede toda
-- só para virar uma contagem por dia. Trafegar isso pra somar em memória é o
-- mesmo erro que fazia o Fluxo de Caixa puxar 116 mil linhas.
--
-- Granularidade POR DIA de propósito. O total do mês esconde o caso que mais
-- acontece: o cliente baixa o arquivo antes de o mês fechar, e faltam os
-- últimos dias. No total isso é "uns 8% a menos"; por dia é "faltam 29 e 30".

create or replace function public.conferencia_fontes_por_dia(
  p_year int,
  p_month int,
  p_unit_ids uuid[] default null
)
returns table (
  unit_id uuid,
  plataforma text,
  dia date,
  pedidos_api int,
  pedidos_planilha int,
  valor_api numeric,
  valor_planilha numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ifood_api as (
    -- Financial Events. Um pedido pode ter vários eventos; conta distinto.
    select p.unit_id, p.data as dia,
           count(distinct p.pedido_id)::int pedidos,
           coalesce(sum(p.valor_itens), 0) valor
    from ifood_pedidos p
    where p.ref_year = p_year and p.ref_month = p_month
      and p.source = 'api'
      and (p_unit_ids is null or p.unit_id = any(p_unit_ids))
    group by 1, 2
  ),
  ifood_planilha as (
    -- Conciliação. `valor_cesta_final` se repete em cada linha do mesmo
    -- pedido (venda, comissão, taxa...), então pega UMA por pedido antes de
    -- somar — senão a cesta é contada tantas vezes quantas forem as taxas.
    select unit_id, dia, count(*)::int pedidos, coalesce(sum(cesta), 0) valor
    from (
      select l.unit_id,
             l.data_fato_gerador::date as dia,
             l.pedido_associado_ifood,
             max(l.valor_cesta_final) cesta
      from ifood_financeiro_lancamentos l
      where l.ref_year = p_year and l.ref_month = p_month
        and l.fato_gerador = 'Venda'
        and l.pedido_associado_ifood is not null
        and (p_unit_ids is null or l.unit_id = any(p_unit_ids))
      group by 1, 2, 3
    ) s
    group by 1, 2
  ),
  nine_api as (
    select n.unit_id, b.business_date as dia,
           count(distinct b.order_id)::int pedidos,
           coalesce(sum(b.meal_original_amount), 0) valor
    from ninefood_api_bill b
    join ninefood_store_links n on n.app_shop_id = b.app_shop_id
    where b.business_date >= make_date(p_year, p_month, 1)
      and b.business_date < (make_date(p_year, p_month, 1) + interval '1 month')
      and b.order_type = 1  -- 1 = receita; 2 = reembolso
      and (p_unit_ids is null or n.unit_id = any(p_unit_ids))
    group by 1, 2
  ),
  nine_planilha as (
    select p.unit_id, p.data as dia,
           count(distinct p.pedido_id)::int pedidos,
           coalesce(sum(p.receita_vendas), 0) valor
    from ninefood_pedidos p
    where p.ref_year = p_year and p.ref_month = p_month
      and (p_unit_ids is null or p.unit_id = any(p_unit_ids))
    group by 1, 2
  ),
  -- FULL JOIN é o ponto todo: dia que existe só de um lado tem que aparecer
  -- com zero do outro. Com INNER JOIN o dia faltante simplesmente sumiria da
  -- conferência — o defeito ficaria invisível justamente na hora de detectá-lo.
  ifood as (
    select coalesce(a.unit_id, p.unit_id) unit_id,
           'ifood'::text plataforma,
           coalesce(a.dia, p.dia) dia,
           coalesce(a.pedidos, 0) pedidos_api,
           coalesce(p.pedidos, 0) pedidos_planilha,
           coalesce(a.valor, 0) valor_api,
           coalesce(p.valor, 0) valor_planilha
    from ifood_api a
    full join ifood_planilha p on p.unit_id = a.unit_id and p.dia = a.dia
  ),
  nine as (
    select coalesce(a.unit_id, p.unit_id) unit_id,
           '99food'::text plataforma,
           coalesce(a.dia, p.dia) dia,
           coalesce(a.pedidos, 0) pedidos_api,
           coalesce(p.pedidos, 0) pedidos_planilha,
           coalesce(a.valor, 0) valor_api,
           coalesce(p.valor, 0) valor_planilha
    from nine_api a
    full join nine_planilha p on p.unit_id = a.unit_id and p.dia = a.dia
  )
  select * from ifood
  union all
  select * from nine
$function$;

comment on function public.conferencia_fontes_por_dia is
  'Compara, por loja e por dia, o que a API traz contra o que a planilha traz (iFood e 99 Food). Devolve os dois lados crus — quem decide o que é divergência é a aplicação.';
