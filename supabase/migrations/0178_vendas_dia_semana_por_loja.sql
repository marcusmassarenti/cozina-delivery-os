-- Mesma coisa da `vendas_por_dia_semana`, mas quebrada POR LOJA.
--
-- Existe pro relatório da rede: o agregado responde "qual dia a rede vende
-- menos", e isso costuma ser padrão de mercado. A pergunta que vale dinheiro
-- é outra — QUAL LOJA foge do padrão. Se todo mundo pica na sexta e uma cai,
-- não é mercado: é operação daquela loja (fechou, faltou gente, sem
-- entregador). Só comparando loja a loja isso aparece.
--
-- Chamar a função agregada N vezes resolveria, e é exatamente o padrão de
-- "baixa linha crua e soma em JS" que já custou performance neste projeto.

create or replace function public.vendas_dia_semana_por_loja(
  p_unit_ids uuid[],
  p_start date,
  p_end date
)
returns table(unit_id uuid, dia_semana integer, pedidos bigint, valor numeric)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ifood as (
    select
      l.unit_id,
      extract(dow from l.data_fato_gerador)::integer as dow,
      count(distinct l.pedido_associado_ifood) as pedidos,
      coalesce(sum(l.valor_cesta_final), 0) as valor
    from (
      -- Uma linha por pedido: o extrato tem N lançamentos por pedido, e somar
      -- direto multiplicaria a venda pelo número de taxas.
      select distinct on (v.unit_id, v.pedido_associado_ifood)
        v.unit_id, v.pedido_associado_ifood, v.data_fato_gerador,
        v.valor_cesta_final
      from public.ifood_financeiro_lancamentos v
      where v.unit_id = any(p_unit_ids)
        and v.fato_gerador = 'Venda'
        and v.pedido_associado_ifood is not null
        and v.valor_cesta_final is not null
        and v.data_fato_gerador::date between p_start and p_end
    ) l
    group by 1, 2
  ),
  cw as (
    select
      c.unit_id,
      extract(dow from c.criado_em)::integer as dow,
      count(*) as pedidos,
      coalesce(sum(c.total), 0) as valor
    from public.cardapioweb_pedidos c
    where c.unit_id = any(p_unit_ids)
      and c.status <> 'canceled'
      and c.criado_em::date between p_start and p_end
    group by 1, 2
  ),
  juntos as (
    select unit_id, dow, pedidos, valor from ifood
    union all
    select unit_id, dow, pedidos, valor from cw
  )
  select j.unit_id, j.dow, sum(j.pedidos)::bigint, round(sum(j.valor)::numeric, 2)
  from juntos j group by j.unit_id, j.dow order by j.unit_id, j.dow;
$function$;

revoke execute on function public.vendas_dia_semana_por_loja(uuid[], date, date) from public, anon;
grant execute on function public.vendas_dia_semana_por_loja(uuid[], date, date) to authenticated, service_role;
