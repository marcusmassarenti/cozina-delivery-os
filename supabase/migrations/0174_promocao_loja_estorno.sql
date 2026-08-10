-- Promoção da loja: devolver o ESTORNO separado, pra tela bater com o portal.
--
-- POR QUE: o card mostrava R$ 4.492,81 onde o iFood mostrava R$ 4.459,83
-- (Pátria Pizza Matão, jun/26). Nenhum dos dois está errado — são réguas
-- diferentes. O RPC soma a promoção dos pedidos com `fato_gerador = 'Venda'`
-- (o custo dos pedidos que aconteceram) e joga a devolução dos cancelados em
-- `perda_cancelamento`, junto com estorno de comissão, de taxa e da venda. O
-- portal do iFood mostra o líquido. Auditado em 10/08/26: o `liquido` do RPC
-- bate na vírgula com a soma direta do extrato — não havia erro de dinheiro,
-- só de apresentação.
--
-- O QUE MUDA: um campo NOVO no fim, `promocao_loja_estorno`. Os 17 anteriores
-- ficam byte a byte iguais — DRE, dashboard e resultado leem por nome e não
-- enxergam diferença. Com ele a tela mostra bruta / devolvida / líquida, e a
-- líquida é a que o lojista encontra no portal.
--
-- `fato_gerador <> 'Venda'` em vez de `= 'Cancelamento Total'`: hoje todo o
-- estorno de promoção medido em 2026 é Cancelamento Total (2.924 linhas,
-- R$ 18.250,42), mas se o iFood criar outro evento de devolução amanhã, ele
-- entra sozinho em vez de sumir em silêncio.
--
-- ⚠️ Acrescentar coluna a um RETURNS TABLE exige DROP — o CREATE OR REPLACE
-- recusa mudança de tipo de retorno. E DROP APAGA OS GRANTS: por isso o revoke
-- e o grant no fim reproduzem exatamente o estado medido antes (anon: não,
-- authenticated: sim, service_role: sim). Função `security definer` que nasce
-- aberta pro anônimo é o P0 que já voltou duas vezes neste projeto (jul e
-- ago/26, migrations 0083 e 0151).

drop function if exists public.ifood_financeiro_resumo_by_units(uuid[], integer, integer, date, date);

create function public.ifood_financeiro_resumo_by_units(
  p_unit_ids uuid[],
  p_year integer,
  p_month integer,
  p_start_date date default null,
  p_end_date date default null
)
returns table(
  unit_id uuid,
  pedidos_unicos integer,
  bruto numeric,
  comissao_ifood numeric,
  taxa_entrega numeric,
  taxa_transacao numeric,
  taxa_servico_cliente numeric,
  promocao_loja numeric,
  promocao_ifood numeric,
  pacote_anuncios numeric,
  ressarcimentos numeric,
  cancelamento_total_qtd integer,
  cancelamento_parcial_qtd integer,
  perda_cancelamento numeric,
  liquido numeric,
  recebido_direto numeric,
  mensalidade numeric,
  promocao_loja_estorno numeric
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
      and l.descricao_lancamento = 'Taxa entrega iFood')::numeric, 2), 0),
    coalesce(round(sum(l.valor) filter (where l.fato_gerador = 'Venda'
      and l.descricao_lancamento in ('Taxa de transação','Taxa de transação iFood beneficios'))::numeric, 2), 0),
    coalesce(round(sum(l.valor) filter (where l.fato_gerador = 'Venda'
      and l.descricao_lancamento = 'Taxa de serviço iFood cobrada do cliente')::numeric, 2), 0),
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
      and l.descricao_lancamento in ('Promoção custeada pela loja','Promoção custeada pela loja no delivery'))::numeric, 2), 0)
  from public.ifood_financeiro_lancamentos l
  left join bruto_por_unit b on b.unit_id = l.unit_id
  where l.unit_id = any(p_unit_ids) and l.ref_year = p_year and l.ref_month = p_month
    and (p_start_date is null or l.data_fato_gerador::date >= p_start_date)
    and (p_end_date is null or l.data_fato_gerador::date <= p_end_date)
  group by l.unit_id, b.bruto;
$function$;

revoke execute on function public.ifood_financeiro_resumo_by_units(uuid[], integer, integer, date, date) from public, anon;
grant execute on function public.ifood_financeiro_resumo_by_units(uuid[], integer, integer, date, date) to authenticated, service_role;
