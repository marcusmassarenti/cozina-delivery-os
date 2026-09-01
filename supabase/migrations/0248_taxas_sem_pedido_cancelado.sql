-- Taxa de entrega e de serviço não podem contar pedido que foi cancelado.
--
-- POR QUE (auditoria de 31/08/26, a pedido do Marcus: "os números são 100%
-- verídicos?"). A RPC tem uma ASSIMETRIA: `bruto` já exclui o pedido com
-- Cancelamento Total (CTE `vendas_cesta` ... `and c.unit_id is null`), mas
-- `taxa_entrega` e `taxa_servico_cliente` somam TODA linha de `fato_gerador =
-- 'Venda'`, inclusive as dos pedidos que caíram.
--
-- Isso não incomodava enquanto as taxas eram só custo. Passou a incomodar em
-- 31/08/26, quando o bruto virou a régua do portal — itens + entrega +
-- serviço (ver src/lib/ifood-bruto.ts). A partir dali a assimetria vira
-- RECEITA FANTASMA: 619 pedidos cancelados em ago/26 injetavam R$ 2.467,26 de
-- entrega e R$ 632,15 de serviço num faturamento cuja venda foi excluída.
--
-- MEDIDO NO PEDIDO, não deduzido: o cancelamento estorna cada linha ao
-- centavo. Um pedido real de ago/26 tem, no mesmo par:
--
--   Venda                'Taxa entrega iFood'   -8,99   |  Cancelamento  +8,99
--   Venda                'Taxa de serviço...'   -0,99   |  Cancelamento  +0,99
--   Venda                'Taxa de transação'    -1,46   |  Cancelamento  +1,46
--   Venda                'Comissão do iFood'   -10,51   |  Cancelamento +10,51
--
-- A loja não paga nada num pedido cancelado. Então a correção conserta DOIS
-- números de uma vez: o bruto para de inflar E o KPI "Custo de entrega" para
-- de cobrar frete que foi devolvido (R$ 155,7 mil -> R$ 148,8 mil em ago/26).
--
-- ⚠️ POR QUE NÃO CORRIJO AS OUTRAS QUATRO COLUNAS
-- `comissao_ifood` (R$ -5.307,25), `promocao_loja` (R$ -3.758,54),
-- `promocao_ifood` (R$ +5.931,65) e `taxa_transacao` (R$ -907,14) carregam o
-- mesmo fantasma. Ficaram de fora de propósito:
--
--   `promocao_loja` NÃO PODE mudar. A migration 0174 criou
--   `promocao_loja_estorno` (as linhas de promoção com fato_gerador <> 'Venda')
--   exatamente pra somar com ela e bater com o portal, que mostra a promoção
--   LÍQUIDA. Tirar o cancelado daqui faria o estorno descontar DUAS VEZES e
--   quebraria uma conciliação que hoje funciona.
--
--   As outras três são custo e mexem nas linhas do DRE. Não entram junto numa
--   migration cujo objetivo é o bruto — ficam medidas acima pra decidir à
--   parte, com o número na mão.
--
-- ⚠️ CREATE OR REPLACE, sem DROP. A assinatura não muda (mesmas 19 colunas de
-- retorno), então dá pra substituir o corpo sem derrubar a função. Importa:
-- a 0239 documenta que DROP APAGA OS GRANTS, e função `security definer`
-- aberta pro anônimo é o P0 que já voltou duas vezes aqui (0083 e 0151).
-- Sem DROP, os grants ficam como estão e não há janela de erro.

create or replace function public.ifood_financeiro_resumo_by_units(
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
    -- ↓ ÚNICA MUDANÇA (1/2): `and lc.unit_id is null` — fora o pedido cancelado.
    coalesce(round(sum(l.valor) filter (where l.fato_gerador = 'Venda'
      and l.descricao_lancamento = 'Taxa entrega iFood'
      and lc.unit_id is null)::numeric, 2), 0),
    coalesce(round(sum(l.valor) filter (where l.fato_gerador = 'Venda'
      and l.descricao_lancamento in ('Taxa de transação','Taxa de transação iFood beneficios'))::numeric, 2), 0),
    -- ↓ ÚNICA MUDANÇA (2/2): idem pra taxa de serviço.
    coalesce(round(sum(l.valor) filter (where l.fato_gerador = 'Venda'
      and l.descricao_lancamento = 'Taxa de serviço iFood cobrada do cliente'
      and lc.unit_id is null)::numeric, 2), 0),
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
  -- Join por LINHA (não por unidade): marca se aquele pedido foi cancelado.
  -- `cancelados` é distinct em (unit_id, pedido), então a cardinalidade é 0 ou
  -- 1 e nenhuma linha se multiplica — o resto dos agregados não muda.
  left join cancelados lc on lc.unit_id = l.unit_id
    and lc.pedido_associado_ifood = l.pedido_associado_ifood
  where l.unit_id = any(p_unit_ids) and l.ref_year = p_year and l.ref_month = p_month
    and (p_start_date is null or l.data_fato_gerador::date >= p_start_date)
    and (p_end_date is null or l.data_fato_gerador::date <= p_end_date)
  group by l.unit_id, b.bruto;
$function$;
