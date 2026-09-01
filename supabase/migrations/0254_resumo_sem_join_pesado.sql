-- A 0248 deixou a RPC do resumo LENTA e derrubou a landing.
--
-- O que aconteceu: pra tirar as taxas de pedido cancelado, a 0248 pendurou
-- um `left join cancelados` POR LINHA no scan principal (200k+ linhas quando
-- a chamada é a rede inteira). A landing recalcula com ~120 lojas de uma vez
-- e passou a estourar o statement_timeout de 8s do Supabase (que o
-- service_role NÃO sobrescreve) — o recálculo de 01/09 falhou calado e a
-- landing congelou no snapshot de 31/08.
--
-- O conserto mantém a MESMA matemática com outra forma: o scan principal
-- volta a ser o da 0239 (sem join), e o desconto das taxas de cancelado vira
-- uma CTE à parte que só varre as linhas das DUAS descrições de taxa
-- (~16k+40k linhas/mês na rede, não 200k+) contra a lista de cancelados —
-- e entra por LEFT JOIN agregado por unidade no select final.
create or replace function public.ifood_financeiro_resumo_by_units(
  p_unit_ids uuid[],
  p_year integer,
  p_month integer,
  p_start_date date default null,
  p_end_date date default null
)
returns table(
  unit_id uuid, pedidos_unicos integer, bruto numeric, comissao_ifood numeric,
  taxa_entrega numeric, taxa_transacao numeric, taxa_servico_cliente numeric,
  promocao_loja numeric, promocao_ifood numeric, pacote_anuncios numeric,
  ressarcimentos numeric, cancelamento_total_qtd integer, cancelamento_parcial_qtd integer,
  perda_cancelamento numeric, liquido numeric, recebido_direto numeric,
  mensalidade numeric, promocao_loja_estorno numeric, antecipacao numeric
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with cancelados as (
    select distinct ct.unit_id, ct.pedido_associado_ifood
    from public.ifood_financeiro_lancamentos ct
    where ct.unit_id = any(p_unit_ids) and ct.ref_year = p_year and ct.ref_month = p_month
      and ct.fato_gerador = 'Cancelamento Total' and ct.pedido_associado_ifood is not null
      and (p_start_date is null or ct.data_fato_gerador::date >= p_start_date)
      and (p_end_date is null or ct.data_fato_gerador::date <= p_end_date)
  ),
  vendas_cesta as (
    select v.unit_id, v.pedido_associado_ifood, max(v.valor_cesta_final) as cesta
    from public.ifood_financeiro_lancamentos v
    left join cancelados c on c.unit_id = v.unit_id
      and c.pedido_associado_ifood = v.pedido_associado_ifood
    where v.unit_id = any(p_unit_ids) and v.ref_year = p_year and v.ref_month = p_month
      and v.fato_gerador = 'Venda' and v.pedido_associado_ifood is not null
      and v.valor_cesta_final is not null
      and (p_start_date is null or v.data_fato_gerador::date >= p_start_date)
      and (p_end_date is null or v.data_fato_gerador::date <= p_end_date)
      and c.unit_id is null
    group by v.unit_id, v.pedido_associado_ifood
  ),
  bruto_por_unit as (
    select vc.unit_id, coalesce(round(sum(vc.cesta)::numeric, 2), 0) as bruto
    from vendas_cesta vc group by vc.unit_id
  ),
  -- Taxas (entrega/serviço) presas a pedido TOTALMENTE cancelado — o iFood
  -- estorna ao centavo, então elas não podem contar (regra da 0248). Scan
  -- pequeno: só as linhas das duas descrições, semi-join com cancelados.
  taxas_cancel as (
    select t.unit_id,
      coalesce(round(sum(t.valor) filter (
        where t.descricao_lancamento = 'Taxa entrega iFood')::numeric, 2), 0) as entrega,
      coalesce(round(sum(t.valor) filter (
        where t.descricao_lancamento = 'Taxa de serviço iFood cobrada do cliente')::numeric, 2), 0) as servico
    from public.ifood_financeiro_lancamentos t
    join cancelados c on c.unit_id = t.unit_id
      and c.pedido_associado_ifood = t.pedido_associado_ifood
    where t.unit_id = any(p_unit_ids) and t.ref_year = p_year and t.ref_month = p_month
      and t.fato_gerador = 'Venda'
      and t.descricao_lancamento in ('Taxa entrega iFood', 'Taxa de serviço iFood cobrada do cliente')
      and (p_start_date is null or t.data_fato_gerador::date >= p_start_date)
      and (p_end_date is null or t.data_fato_gerador::date <= p_end_date)
    group by t.unit_id
  )
  select
    l.unit_id,
    count(distinct l.pedido_associado_ifood) filter (
      where l.fato_gerador in ('Venda','Cancelamento Total','Cancelamento Parcial')
        and l.pedido_associado_ifood is not null)::integer,
    coalesce(b.bruto, 0),
    coalesce(round(sum(l.valor) filter (where l.fato_gerador = 'Venda'
      and (l.descricao_lancamento like 'Comissão do iFood%'
        or l.descricao_lancamento like 'Comissão iFood%'))::numeric, 2), 0),
    coalesce(round(sum(l.valor) filter (where l.fato_gerador = 'Venda'
      and l.descricao_lancamento = 'Taxa entrega iFood')::numeric, 2), 0)
      - coalesce(tc.entrega, 0),
    coalesce(round(sum(l.valor) filter (where l.fato_gerador = 'Venda'
      and l.descricao_lancamento in ('Taxa de transação','Taxa de transação iFood beneficios'))::numeric, 2), 0),
    coalesce(round(sum(l.valor) filter (where l.fato_gerador = 'Venda'
      and l.descricao_lancamento = 'Taxa de serviço iFood cobrada do cliente')::numeric, 2), 0)
      - coalesce(tc.servico, 0),
    coalesce(round(sum(l.valor) filter (where l.fato_gerador = 'Venda'
      and l.descricao_lancamento in ('Promoção custeada pela loja','Promoção custeada pela loja no delivery'))::numeric, 2), 0),
    coalesce(round(sum(l.valor) filter (where l.fato_gerador = 'Venda'
      and l.descricao_lancamento = 'Promoção custeada pelo iFood')::numeric, 2), 0),
    coalesce(round(sum(l.valor) filter (where l.descricao_lancamento = 'Pacote de anúncios')::numeric, 2), 0),
    coalesce(round(sum(l.valor) filter (where l.descricao_lancamento = 'Ressarcimento de pedido cancelado')::numeric, 2), 0),
    count(distinct l.pedido_associado_ifood) filter (
      where l.fato_gerador = 'Cancelamento Total' and l.pedido_associado_ifood is not null)::integer,
    count(distinct l.pedido_associado_ifood) filter (
      where l.fato_gerador = 'Cancelamento Parcial' and l.pedido_associado_ifood is not null)::integer,
    coalesce(round(sum(l.valor) filter (where l.fato_gerador = 'Cancelamento Total'
      and l.impacto_no_repasse = true)::numeric, 2), 0),
    coalesce(round(sum(l.valor) filter (where l.impacto_no_repasse = true)::numeric, 2), 0),
    coalesce(round(sum(l.valor) filter (where l.descricao_lancamento = 'Entrada Financeira'
      and l.impacto_no_repasse = false)::numeric, 2), 0),
    coalesce(round(sum(l.valor) filter (where l.descricao_lancamento = 'Mensalidade')::numeric, 2), 0),
    coalesce(round(sum(l.valor) filter (where l.fato_gerador <> 'Venda'
      and l.descricao_lancamento in ('Promoção custeada pela loja','Promoção custeada pela loja no delivery'))::numeric, 2), 0),
    coalesce(round(sum(l.valor) filter (
      where l.impacto_no_repasse = true
        and (l.fato_gerador ilike '%anticipation%'
          or l.descricao_lancamento ilike '%ANTICIPATION%'))::numeric, 2), 0)
  from public.ifood_financeiro_lancamentos l
  left join bruto_por_unit b on b.unit_id = l.unit_id
  left join taxas_cancel tc on tc.unit_id = l.unit_id
  where l.unit_id = any(p_unit_ids) and l.ref_year = p_year and l.ref_month = p_month
    and (p_start_date is null or l.data_fato_gerador::date >= p_start_date)
    and (p_end_date is null or l.data_fato_gerador::date <= p_end_date)
  group by l.unit_id, b.bruto, tc.entrega, tc.servico;
$function$;
