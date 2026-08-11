-- Faturamento e pedidos por DIA DA SEMANA, no período.
--
-- Responde "qual dia vende menos", que é decisão de escala e de promoção. O
-- sistema só tinha série mensal — dentro do mês, o dia da semana some. Medido
-- na rede em jul/26: R$ 298 mil numa sexta contra R$ 197 mil numa terça, 34%
-- de diferença que não aparecia em lugar nenhum.
--
-- ⚠️ SÓ iFood e Cardápio Web. `ninefood_pedidos` e `keeta_pedidos` guardam a
-- data mas NÃO o valor do pedido, então não dá pra somar faturamento delas
-- sem inventar. A tela diz quais plataformas entraram — melhor um número
-- honesto e rotulado do que um total que parece completo e não é.
--
-- `dow` do Postgres é 0=domingo. A tela reordena pra segunda, que é como se
-- lê uma semana de operação.

create or replace function public.vendas_por_dia_semana(
  p_unit_ids uuid[],
  p_start date,
  p_end date
)
returns table(dia_semana integer, pedidos bigint, valor numeric)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with ifood as (
    select
      extract(dow from l.data_fato_gerador)::integer as dow,
      count(distinct l.pedido_associado_ifood) as pedidos,
      coalesce(sum(l.valor_cesta_final), 0) as valor
    from (
      -- Uma linha por pedido: o extrato tem N lançamentos por pedido, e somar
      -- `valor_cesta_final` direto multiplicaria a venda pelo nº de taxas.
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
    group by 1
  ),
  cw as (
    select
      extract(dow from c.criado_em)::integer as dow,
      count(*) as pedidos,
      coalesce(sum(c.total), 0) as valor
    from public.cardapioweb_pedidos c
    where c.unit_id = any(p_unit_ids)
      and c.status <> 'canceled'
      and c.criado_em::date between p_start and p_end
    group by 1
  ),
  juntos as (
    select dow, pedidos, valor from ifood
    union all
    select dow, pedidos, valor from cw
  )
  select j.dow, sum(j.pedidos)::bigint, round(sum(j.valor)::numeric, 2)
  from juntos j group by j.dow order by j.dow;
$function$;

revoke execute on function public.vendas_por_dia_semana(uuid[], date, date) from public, anon;
grant execute on function public.vendas_por_dia_semana(uuid[], date, date) to authenticated, service_role;
