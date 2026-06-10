--------------------------------------------------------------------
-- 0056_ifood_bruto_cesta.sql
--
-- Corrige o "bruto" (Valor das vendas) da RPC financeira do iFood.
--
-- Antes: bruto = soma de "Entrada Financeira" (crédito líquido) → dava
--   R$ 172.191 vs R$ 181.429 na tela do iFood.
-- Agora: bruto = "Valor dos itens" do iFood = soma da cesta (valor dos
--   itens) por pedido de Venda, EXCLUINDO pedidos com cancelamento total.
--   Bate no centavo com a tela ("Valor dos itens" = R$ 180.801,13).
--
-- Como os lançamentos crus já estão no banco, basta trocar a função —
-- a tela atualiza sozinha, SEM reimportar.
--
-- Como rodar: Supabase → SQL Editor → cole tudo → Run.
--------------------------------------------------------------------

create or replace function public.ifood_financeiro_resumo_by_units(
  p_unit_ids uuid[],
  p_year integer,
  p_month integer
)
returns table (
  unit_id                 uuid,
  pedidos_unicos          integer,
  bruto                   numeric,
  comissao_ifood          numeric,
  taxa_entrega            numeric,
  taxa_transacao          numeric,
  taxa_servico_cliente    numeric,
  promocao_loja           numeric,
  promocao_ifood          numeric,
  pacote_anuncios         numeric,
  ressarcimentos          numeric,
  cancelamento_total_qtd  integer,
  cancelamento_parcial_qtd integer,
  perda_cancelamento      numeric,
  liquido                 numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with vendas_cesta as (
    -- 1 cesta (valor dos itens) por pedido de Venda, fora os cancelados totais
    select
      v.unit_id,
      v.pedido_associado_ifood,
      max(v.valor_cesta_final) as cesta
    from public.ifood_financeiro_lancamentos v
    where v.unit_id = any(p_unit_ids)
      and v.ref_year = p_year
      and v.ref_month = p_month
      and v.fato_gerador = 'Venda'
      and v.pedido_associado_ifood is not null
      and v.valor_cesta_final is not null
      and not exists (
        select 1
        from public.ifood_financeiro_lancamentos ct
        where ct.unit_id = v.unit_id
          and ct.ref_year = p_year
          and ct.ref_month = p_month
          and ct.fato_gerador = 'Cancelamento Total'
          and ct.pedido_associado_ifood = v.pedido_associado_ifood
      )
    group by v.unit_id, v.pedido_associado_ifood
  ),
  bruto_por_unit as (
    select unit_id, coalesce(round(sum(cesta)::numeric, 2), 0) as bruto
    from vendas_cesta
    group by unit_id
  )
  select
    l.unit_id,
    count(distinct l.pedido_associado_ifood) filter (
      where l.fato_gerador in ('Venda', 'Cancelamento Total', 'Cancelamento Parcial')
        and l.pedido_associado_ifood is not null
    )::integer as pedidos_unicos,

    -- Bruto = Valor dos itens (cesta) do iFood
    coalesce(b.bruto, 0) as bruto,

    coalesce(round(sum(l.valor) filter (
      where l.fato_gerador = 'Venda'
        and l.descricao_lancamento in (
          'Comissão do iFood (entrega iFood)',
          'Comissão do iFood'
        )
    )::numeric, 2), 0) as comissao_ifood,

    coalesce(round(sum(l.valor) filter (
      where l.fato_gerador = 'Venda'
        and l.descricao_lancamento = 'Taxa entrega iFood'
    )::numeric, 2), 0) as taxa_entrega,

    coalesce(round(sum(l.valor) filter (
      where l.fato_gerador = 'Venda'
        and l.descricao_lancamento in (
          'Taxa de transação',
          'Taxa de transação iFood beneficios'
        )
    )::numeric, 2), 0) as taxa_transacao,

    coalesce(round(sum(l.valor) filter (
      where l.fato_gerador = 'Venda'
        and l.descricao_lancamento = 'Taxa de serviço iFood cobrada do cliente'
    )::numeric, 2), 0) as taxa_servico_cliente,

    coalesce(round(sum(l.valor) filter (
      where l.fato_gerador = 'Venda'
        and l.descricao_lancamento in (
          'Promoção custeada pela loja',
          'Promoção custeada pela loja no delivery'
        )
    )::numeric, 2), 0) as promocao_loja,

    coalesce(round(sum(l.valor) filter (
      where l.fato_gerador = 'Venda'
        and l.descricao_lancamento = 'Promoção custeada pelo iFood'
    )::numeric, 2), 0) as promocao_ifood,

    coalesce(round(sum(l.valor) filter (
      where l.descricao_lancamento = 'Pacote de anúncios'
    )::numeric, 2), 0) as pacote_anuncios,

    coalesce(round(sum(l.valor) filter (
      where l.descricao_lancamento = 'Ressarcimento de pedido cancelado'
    )::numeric, 2), 0) as ressarcimentos,

    count(distinct l.pedido_associado_ifood) filter (
      where l.fato_gerador = 'Cancelamento Total'
        and l.pedido_associado_ifood is not null
    )::integer as cancelamento_total_qtd,

    count(distinct l.pedido_associado_ifood) filter (
      where l.fato_gerador = 'Cancelamento Parcial'
        and l.pedido_associado_ifood is not null
    )::integer as cancelamento_parcial_qtd,

    coalesce(round(sum(l.valor) filter (
      where l.fato_gerador = 'Cancelamento Total'
        and l.impacto_no_repasse = true
    )::numeric, 2), 0) as perda_cancelamento,

    coalesce(round(sum(l.valor) filter (
      where l.impacto_no_repasse = true
    )::numeric, 2), 0) as liquido

  from public.ifood_financeiro_lancamentos l
  left join bruto_por_unit b on b.unit_id = l.unit_id
  where l.unit_id = any(p_unit_ids)
    and l.ref_year = p_year
    and l.ref_month = p_month
  group by l.unit_id, b.bruto;
$$;

comment on function public.ifood_financeiro_resumo_by_units is
  'Agregação financeira por unidade. bruto = Valor das vendas do iFood (cesta dos itens, sem cancelamento total).';
