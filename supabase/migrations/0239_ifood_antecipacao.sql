-- Antecipação: devolver o débito do adiantamento como campo próprio.
--
-- POR QUE (Marcus, 26/08/26). A Churras Popular — Itaim aparecia ficando com
-- 1,9% do que vendia em ago/26 (R$ 595,41 de R$ 31.200,35), contra 47,4% da
-- Santana e 56,8% do Jardins no mesmo mês parcial.
--
-- Não era erro de importação. O `liquido` daqui é, literalmente,
-- `sum(valor) where impacto_no_repasse = true` — ou seja, QUANTO O IFOOD
-- TRANSFERIU, não quanto sobrou da venda. Pra loja que não antecipa os dois
-- coincidem. Essa antecipa: recebe em D+1 e o iFood desconta o valor do
-- repasse normal, com `impacto_no_repasse = true` (o que está certo, porque
-- impacta mesmo a transferência). Só que esse dinheiro NÃO é custo — ele já
-- entrou na conta da loja um dia depois de cada pedido.
--
-- Medido: jul/26 R$ 8.828,67 e ago/26 R$ 15.305,04 de débito de antecipação.
-- Somando de volta, a loja vai a 42,6% e 51,0% — exatamente a faixa das irmãs.
--
-- Começou em julho porque ela TROCOU DE MODALIDADE: `ifood_antecipacoes` (a
-- antecipação em lote, de outro endpoint) tem jan a jun e zera em jul. A
-- modalidade antiga não deixava débito no extrato; a D+1 automática deixa.
-- Hoje é a única loja da base com esses lançamentos.
--
-- ⚠️ POR QUE UM CAMPO NOVO, E NÃO TIRAR DO `liquido`.
-- O reflexo seria excluir a antecipação do líquido. Isso consertaria a margem
-- e QUEBRARIA O CAIXA: `src/lib/data/fluxo-caixa.ts` usa o mesmo campo pra "a
-- receber", e ali o débito TEM que descontar — o dinheiro já veio. São duas
-- perguntas diferentes no mesmo número:
--
--   quanto sobrou da venda   → margem, DRE, "% que fica na loja" → sem
--   quanto ainda vou receber → fluxo de caixa                    → com
--
-- Com o campo separado, `liquido` não muda de significado pra ninguém (a RPC é
-- lida por 10 arquivos) e quem calcula margem soma `antecipacao` de volta.
--
-- ⚠️ Acrescentar coluna a um RETURNS TABLE exige DROP — CREATE OR REPLACE
-- recusa mudança de tipo de retorno. E DROP APAGA OS GRANTS: o revoke e o
-- grant no fim reproduzem o estado de antes (anon: não, authenticated: sim,
-- service_role: sim). Função `security definer` aberta pro anônimo é o P0 que
-- já voltou duas vezes neste projeto (migrations 0083 e 0151).

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
  promocao_loja_estorno numeric,
  antecipacao numeric
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
      and l.descricao_lancamento in ('Promoção custeada pela loja','Promoção custeada pela loja no delivery'))::numeric, 2), 0),
    -- ANTECIPAÇÃO: o débito do adiantamento, já contido no `liquido` acima.
    -- `ilike '%anticipation%'` e não uma lista fixa: o iFood usou DOIS nomes
    -- pro mesmo evento em dois meses seguidos ('d1-anticipation:debit' em
    -- julho, 'ANTICIPATION_PROCESSED' em agosto). Lista fixa deixaria o
    -- terceiro nome passar em silêncio — e o sintoma é justamente silencioso.
    coalesce(round(sum(l.valor) filter (
      where l.impacto_no_repasse = true
        and (l.fato_gerador ilike '%anticipation%'
          or l.descricao_lancamento ilike '%ANTICIPATION%'))::numeric, 2), 0)
  from public.ifood_financeiro_lancamentos l
  left join bruto_por_unit b on b.unit_id = l.unit_id
  where l.unit_id = any(p_unit_ids) and l.ref_year = p_year and l.ref_month = p_month
    and (p_start_date is null or l.data_fato_gerador::date >= p_start_date)
    and (p_end_date is null or l.data_fato_gerador::date <= p_end_date)
  group by l.unit_id, b.bruto;
$function$;

revoke execute on function public.ifood_financeiro_resumo_by_units(uuid[], integer, integer, date, date) from public, anon, authenticated;
grant execute on function public.ifood_financeiro_resumo_by_units(uuid[], integer, integer, date, date) to authenticated, service_role;
